import { useState } from 'react'
import { AutoTextarea } from './AutoTextarea'
import { str, type EditorProps } from './types'

export function TextEditor({ content, onChange, autoFocus }: EditorProps) {
  const [text, setText] = useState(() => str(content.text))
  return (
    <AutoTextarea
      autoFocus={autoFocus}
      value={text}
      onChange={e => setText(e.target.value.slice(0, 10000))}
      onBlur={() => { if (text !== content.text) onChange({ ...content, text }) }}
      placeholder="Write something…"
      className="w-full bg-transparent leading-relaxed text-gray-800 outline-none placeholder:text-gray-300"
    />
  )
}
