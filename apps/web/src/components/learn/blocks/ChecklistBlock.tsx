interface Item {
  text: string
  done?: boolean
}

// Read-only renderer. Per-user checked state is intentionally NOT persisted
// in MVP — that's user-specific data and belongs in user_skill_progress later.
export function ChecklistBlock({ content }: { content: Record<string, unknown> }) {
  const items = (content.items as Item[]) ?? []
  if (items.length === 0) return null
  return (
    <ul className="flex flex-col gap-2">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-3">
          <span
            className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
              it.done ? 'border-black bg-black' : 'border-gray-300'
            }`}
          >
            {it.done && <span className="text-[10px] leading-none text-white">✓</span>}
          </span>
          <span className={it.done ? 'text-gray-400 line-through' : 'text-gray-800'}>
            {it.text}
          </span>
        </li>
      ))}
    </ul>
  )
}
