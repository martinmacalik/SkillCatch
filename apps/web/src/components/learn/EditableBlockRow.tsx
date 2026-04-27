import { useState } from 'react'
import { Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import type { LearningBlock } from '@/lib/learn-queries'
import { LearningBlockRenderer } from './LearningBlockRenderer'

// In edit mode, each block is rendered inline (so the editor sees what readers
// will see) and can be expanded into a JSON editor for content changes.
//
// MVP: JSON textarea per block. Per-type structured forms are postponed.
export function EditableBlockRow({
  block,
  onChange,
  onDelete,
}: {
  block: LearningBlock
  onChange: (content: Record<string, unknown>) => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="group relative rounded-2xl transition hover:bg-gray-50">
      <div className="px-4 py-3">
        <LearningBlockRenderer block={block} />
      </div>

      {/* Hover toolbar */}
      <div className="pointer-events-none absolute right-3 top-3 flex gap-1 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-gray-400 shadow-sm hover:text-black"
          aria-label={expanded ? 'Collapse editor' : 'Expand editor'}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <button
          onClick={onDelete}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-gray-400 shadow-sm hover:text-pink-600"
          aria-label="Delete block"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Inline JSON editor */}
      {expanded && (
        <div className="mx-4 mb-3 rounded-xl border border-gray-200 bg-white p-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
            {block.type}
          </p>
          <textarea
            defaultValue={JSON.stringify(block.content, null, 2)}
            onBlur={e => {
              try {
                onChange(JSON.parse(e.target.value))
                setError(null)
              } catch {
                setError('Invalid JSON — fix and tab out again to save.')
              }
            }}
            rows={6}
            spellCheck={false}
            className="w-full resize-y rounded-lg bg-gray-50 p-3 font-mono text-xs outline-none focus:bg-white"
          />
          {error && <p className="mt-2 text-xs text-pink-600">{error}</p>}
        </div>
      )}
    </div>
  )
}
