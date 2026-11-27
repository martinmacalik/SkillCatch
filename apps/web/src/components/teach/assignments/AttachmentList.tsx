import { useEffect, useState } from 'react'
import { ExternalLink, FileText, Link2, Music, X } from 'lucide-react'
import { hostOf, normalizeUrl, youtubeId } from '@/lib/links'
import { signedTeachUrls, type Attachment } from '@/lib/teach-assignments-queries'

/**
 * Files come from a PRIVATE bucket → signed URLs (valid 1 h), fetched once per list.
 * onRemove: shown in editors (×), omitted for read-only lists.
 */
export function AttachmentList({ items, onRemove }: { items: Attachment[]; onRemove?: (index: number) => void }) {
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const paths = items.flatMap(a => (a.kind === 'file' ? [a.path] : []))
  const key = paths.join('|')

  useEffect(() => {
    if (!key) return
    let alive = true
    void signedTeachUrls(key.split('|')).then(m => { if (alive) setUrls(m) })
    return () => { alive = false }
  }, [key])

  if (items.length === 0) return null

  const images = items.map((a, i) => ({ a, i })).filter(({ a }) => a.kind === 'file' && a.mime.startsWith('image/'))
  const others = items.map((a, i) => ({ a, i })).filter(({ a }) => !(a.kind === 'file' && a.mime.startsWith('image/')))

  return (
    <div className="flex flex-col gap-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map(({ a, i }) => {
            const url = a.kind === 'file' ? urls.get(a.path) : undefined
            return (
              <div key={i} className="relative">
                <a href={url} target="_blank" rel="noreferrer" className="block h-24 w-24 overflow-hidden rounded-xl bg-gray-100">
                  {url && <img src={url} alt={a.kind === 'file' ? a.name : ''} className="h-full w-full object-cover" />}
                </a>
                {onRemove && <RemoveButton onClick={() => onRemove(i)} />}
              </div>
            )
          })}
        </div>
      )}
      {others.map(({ a, i }) => (
        <div key={i} className="relative">
          <Item a={a} url={a.kind === 'file' ? urls.get(a.path) : undefined} />
          {onRemove && <RemoveButton onClick={() => onRemove(i)} />}
        </div>
      ))}
    </div>
  )
}

function Item({ a, url }: { a: Attachment; url?: string }) {
  const chip = 'flex items-center gap-2.5 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700'

  if (a.kind === 'link') {
    // checked again at render: stored data must never become a javascript: href
    const safe = normalizeUrl(a.url)
    if (!safe) return null
    const yt = youtubeId(safe)
    if (yt) {
      return (
        <div className="aspect-video w-full max-w-md overflow-hidden rounded-xl bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${yt}`}
            title={a.title || 'YouTube video'}
            className="h-full w-full"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )
    }
    return (
      <a href={safe} target="_blank" rel="noreferrer noopener" className={`${chip} pr-8 transition hover:bg-gray-100`}>
        <Link2 className="h-4 w-4 shrink-0 text-gray-400" />
        <span className="min-w-0 flex-1 truncate">{a.title || hostOf(safe)}</span>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-gray-300" />
      </a>
    )
  }

  if (a.mime.startsWith('audio/')) {
    return (
      <div className={`${chip} flex-col items-stretch pr-8`}>
        <span className="flex items-center gap-2 truncate">
          <Music className="h-4 w-4 shrink-0 text-gray-400" /> {a.name}
        </span>
        {url && <audio controls src={url} className="h-9 w-full" />}
      </div>
    )
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className={`${chip} pr-8 transition hover:bg-gray-100`}>
      <FileText className="h-4 w-4 shrink-0 text-gray-400" />
      <span className="min-w-0 flex-1 truncate">{a.name}</span>
      <span className="shrink-0 text-xs text-gray-400">{formatSize(a.size)}</span>
    </a>
  )
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Remove"
      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-gray-500 shadow-sm transition hover:bg-red-50 hover:text-red-600"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  )
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
