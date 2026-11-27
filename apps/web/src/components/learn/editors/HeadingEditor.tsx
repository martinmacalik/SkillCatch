import { useState } from 'react'
import { cn } from '@/lib/cn'
import { str, type EditorProps } from './types'

// same sizes as HeadingBlock, so editing looks like reading
const SIZE = { 1: 'text-3xl font-bold tracking-tight', 2: 'text-2xl font-bold tracking-tight', 3: 'text-xl font-semibold' } as const

export function HeadingEditor({ content, onChange, autoFocus }: EditorProps) {
  const level = ([1, 2, 3].includes(content.level as number) ? content.level : 2) as 1 | 2 | 3
  // local copy while typing; saved on blur
  const [text, setText] = useState(() => str(content.text))

  return (
    <div className="flex items-center gap-3">
      <input
        autoFocus={autoFocus}
        value={text}
        onChange={e => setText(e.target.value.slice(0, 200))}
        onBlur={() => { if (text !== content.text) onChange({ ...content, text }) }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        placeholder="Heading"
        className={cn('min-w-0 flex-1 bg-transparent text-black outline-none placeholder:text-gray-300', SIZE[level])}
      />
      <div className="flex shrink-0 rounded-lg bg-gray-100 p-0.5">
        {([1, 2, 3] as const).map(l => (
          <button
            key={l}
            type="button"
            onClick={() => onChange({ ...content, text, level: l })}
            className={cn(
              'rounded-md px-2 py-0.5 text-xs font-semibold transition',
              level === l ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-gray-700',
            )}
          >
            H{l}
          </button>
        ))}
      </div>
    </div>
  )
}
