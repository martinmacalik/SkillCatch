import { useState } from 'react'

interface Card {
  front: string
  back: string
}

export function FlashcardsBlock({ content }: { content: Record<string, unknown> }) {
  const cards = (content.cards as Card[]) ?? []
  const [i, setI] = useState(0)
  const [flipped, setFlipped] = useState(false)
  if (cards.length === 0) return null
  const card = cards[i]

  const next = () => { setI(Math.min(cards.length - 1, i + 1)); setFlipped(false) }
  const prev = () => { setI(Math.max(0, i - 1)); setFlipped(false) }

  return (
    <div className="rounded-2xl p-6">
      <button
        onClick={() => setFlipped(f => !f)}
        className="flex min-h-32 w-full cursor-pointer items-center justify-center rounded-xl bg-gray-50 p-6 text-center text-lg font-medium text-black"
      >
        {flipped ? card.back : card.front}
      </button>
      <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
        <span>{i + 1} / {cards.length}</span>
        <div className="flex gap-2">
          <button
            onClick={prev}
            disabled={i === 0}
            className="rounded-lg border border-gray-200 px-3 py-1.5 hover:border-black disabled:opacity-40"
          >
            Prev
          </button>
          <button
            onClick={next}
            disabled={i === cards.length - 1}
            className="rounded-lg border border-gray-200 px-3 py-1.5 hover:border-black disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
