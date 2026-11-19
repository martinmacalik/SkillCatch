import { useRef, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

export interface ComboboxOption {
  key: string
  content: ReactNode
  /** Rendered with a divider above, e.g. "My institution isn't listed". */
  separated?: boolean
}

interface ComboboxListProps {
  listId: string
  optionId: (index: number) => string
  options: ComboboxOption[]
  active: number
  onHover: (index: number) => void
  onPick: (index: number) => void
  /** Shown above the options (loading, "no results"…). */
  status?: ReactNode
}

/** The dropdown panel shared by all comboboxes on the Teach page. */
export function ComboboxList({ listId, optionId, options, active, onHover, onPick, status }: ComboboxListProps) {
  // null until the first event: the very first move only records the position
  const lastPointer = useRef<{ x: number; y: number } | null>(null)
  return (
    <ul
      id={listId}
      role="listbox"
      className="absolute top-full right-0 left-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-xl bg-white p-1 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.18)] ring-1 ring-gray-200"
      // <html> sets a dark scrollbar-color that every element inherits (and that
      // wins over ::-webkit-scrollbar in Chrome), so override it here
      style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(156, 163, 175, 0.5) transparent' }}
    >
      {status && <li className="px-3 py-2 text-sm text-gray-400">{status}</li>}
      {options.map((opt, i) => (
        <li
          key={opt.key}
          id={optionId(i)}
          role="option"
          aria-selected={i === active}
          // keep focus in the input: without this the input blurs, the list
          // closes and the click never lands
          onMouseDown={(e) => e.preventDefault()}
          onMouseMove={(e) => {
            // Only a real pointer move counts. When the list scrolls (e.g. to the
            // selected item) under a resting cursor, the browser fires hover
            // events too, and the highlight would jump to whatever is underneath.
            const last = lastPointer.current
            lastPointer.current = { x: e.clientX, y: e.clientY }
            if (!last || (last.x === e.clientX && last.y === e.clientY)) return
            if (i !== active) onHover(i)
          }}
          onClick={() => onPick(i)}
          className={cn(
            'cursor-pointer rounded-lg px-3 py-2 text-sm text-gray-800',
            i === active && 'bg-purple-50 text-purple-900',
            opt.separated && 'mt-1 border-t border-gray-100',
          )}
        >
          {opt.content}
        </li>
      ))}
    </ul>
  )
}
