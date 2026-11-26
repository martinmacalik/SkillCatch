import { supabase } from './supabaseClient'
import { emitAppEvent } from './app-events'

const MAX_DIM = 512
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

export class AvatarUploadError extends Error {}

export async function resizeToBlob(file: File, maxDim: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new AvatarUploadError('Canvas 2D context unavailable.')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new AvatarUploadError('Canvas toBlob failed.'))),
      'image/webp',
      0.9,
    )
  })
}

async function tryDeletePrior(userId: string, priorUrl: string | null) {
  if (!priorUrl) return
  const marker = `/storage/v1/object/public/avatars/${userId}/`
  const idx = priorUrl.indexOf(marker)
  if (idx === -1) return
  const objectPath = `${userId}/${priorUrl.slice(idx + marker.length)}`
  await supabase.storage.from('avatars').remove([objectPath])
}

// validate + resize + upload into the user's folder; returns the object path
// (also used for group photos, see chat-queries.ts)
export async function uploadToAvatars(userId: string, file: File, maxDim = MAX_DIM): Promise<string> {
  if (file.size > MAX_BYTES) {
    throw new AvatarUploadError('File is larger than 2 MB.')
  }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new AvatarUploadError('Only JPEG, PNG, or WebP images are allowed.')
  }

  const blob = await resizeToBlob(file, maxDim)
  const objectName = `${userId}/${crypto.randomUUID()}.webp`

  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(objectName, blob, { contentType: 'image/webp', upsert: false })
  if (uploadErr) throw new AvatarUploadError(uploadErr.message)
  return objectName
}

export async function uploadAvatar(
  userId: string,
  file: File,
  priorUrl: string | null,
): Promise<string> {
  const objectName = await uploadToAvatars(userId, file)

  const { data } = supabase.storage.from('avatars').getPublicUrl(objectName)
  const publicUrl = data.publicUrl

  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (updateErr) throw new AvatarUploadError(updateErr.message)
  emitAppEvent('profile:refresh') // TopBar shows the new photo right away

  await tryDeletePrior(userId, priorUrl)
  return publicUrl
}

// Profile page banner: same bucket + folder as the avatar, just a wider resize
const BANNER_MAX_DIM = 1600

export async function uploadBanner(userId: string, file: File, priorUrl: string | null): Promise<string> {
  const objectName = await uploadToAvatars(userId, file, BANNER_MAX_DIM)
  const publicUrl = supabase.storage.from('avatars').getPublicUrl(objectName).data.publicUrl

  const { error } = await supabase
    .from('profiles')
    .update({ banner_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw new AvatarUploadError(error.message)

  await tryDeletePrior(userId, priorUrl)
  return publicUrl
}

export async function removeBanner(userId: string, priorUrl: string | null) {
  const { error } = await supabase
    .from('profiles')
    .update({ banner_url: null, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw new AvatarUploadError(error.message)
  await tryDeletePrior(userId, priorUrl)
}

export async function removeAvatar(userId: string, priorUrl: string | null) {
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: null, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw new AvatarUploadError(error.message)
  emitAppEvent('profile:refresh')
  await tryDeletePrior(userId, priorUrl)
}
