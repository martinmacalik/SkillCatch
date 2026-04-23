import { useRef, useState } from 'react'
import { uploadAvatar, removeAvatar, AvatarUploadError } from '../../lib/avatarUpload'

interface Props {
  userId: string
  currentUrl: string | null
  onChange: (newUrl: string | null) => void
}

export function AvatarUploader({ userId, currentUrl, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [brokenImage, setBrokenImage] = useState(false)

  const handleFile = async (file: File) => {
    setBusy(true)
    setErr(null)
    try {
      const url = await uploadAvatar(userId, file, currentUrl)
      setBrokenImage(false)
      onChange(url)
    } catch (e) {
      setErr(e instanceof AvatarUploadError ? e.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async () => {
    setBusy(true)
    setErr(null)
    try {
      await removeAvatar(userId, currentUrl)
      onChange(null)
    } catch (e) {
      setErr(e instanceof AvatarUploadError ? e.message : 'Remove failed.')
    } finally {
      setBusy(false)
    }
  }

  const showImage = currentUrl && !brokenImage

  return (
    <div className="flex items-center gap-5">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-purple-300 to-indigo-400">
        {showImage && (
          <img
            src={currentUrl}
            alt="Avatar"
            className="h-full w-full object-cover"
            onError={() => setBrokenImage(true)}
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-xl bg-purple-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-800 disabled:opacity-60"
          >
            {busy ? 'Working…' : 'Upload new'}
          </button>
          <button
            type="button"
            disabled={busy || !currentUrl}
            onClick={handleRemove}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60"
          >
            Remove
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleFile(f)
              e.target.value = ''
            }}
          />
        </div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <p className="text-xs text-gray-400">JPEG, PNG, or WebP — up to 2 MB.</p>
      </div>
    </div>
  )
}
