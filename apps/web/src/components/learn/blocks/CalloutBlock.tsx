const TONE_STYLES: Record<string, string> = {
  tip:     'border-blue-200 bg-blue-50 text-blue-900',
  warning: 'border-pink-200 bg-pink-50 text-pink-900',
  note:    'border-gray-200 bg-gray-50 text-gray-800',
}

export function CalloutBlock({ content }: { content: Record<string, unknown> }) {
  const tone = (content.tone as string) ?? 'note'
  const cls = TONE_STYLES[tone] ?? TONE_STYLES.note
  const text = (content.text as string) ?? ''
  return (
    <div className={`rounded-2xl border px-5 py-4 ${cls}`}>
      <p className="text-sm leading-relaxed">{text}</p>
    </div>
  )
}
