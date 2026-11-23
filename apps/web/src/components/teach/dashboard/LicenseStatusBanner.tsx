import { useState, type ReactNode } from 'react'
import { Clock, FilePen, XCircle, type LucideIcon } from 'lucide-react'

import type { OpenSubmission, RejectedSubmission } from '@/lib/license-queries'

interface LicenseStatusBannerProps {
  hasLive: boolean
  open: OpenSubmission | null
  rejected: RejectedSubmission | null
  onEdit: () => void
  onSubmitDraft: () => Promise<void>
  onWithdraw: () => Promise<void>
}

/** One line telling the teacher where their license is in the review. */
export function LicenseStatusBanner({ hasLive, open, rejected, onEdit, onSubmitDraft, onWithdraw }: LicenseStatusBannerProps) {
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  if (open?.status === 'pending') {
    return (
      <Banner tone="amber" icon={Clock}>
        <span className="flex-1">
          {open.kind === 'edit'
            ? 'Your changes are waiting for approval. Students see your current license until then.'
            : 'Your license is waiting for approval. We’ll notify you once an admin has looked at it.'}
        </span>
        <button type="button" disabled={busy} onClick={() => void run(onWithdraw)} className={linkBtn}>
          Withdraw
        </button>
      </Banner>
    )
  }

  if (open?.status === 'draft') {
    return (
      <Banner tone="gray" icon={FilePen}>
        <span className="flex-1">
          {hasLive ? 'You have unsent changes to your license.' : 'Your license is a draft. Submit it to get it approved.'}
        </span>
        <button type="button" onClick={onEdit} className={linkBtn}>
          Continue editing
        </button>
        <button
          type="button"
          disabled={busy || !open.license.skills.every((s) => s.evidence.length > 0)}
          title={open.license.skills.every((s) => s.evidence.length > 0) ? undefined : 'Every skill needs at least one proof.'}
          onClick={() => void run(onSubmitDraft)}
          className="cursor-pointer rounded-lg bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-800 disabled:cursor-not-allowed disabled:bg-purple-300"
        >
          Submit for review
        </button>
      </Banner>
    )
  }

  if (rejected) {
    return (
      <Banner tone="red" icon={XCircle}>
        <span className="flex-1">
          {rejected.kind === 'edit' ? 'Your changes were not approved.' : 'Your license was not approved.'}
          {rejected.reason && <span className="block text-xs opacity-80">Reason: {rejected.reason}</span>}
        </span>
        <button type="button" onClick={onEdit} className={linkBtn}>
          Edit and resubmit
        </button>
      </Banner>
    )
  }

  return null
}

const linkBtn =
  'cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white/70 disabled:opacity-50'

const TONES = {
  amber: 'bg-amber-50 text-amber-800',
  gray: 'bg-white text-gray-700 ring-1 ring-gray-200',
  red: 'bg-red-50 text-red-700',
}

function Banner({ tone, icon: Icon, children }: { tone: keyof typeof TONES; icon: LucideIcon; children: ReactNode }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium ${TONES[tone]}`}>
      <Icon className="h-5 w-5 shrink-0" />
      {children}
    </div>
  )
}
