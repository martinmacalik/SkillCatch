import { ExternalLink } from 'lucide-react'

interface Resource {
  title?: string
  url?: string
  description?: string
}

export function ResourceListBlock({ content }: { content: Record<string, unknown> }) {
  const items = (content.items as Resource[]) ?? []
  if (items.length === 0) return null
  return (
    <ul className="flex flex-col gap-2">
      {items.map((it, i) => (
        <li key={i}>
          <a
            href={it.url}
            target="_blank"
            rel="noreferrer"
            className="group flex items-start gap-3 rounded-xl p-4"
          >
            <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 group-hover:text-black" />
            <div>
              <p className="font-medium text-black underline decoration-gray-300 underline-offset-2">{it.title ?? it.url}</p>
              {it.description && (
                <p className="mt-0.5 text-xs text-gray-500">{it.description}</p>
              )}
            </div>
          </a>
        </li>
      ))}
    </ul>
  )
}
