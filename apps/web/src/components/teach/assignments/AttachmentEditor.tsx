import { useRef, useState } from 'react'
import { Link2, Loader2, Paperclip } from 'lucide-react'
import { normalizeUrl } from '@/lib/links'
import {
  TEACH_FILE_ACCEPT,
  TEACH_FILE_MAX,
  TEACH_MAX_ATTACHMENTS,
  type Attachment,
} from '@/lib/teach-assignments-queries'
import { AttachmentList } from './AttachmentList'

interface Props {
  items: Attachment[]
  onChange: (items: Attachment[]) => void
  /** uploads into the right folder ({assignment}/teacher or {assignment}/{student}) */
  upload: (file: File) => Promise<Attachment>
  disabled?: boolean
  /** true while files are uploading: the parent disables its Save / Submit */
  onBusyChange?: (busy: boolean) => void
}

/** Files + links for an assignment or a submission (max 10). */
export function AttachmentEditor({ items, onChange, upload, disabled, onBusyChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [linking, setLinking] = useState(false)
  const [link, setLink] = useState('')
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const full = items.length + uploading >= TEACH_MAX_ATTACHMENTS
  // while files upload, `items` is a snapshot the upload will extend → no other edits meanwhile
  const locked = disabled || uploading > 0

  const pickFiles = async (files: FileList | null) => {
    if (!files) return
    setError(null)
    const room = TEACH_MAX_ATTACHMENTS - items.length
    const list = [...files].slice(0, room)
    for (const f of list) {
      if (f.size > TEACH_FILE_MAX) {
        setError(`${f.name} is larger than 15 MB.`)
        return
      }
    }
    setUploading(n => n + list.length)
    onBusyChange?.(true)
    const added: Attachment[] = []
    for (const f of list) {
      try {
        added.push(await upload(f))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed.')
      } finally {
        setUploading(n => n - 1)
      }
    }
    onBusyChange?.(false)
    if (added.length) onChange([...items, ...added])
  }

  const addLink = () => {
    const url = normalizeUrl(link)
    if (!url) {
      setError('That doesn’t look like a web link.')
      return
    }
    setError(null)
    onChange([...items, { kind: 'link', url }])
    setLink('')
    setLinking(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <AttachmentList items={items} onRemove={locked ? undefined : i => onChange(items.filter((_, j) => j !== i))} />

      {linking && (
        <div className="flex gap-2">
          <input
            autoFocus
            value={link}
            onChange={e => setLink(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); addLink() }
              if (e.key === 'Escape') setLinking(false)
            }}
            placeholder="Paste a link (YouTube, a website…)"
            className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400"
          />
          <button type="button" onClick={addLink} className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-700">
            Add
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={TEACH_FILE_ACCEPT}
          className="hidden"
          onChange={e => { void pickFiles(e.target.files); e.target.value = '' }}
        />
        <button
          type="button"
          disabled={locked || full}
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-40"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
          {uploading ? 'Uploading…' : 'Add file'}
        </button>
        <button
          type="button"
          disabled={locked || full}
          onClick={() => setLinking(true)}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-40"
        >
          <Link2 className="h-3.5 w-3.5" /> Add link
        </button>
        <span className="text-[11px] text-gray-400">Images, PDF, audio up to 15 MB · videos as a link</span>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

