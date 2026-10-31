import { useEffect, useRef, useState } from 'react'
import { Bell, CheckCircle2, XCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '@/hooks/useNotifications'
import type { AppNotification } from '@/lib/notification-queries'

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString()
}

export function NotificationsBell() {
  const navigate = useNavigate()
  const { items, unreadCount, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  // unread at the moment the popup opened — they stay highlighted while it's open
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set())
  const rootRef = useRef<HTMLDivElement>(null)

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    setFreshIds(new Set(items.filter(n => !n.read_at).map(n => n.id)))
    setOpen(true)
    void markAllRead()
  }

  // close on click outside / Escape
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const goToSkill = (name?: string | null) => {
    setOpen(false)
    // SkillsPage opens "Add Skills" with this search prefilled
    navigate('/dashboard/skills', name ? { state: { addQuery: name } } : undefined)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={toggle}
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 transition hover:bg-gray-300"
        title="Notifications"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
      >
        <Bell className="h-4 w-4 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
          <p className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">Notifications</p>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">Nothing here yet.</p>
            ) : (
              items.map(n => (
                <NotificationRow key={n.id} n={n} fresh={freshIds.has(n.id)} onGoToSkill={goToSkill} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function NotificationRow({
  n,
  fresh,
  onGoToSkill,
}: {
  n: AppNotification
  fresh: boolean
  onGoToSkill: (name?: string | null) => void
}) {
  return (
    <div className={`flex gap-3 border-b border-gray-50 px-4 py-3 last:border-b-0 ${fresh ? 'bg-purple-50/60' : ''}`}>
      {n.type === 'skill_approved' ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
      ) : (
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
      )}
      <div className="min-w-0 flex-1">
        {n.type === 'skill_approved' ? (
          <>
            <p className="text-sm text-gray-900">
              Your skill <span className="font-semibold">{n.data.skill_name}</span> was approved.
            </p>
            <p className="mt-0.5 text-xs text-gray-500">Everyone can find and add it now.</p>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-900">
              Your skill <span className="font-semibold">{n.data.skill_name}</span> was rejected.
            </p>
            <p className="mt-0.5 text-xs text-gray-500">Reason: {n.data.reason}</p>
            {n.data.duplicate_of_name && (
              <button
                onClick={() => onGoToSkill(n.data.duplicate_of_name)}
                className="mt-1.5 text-xs font-semibold text-purple-700 hover:underline"
              >
                Add “{n.data.duplicate_of_name}” instead →
              </button>
            )}
          </>
        )}
        <p className="mt-1 text-[11px] text-gray-400">{timeAgo(n.created_at)}</p>
      </div>
    </div>
  )
}
