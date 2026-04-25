export function TextBlock({ content }: { content: Record<string, unknown> }) {
  return (
    <p className="whitespace-pre-wrap leading-relaxed text-gray-800">
      {(content.text as string) ?? ''}
    </p>
  )
}
