import { supabase } from './supabaseClient'

const MAX_DIM = 512
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

export class AvatarUploadError extends Error {}

async function resizeToBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
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
export async function uploadToAvatars(userId: string, file: File): Promise<string> {
  if (file.size > MAX_BYTES) {
    throw new AvatarUploadError('File is larger than 2 MB.')
  }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new AvatarUploadError('Only JPEG, PNG, or WebP images are allowed.')
  }

  const blob = await resizeToBlob(file)
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

  await tryDeletePrior(userId, priorUrl)
  return publicUrl
}

export async function removeAvatar(userId: string, priorUrl: string | null) {
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: null, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw new AvatarUploadError(error.message)
  await tryDeletePrior(userId, priorUrl)
}
