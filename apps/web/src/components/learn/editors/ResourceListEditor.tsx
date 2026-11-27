import { useState } from 'react'
import { ExternalLink, Plus, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { normalizeUrl } from '@/lib/links'
import { addRowClass, removeRowClass, same, str, type EditorProps } from './types'

interface Resource { title: string; url: string; description: string }

const empty = (): Resource => ({ title: '', url: '', description: '' })
const toItems = (v: unknown): Resource[] =>
  Array.isArray(v) && v.length
    ? v.map(x => ({ title: str((x as Resource)?.title), url: str((x as Resource)?.url), description: str((x as Resource)?.description) }))
    : [empty()]

export function ResourceListEditor({ content, onChange, autoFocus }: EditorProps) {
  const [items, setItems] = useState(() => toItems(content.items))
  const save = (next: Resource[]) => { if (!same(next, content.items)) onChange({ ...content, items: next }) }
  const set = (i: number, patch: Partial<Resource>) => setItems(prev => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)))

  const add = () => { const next = [...items, empty()]; setItems(next); save(next) }
  const remove = (i: number) => {
    const next = items.length > 1 ? items.filter((_, j) => j !== i) : [empty()]
    setItems(next)
    save(next)
  }

  // "youtube.com/…" → "https://youtube.com/…" when leaving the field; invalid stays as typed (marked red)
  const tidyUrl = (i: number) => {
    const it = items[i]
    const fixed = it.url ? normalizeUrl(it.url) : null
    const next = fixed && fixed !== it.url ? items.map((x, j) => (j === i ? { ...x, url: fixed } : x)) : items
    setItems(next)
    save(next)
  }

  const field = 'w-full bg-transparent outline-none placeholder:text-gray-300'

  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => {
        const bad = !!it.url.trim() && !normalizeUrl(it.url)
        return (
          <div key={i} className="group/item flex items-start gap-3 rounded-xl border border-gray-100 bg-white p-3">
            <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-gray-300" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <input
                autoFocus={autoFocus && i === 0}
                value={it.title}
                onChange={e => set(i, { title: e.target.value.slice(0, 200) })}
                onBlur={() => save(items)}
                placeholder="Title"
                className={cn(field, 'font-medium text-black')}
              />
              <input
                value={it.url}
                onChange={e => set(i, { url: e.target.value.slice(0, 2000) })}
                onBlur={() => tidyUrl(i)}
                placeholder="https://…"
                className={cn(field, 'text-sm', bad ? 'text-pink-600' : 'text-gray-600')}
              />
              {bad && <p className="text-[11px] text-pink-600">This isn’t a valid web link. It won’t be clickable.</p>}
              <input
                value={it.description}
                onChange={e => set(i, { description: e.target.value.slice(0, 300) })}
                onBlur={() => save(items)}
                placeholder="Short description (optional)"
                className={cn(field, 'text-xs text-gray-500')}
              />
            </div>
            <button type="button" onClick={() => remove(i)} title="Remove link" className={removeRowClass}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
      <button type="button" onClick={add} className={addRowClass}>
        <Plus className="h-3.5 w-3.5" /> Add link
      </button>
    </div>
  )
}
