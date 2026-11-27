import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { addRowClass, removeRowClass, same, str, type EditorProps } from './types'

interface Item { text: string; done: boolean }

const toItems = (v: unknown): Item[] =>
  Array.isArray(v) && v.length
    ? v.map(x => ({ text: str((x as Item)?.text), done: !!(x as Item)?.done }))
    : [{ text: '', done: false }]

/**
 * Keyboard like a todo list: Enter = new step below, Backspace in an empty step
 * = delete it and jump to the previous one.
 */
export function ChecklistEditor({ content, onChange, autoFocus }: EditorProps) {
  const [items, setItems] = useState(() => toItems(content.items))
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  // which row gets the cursor after the next render (the row didn't exist yet when we decided)
  const focusNext = useRef<number | null>(autoFocus ? 0 : null)

  useEffect(() => {
    if (focusNext.current === null) return
    inputs.current[focusNext.current]?.focus()
    focusNext.current = null
  })

  const save = (next: Item[]) => { if (!same(next, content.items)) onChange({ ...content, items: next }) }
  const setText = (i: number, text: string) => setItems(prev => prev.map((it, j) => (j === i ? { ...it, text } : it)))

  // structural changes save right away (blur of the old input may not fire for a removed row)
  const insertAfter = (i: number) => {
    const next = [...items.slice(0, i + 1), { text: '', done: false }, ...items.slice(i + 1)]
    setItems(next)
    save(next)
    focusNext.current = i + 1
  }
  const remove = (i: number) => {
    const next = items.length > 1 ? items.filter((_, j) => j !== i) : [{ text: '', done: false }]
    setItems(next)
    save(next)
    focusNext.current = Math.max(0, i - 1)
  }

  return (
    <div className="flex flex-col gap-1.5">
      {items.map((it, i) => (
        <div key={i} className="group/item flex items-center gap-3">
          <span className="inline-flex h-4 w-4 shrink-0 rounded border border-gray-300" />
          <input
            ref={el => { inputs.current[i] = el }}
            value={it.text}
            onChange={e => setText(i, e.target.value.slice(0, 300))}
            onBlur={() => save(items)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); insertAfter(i) }
              if (e.key === 'Backspace' && it.text === '' && items.length > 1) { e.preventDefault(); remove(i) }
            }}
            placeholder="Step"
            className="min-w-0 flex-1 bg-transparent text-gray-800 outline-none placeholder:text-gray-300"
          />
          <button type="button" onClick={() => remove(i)} title="Remove step" className={removeRowClass}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => insertAfter(items.length - 1)} className={addRowClass}>
        <Plus className="h-3.5 w-3.5" /> Add step
      </button>
    </div>
  )
}
