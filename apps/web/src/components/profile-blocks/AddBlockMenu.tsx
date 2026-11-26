import { useEffect } from 'react'
import type { BlockType } from '@/lib/profile-blocks'
import { BLOCK_TYPES } from './registry'
import { useDropUp } from './useDropUp'

interface Props {
  allowed: (type: BlockType) => boolean // e.g. no spotlight into a row that already has 2 blocks
  onPick: (type: BlockType) => void
  onClose: () => void
  align?: 'left' | 'right' // which edge lines up with the + button
}

// Wide and short: the block types sit side by side as tiles (description on hover),
// so the menu fits below the + almost always; if not, it opens above it.
export function AddBlockMenu({ allowed, onPick, onClose, align = 'left' }: Props) {
  const [up, attach, rootRef] = useDropUp(120)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose()
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose, rootRef])

  return (
    <div
      ref={attach}
      className={`absolute z-30 flex gap-1 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl ${
        align === 'left' ? 'left-0' : 'right-0'
      } ${up ? 'bottom-full mb-1' : 'top-full mt-1'}`}
    >
      {BLOCK_TYPES.map(({ type, label, description, icon: Icon }) => {
        const ok = allowed(type)
        return (
          <button
            key={type}
            disabled={!ok}
            onClick={() => { onPick(type); onClose() }}
            title={ok ? description : 'Not enough space in this row'}
            className="flex w-20 flex-col items-center gap-1.5 rounded-lg px-1 py-2 text-center transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600">
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-xs font-medium leading-tight text-gray-700">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
