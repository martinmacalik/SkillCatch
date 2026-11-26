import { useRef, useState, type ChangeEvent } from 'react'
import { ImagePlus } from 'lucide-react'
import {
  CAPTION_MAX,
  profileImageUrl,
  removeProfileImage,
  uploadProfileImage,
} from '@/lib/profile-blocks'
import { useBlocks, type BlockProps } from '../BlocksContext'

export function ImageBlock({ block, onChange }: BlockProps) {
  const { editable, ownerId } = useBlocks()
  const [caption, setCaption] = useState(block.data.caption ?? '')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { path } = block.data

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const newPath = await uploadProfileImage(ownerId, file)
      onChange({ ...block.data, path: newPath })
      if (path) void removeProfileImage(path) // replaced → old file goes
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const remove = () => {
    if (path) void removeProfileImage(path)
    onChange({ caption: block.data.caption })
  }

  const saveCaption = () => {
    const next = caption.trim() || undefined
    if (next !== block.data.caption) onChange({ ...block.data, caption: next })
  }

  if (!editable) {
    if (!path) return null
    return (
      <figure>
        <img src={profileImageUrl(path)} alt={block.data.caption ?? ''} className="max-h-[480px] w-full rounded-2xl object-cover" />
        {block.data.caption && <figcaption className="mt-2 text-center text-sm text-gray-400">{block.data.caption}</figcaption>}
      </figure>
    )
  }

  return (
    <figure>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
      {path ? (
        <div className="group/img relative">
          <img src={profileImageUrl(path)} alt="" className="max-h-[480px] w-full rounded-2xl object-cover" />
          <div className="absolute bottom-3 right-3 flex gap-1 opacity-0 transition group-hover/img:opacity-100">
            <button onClick={() => fileRef.current?.click()} className="rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-white">
              {uploading ? 'Uploading…' : 'Change'}
            </button>
            <button onClick={remove} className="rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-white">
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 text-sm text-gray-400 transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-600"
        >
          <ImagePlus className="h-6 w-6" />
          {uploading ? 'Uploading…' : 'Upload image'}
        </button>
      )}
      {path && (
        <input
          value={caption}
          onChange={e => setCaption(e.target.value.slice(0, CAPTION_MAX))}
          onBlur={saveCaption}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          placeholder="Add a caption…"
          className="mt-2 w-full bg-transparent text-center text-sm text-gray-400 outline-none placeholder:text-gray-300"
        />
      )}
      {error && <p className="mt-1 text-center text-xs text-red-500">{error}</p>}
    </figure>
  )
}
