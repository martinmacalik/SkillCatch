import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

// open dialogs, innermost last: Escape closes only the top one (edit form over the detail)
const stack: symbol[] = []

/** Centered dialog: closes on Escape and on a click on the backdrop. */
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const me = Symbol('modal')
    stack.push(me)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && stack[stack.length - 1] === me) onClose() }
    document.addEventListener('keydown', onKey)
    // the page behind doesn't scroll while the dialog is open
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      stack.splice(stack.indexOf(me), 1)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/30 p-4" onMouseDown={onClose}>
      <div
        onMouseDown={e => e.stopPropagation()}
        className={cn(
          'flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-xl',
          wide ? 'max-w-5xl' : 'max-w-xl',
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3.5">
          <div className="min-w-0 flex-1 text-base font-semibold text-gray-900">{title}</div>
          <button onClick={onClose} className="rounded-full p-1.5 text-gray-500 transition hover:bg-gray-100" title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
