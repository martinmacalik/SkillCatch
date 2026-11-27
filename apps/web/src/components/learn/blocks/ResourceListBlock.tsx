import { asList, asText } from '../content'
import { ExternalLink } from 'lucide-react'
import { normalizeUrl } from '@/lib/links'

interface Resource {
  title: string
  url: string
  description: string
}

export function ResourceListBlock({ content }: { content: Record<string, unknown> }) {
  // empty rows from the editor are skipped; only http(s) links become clickable (never javascript:)
  const items: Resource[] = asList(content.items)
    .map(it => ({ title: asText(it.title), url: asText(it.url), description: asText(it.description) }))
    .filter(it => it.title.trim() || it.url.trim())
  if (items.length === 0) return null
  return (
    <ul className="flex flex-col gap-2">
      {items.map((it, i) => (
        <li key={i}>
          <a
            href={normalizeUrl(it.url) ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="group flex items-start gap-3 rounded-xl p-4"
          >
            <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 group-hover:text-black" />
            <div>
              <p className="font-medium text-black underline decoration-gray-300 underline-offset-2">{it.title.trim() || it.url}</p>
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
