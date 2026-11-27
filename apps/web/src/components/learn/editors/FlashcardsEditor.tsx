import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { AutoTextarea } from './AutoTextarea'
import { addRowClass, removeRowClass, same, str, type EditorProps } from './types'

interface Card { front: string; back: string }

const empty = (): Card => ({ front: '', back: '' })
const toCards = (v: unknown): Card[] =>
  Array.isArray(v) && v.length ? v.map(x => ({ front: str((x as Card)?.front), back: str((x as Card)?.back) })) : [empty()]

/** While editing, the deck is a list of front | back pairs (reading shows one card at a time). */
export function FlashcardsEditor({ content, onChange, autoFocus }: EditorProps) {
  const [cards, setCards] = useState(() => toCards(content.cards))
  const save = (next: Card[]) => { if (!same(next, content.cards)) onChange({ ...content, cards: next }) }
  const set = (i: number, patch: Partial<Card>) => setCards(prev => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  const add = () => { const next = [...cards, empty()]; setCards(next); save(next) }
  const remove = (i: number) => {
    const next = cards.length > 1 ? cards.filter((_, j) => j !== i) : [empty()]
    setCards(next)
    save(next)
  }

  const side = 'w-full rounded-lg bg-gray-50 px-3 py-2 text-sm text-black outline-none placeholder:text-gray-300 focus:bg-white focus:ring-1 focus:ring-gray-200'

  return (
    <div className="flex flex-col gap-2">
      {cards.map((c, i) => (
        <div key={i} className="group/item flex items-start gap-2">
          <span className="mt-2 w-5 shrink-0 text-right text-xs text-gray-300">{i + 1}</span>
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
            <AutoTextarea
              autoFocus={autoFocus && i === 0}
              value={c.front}
              onChange={e => set(i, { front: e.target.value.slice(0, 500) })}
              onBlur={() => save(cards)}
              placeholder="Front"
              className={side}
            />
            <AutoTextarea
              value={c.back}
              onChange={e => set(i, { back: e.target.value.slice(0, 500) })}
              onBlur={() => save(cards)}
              placeholder="Back"
              className={side}
            />
          </div>
          <button type="button" onClick={() => remove(i)} title="Remove card" className={`mt-1.5 ${removeRowClass}`}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className={`${addRowClass} ml-7`}>
        <Plus className="h-3.5 w-3.5" /> Add card
      </button>
    </div>
  )
}
