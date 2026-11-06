import { useEffect, useRef } from 'react'
import { X, Coins } from 'lucide-react'
import { BLOCK_INFO } from './blockInfo'

export function EditInfoPanel({
  onClose,
  isSuggestion,
}: {
  onClose: () => void
  isSuggestion: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    // Delay one frame so the opening click doesn't immediately close it.
    const id = window.setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed right-6 top-20 z-50 w-88 rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/8"
      style={{ width: '22rem' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Block types & SkillCoins</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-400">
            Each block you add earns SkillCoins.{' '}
            {isSuggestion
              ? 'Coins are credited once your suggestion is approved by an editor.'
              : 'Coins are credited as soon as you save.'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Block list */}
      <div className="mt-4 flex flex-col gap-1.5">
        {BLOCK_INFO.map(b => (
          <div
            key={b.type}
            className="flex items-start gap-3 rounded-xl bg-gray-50 px-3 py-2.5"
          >
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm text-gray-600">
              <b.Icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-gray-900">{b.label}</p>
              <p className="text-xs leading-relaxed text-gray-400">{b.description}</p>
            </div>
            <div className="shrink-0 flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 mt-0.5">
              <Coins className="h-3 w-3 text-amber-500" />
              <span className="text-xs font-bold text-amber-600">+{b.coins}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-gray-300">
        SkillCoins can be used to unlock mentoring sessions and featured profile placements.
      </p>
    </div>
  )
}
