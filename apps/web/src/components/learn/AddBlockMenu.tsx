import { useEffect, useRef, useState } from 'react'
import { Plus, Heading, Type, Lightbulb, ListChecks, Layers, Link2 } from 'lucide-react'
import type { BlockType } from '@/lib/learn-queries'

const BLOCK_OPTIONS: { type: BlockType; label: string; description: string; Icon: typeof Plus }[] = [
  { type: 'heading',       label: 'Heading',     description: 'Section title — appears in the navigation', Icon: Heading },
  { type: 'text',          label: 'Text',        description: 'A paragraph of body copy',                   Icon: Type },
  { type: 'callout',       label: 'Callout',     description: 'Highlighted tip, warning, or note',          Icon: Lightbulb },
  { type: 'resource_list', label: 'Resources',   description: 'List of external links',                     Icon: Link2 },
  { type: 'flashcards',    label: 'Flashcards',  description: 'Front/back cards for memorization',          Icon: Layers },
  { type: 'checklist',     label: 'Checklist',   description: 'Steps to complete',                          Icon: ListChecks },
]

export function AddBlockMenu({ onAdd }: { onAdd: (type: BlockType) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Click outside closes the menu.
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`group flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed transition ${
          open
            ? 'border-black bg-gray-50 text-black'
            : 'border-gray-300 text-gray-400 hover:border-black hover:text-black'
        }`}
      >
        <Plus className={`h-5 w-5 transition-transform duration-200 ${open ? 'rotate-45' : 'group-hover:rotate-90'}`} />
        <span className="text-sm font-medium">Add block</span>
      </button>

      {/* Dropdown — fades + scales up from button center. */}
      <div
        className={`absolute left-1/2 top-full z-30 mt-2 w-80 -translate-x-1/2 origin-top rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl transition-all duration-150 ${
          open
            ? 'pointer-events-auto scale-100 opacity-100'
            : 'pointer-events-none scale-95 opacity-0'
        }`}
      >
        {BLOCK_OPTIONS.map(opt => (
          <button
            key={opt.type}
            onClick={() => { onAdd(opt.type); setOpen(false) }}
            className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-gray-50"
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
              <opt.Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-black">{opt.label}</p>
              <p className="truncate text-xs text-gray-400">{opt.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
