import { Lightbulb, AlertTriangle, Info } from 'lucide-react'

const TONE_CONFIG: Record<string, {
  Icon: typeof Lightbulb
  iconClass: string
  textClass: string
}> = {
  tip:     { Icon: Lightbulb,     iconClass: 'text-amber-300',  textClass: 'text-amber-200'  },
  warning: { Icon: AlertTriangle, iconClass: 'text-orange-300', textClass: 'text-orange-200' },
  note:    { Icon: Info,          iconClass: 'text-gray-400',   textClass: 'text-gray-300'   },
}

export function CalloutBlock({ content }: { content: Record<string, unknown> }) {
  const tone = (content.tone as string) ?? 'note'
  const { Icon, iconClass, textClass } = TONE_CONFIG[tone] ?? TONE_CONFIG.note
  const text = (content.text as string) ?? ''

  return (
    <div className="w-fit rounded-full bg-gray-800 px-5 py-2.5">
      <div className="flex items-center gap-2.5">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${iconClass}`} />
        <p className={`text-sm leading-relaxed ${textClass}`}>{text}</p>
      </div>
    </div>
  )
}
