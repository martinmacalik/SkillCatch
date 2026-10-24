import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  title: string        // tooltip of the icon button
  question: string     // what the popup asks
  confirmLabel: string
  danger?: boolean     // red confirm button for destructive actions
  onConfirm: () => Promise<void>
  children: ReactNode  // the icon
}

// Icon button that asks first: a click opens a small popup under it,
// the action only runs after "confirm". Click outside / Esc closes it.
export function ConfirmButton({ title, question, confirmLabel, danger, onConfirm, children }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const confirm = async () => {
    setBusy(true)
    setError(false)
    try {
      await onConfirm()
      setOpen(false)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        title={title}
        onClick={() => { setOpen(o => !o); setError(false) }}
        className={`flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-gray-100 ${
          open ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900'
        }`}
      >
        {children}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-60 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-black/5">
          <p className="text-sm text-gray-700">{question}</p>
          {error && <p className="mt-1 text-xs text-red-500">Something went wrong. Try again.</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setOpen(false)}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={() => void confirm()}
              disabled={busy}
              className={`rounded-full px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50 ${
                danger ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-900 hover:bg-gray-700'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
