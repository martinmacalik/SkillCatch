export function HeadingBlock({ content }: { content: Record<string, unknown> }) {
  const level = (content.level as 1 | 2 | 3) ?? 2
  const text = (content.text as string) ?? ''
  if (level === 1) {
    return <h2 className="text-3xl font-bold tracking-tight text-black">{text}</h2>
  }
  if (level === 2) {
    return <h3 className="text-2xl font-bold tracking-tight text-black">{text}</h3>
  }
  return <h4 className="text-xl font-semibold text-black">{text}</h4>
}
