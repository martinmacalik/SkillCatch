import { useState } from 'react'
import { AlertTriangle, Info, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/cn'
import { AutoTextarea } from './AutoTextarea'
import { str, type EditorProps } from './types'

// mirrors CalloutBlock's tones
const TONES = [
  { tone: 'tip', label: 'Tip', Icon: Lightbulb, icon: 'text-amber-300', text: 'text-amber-200' },
  { tone: 'warning', label: 'Warning', Icon: AlertTriangle, icon: 'text-orange-300', text: 'text-orange-200' },
  { tone: 'note', label: 'Note', Icon: Info, icon: 'text-gray-400', text: 'text-gray-300' },
] as const

export function CalloutEditor({ content, onChange, autoFocus }: EditorProps) {
  const t = TONES.find(x => x.tone === content.tone) ?? TONES[0]
  const [text, setText] = useState(() => str(content.text))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex w-full max-w-xl items-start gap-2.5 rounded-3xl bg-gray-800 px-5 py-2.5">
        <t.Icon className={cn('mt-1 h-3.5 w-3.5 shrink-0', t.icon)} />
        <AutoTextarea
          autoFocus={autoFocus}
          value={text}
          onChange={e => setText(e.target.value.slice(0, 1000))}
          onBlur={() => { if (text !== content.text) onChange({ ...content, text }) }}
          placeholder="Tip, warning or note…"
          className={cn('w-full bg-transparent text-sm leading-relaxed outline-none placeholder:text-gray-500', t.text)}
        />
      </div>
      <div className="flex gap-1">
        {TONES.map(x => (
          <button
            key={x.tone}
            type="button"
            onClick={() => onChange({ ...content, text, tone: x.tone })}
            className={cn(
              'flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium transition',
              x.tone === t.tone ? 'bg-gray-900 text-white' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700',
            )}
          >
            <x.Icon className="h-3 w-3" /> {x.label}
          </button>
        ))}
      </div>
    </div>
  )
}
