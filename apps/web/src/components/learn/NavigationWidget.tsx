import type { LearningBlock } from '@/lib/learn-queries'

// Auto-generated table of contents derived from heading blocks on the page.
// Clicking a heading scrolls to its anchor (the rendered block uses its id).
export function NavigationWidget({ blocks }: { blocks: LearningBlock[] }) {
  const headings = blocks
    .filter(b => b.type === 'heading')
    .map(b => ({
      id: b.id,
      level: ((b.content.level as number) ?? 2) as 1 | 2 | 3,
      text: (b.content.text as string) ?? '',
    }))
    .filter(h => h.text.trim().length > 0)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <h3 className="text-base font-bold text-black">Navigation</h3>
      <nav className="mt-4 flex flex-col gap-1.5">
        {headings.length === 0 ? (
          <p className="text-xs text-gray-400">
            Add headings to the page and they'll appear here.
          </p>
        ) : (
          headings.map(h => (
            <a
              key={h.id}
              href={`#${h.id}`}
              className={`truncate text-sm text-gray-600 transition hover:text-black ${
                h.level === 1 ? 'font-semibold' :
                h.level === 2 ? 'pl-3' :
                'pl-6 text-gray-500'
              }`}
            >
              {h.text}
            </a>
          ))
        )}
      </nav>
    </div>
  )
}
