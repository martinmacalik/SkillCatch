import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ExternalLink, Globe, Link2 } from 'lucide-react'
import { hostOf, normalizeUrl, youtubeId } from '@/lib/profile-blocks'
import { useBlocks, type BlockProps } from '../BlocksContext'

// YouTube → player (youtube-nocookie, no tracking cookies until you press play).
// Anything else → a link card. Other sites never go into an iframe.
export function EmbedBlock({ block, onChange }: BlockProps) {
  const { editable, autoFocusId } = useBlocks()
  const { kind, title } = block.data
  // data comes from the client → re-check on render (no javascript: links)
  const url = block.data.url ? normalizeUrl(block.data.url) ?? undefined : undefined
  const [editing, setEditing] = useState(!url)

  if (!url || (editable && editing)) {
    if (!editable) return null
    return (
      <LinkForm
        initial={url ?? ''}
        autoFocus={autoFocusId === block.id || !!url}
        onCancel={url ? () => setEditing(false) : undefined}
        onSubmit={next => {
          const id = youtubeId(next)
          onChange(id ? { kind: 'youtube', url: next } : { kind: 'link', url: next, title: hostOf(next) })
          setEditing(false)
        }}
      />
    )
  }

  const id = kind === 'youtube' ? youtubeId(url) : null

  return (
    <div className="group/embed relative">
      {id ? (
        <div className="aspect-video overflow-hidden rounded-2xl bg-gray-100">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}`}
            title="YouTube video"
            className="h-full w-full"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </div>
      ) : editable ? (
        <LinkCard url={url}>
          <TitleInput value={title ?? ''} fallback={hostOf(url)} onSave={t => onChange({ ...block.data, title: t })} />
        </LinkCard>
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="block transition hover:opacity-90">
          <LinkCard url={url}>
            <p className="truncate font-medium text-gray-900">{title || hostOf(url)}</p>
          </LinkCard>
        </a>
      )}

      {editable && (
        <button
          onClick={() => setEditing(true)}
          className="absolute bottom-3 right-3 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-gray-700 opacity-0 shadow-sm transition hover:bg-white group-hover/embed:opacity-100"
        >
          Change link
        </button>
      )}
    </div>
  )
}

function LinkCard({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-400">
        <Globe className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        {children}
        <p className="flex items-center gap-1 truncate text-xs text-gray-400">
          {hostOf(url)} <ExternalLink className="h-3 w-3" />
        </p>
      </div>
    </div>
  )
}

function TitleInput({ value, fallback, onSave }: { value: string; fallback: string; onSave: (t: string) => void }) {
  const [text, setText] = useState(value)
  return (
    <input
      value={text}
      onChange={e => setText(e.target.value.slice(0, 120))}
      onBlur={() => {
        const next = text.trim() || fallback
        setText(next)
        if (next !== value) onSave(next)
      }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      placeholder="Title"
      className="w-full bg-transparent font-medium text-gray-900 outline-none placeholder:text-gray-300"
    />
  )
}

function LinkForm({ initial, autoFocus, onSubmit, onCancel }: {
  initial: string
  autoFocus: boolean
  onSubmit: (url: string) => void
  onCancel?: () => void
}) {
  const [text, setText] = useState(initial)
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const url = normalizeUrl(text)
    if (!url) { setError(true); return }
    onSubmit(url)
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border-2 border-dashed border-gray-200 p-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 shrink-0 text-gray-400" />
        <input
          ref={inputRef}
          value={text}
          onChange={e => { setText(e.target.value); setError(false) }}
          onKeyDown={e => { if (e.key === 'Escape') onCancel?.() }}
          placeholder="Paste a YouTube or web link…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
        />
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-700">
            Cancel
          </button>
        )}
        <button type="submit" className="rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white transition hover:bg-gray-700">
          Embed
        </button>
      </div>
      {error && <p className="mt-1 pl-6 text-xs text-red-500">That doesn't look like a link.</p>}
    </form>
  )
}
