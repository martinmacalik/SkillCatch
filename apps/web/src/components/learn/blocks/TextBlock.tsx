import { asText } from '../content'
export function TextBlock({ content }: { content: Record<string, unknown> }) {
  const text = asText(content.text)
  if (!text.trim()) return null
  return (
    <p className="whitespace-pre-wrap leading-relaxed text-gray-800">
      {text}
    </p>
  )
}
