import { useState } from 'react'
import { Clock, Plus, Wrench } from 'lucide-react'

import { cn } from '@/lib/cn'
import { addApprovedProof, removeApprovedProof, setProofPublic } from '@/lib/license-queries'
import type { OpenSubmission } from '@/lib/license-queries'
import {
  LEVEL_LABELS,
  type LicenseEvidence,
  type LicenseSkill,
  type TeacherLicense,
} from '@/types/teaching'
import { AddEvidenceForm, EvidenceRow } from '../SkillProofEditor'

interface LicenseSkillsPanelProps {
  userId: string
  /** Approved license (null while the first one waits for review). */
  live: TeacherLicense | null
  open: OpenSubmission | null
  /** Opens the license editor (fixing a left-out skill goes through review). */
  onEdit: () => void
  /** Reload after a proof was added / removed. */
  onChanged: () => Promise<void>
}

type SkillState = 'approved' | 'rejected' | 'resubmitted' | 'in_review'

const STATE_CHIP: Record<SkillState, { label: string; className: string }> = {
  approved: { label: 'On license', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Not approved', className: 'bg-red-100 text-red-700' },
  resubmitted: { label: 'In review', className: 'bg-amber-100 text-amber-700' },
  in_review: { label: 'In review', className: 'bg-amber-100 text-amber-700' },
}

/**
 * Under the license card: every skill with its proofs and review result.
 *   on license   → proofs managed right here, no review
 *   not approved → shown only here (not on the card); fix it through an edit
 */
export function LicenseSkillsPanel({
  userId,
  live,
  open,
  onEdit,
  onChanged,
}: LicenseSkillsPanelProps) {
  const pendingSkillIds = new Set(
    open?.status === 'pending' ? open.license.skills.map((s) => s.skillNodeId) : [],
  )

  // before the first approval there is nothing live yet: show the submitted skills
  const rows: { skill: LicenseSkill; state: SkillState }[] = live
    ? live.skills
        .map((skill) => ({
          skill,
          state: (skill.status === 'rejected'
            ? pendingSkillIds.has(skill.skillNodeId)
              ? 'resubmitted'
              : 'rejected'
            : 'approved') as SkillState,
        }))
        // left-out skills last
        .sort((a, b) => Number(a.state !== 'approved') - Number(b.state !== 'approved'))
    : (open?.license.skills ?? []).map((skill) => ({ skill, state: 'in_review' as SkillState }))

  if (rows.length === 0) return null
  const approvedCount = rows.filter((r) => r.state === 'approved').length

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">Skills &amp; proofs</h3>
        {live && (
          <span className="text-xs text-gray-400">
            {approvedCount} of {rows.length} on license
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-3">
        {rows.map(({ skill, state }) => (
          <SkillRow
            key={skill.id}
            userId={userId}
            skill={skill}
            state={state}
            onEdit={onEdit}
            onChanged={onChanged}
          />
        ))}
      </ul>
    </section>
  )
}

function SkillRow({
  userId,
  skill,
  state,
  onEdit,
  onChanged,
}: {
  userId: string
  skill: LicenseSkill
  state: SkillState
  onEdit: () => void
  onChanged: () => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editable = state === 'approved'
  const chip = STATE_CHIP[state]

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await onChanged()
      return true
    } catch (err) {
      const msg = (err as { message?: unknown } | null)?.message
      setError(typeof msg === 'string' && msg ? msg : 'Something went wrong.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const add = async (ev: LicenseEvidence) => {
    const ok = await run(() => addApprovedProof(userId, skill.id, ev))
    if (ok) setAdding(false)
    if (ev.url.startsWith('blob:')) URL.revokeObjectURL(ev.url)
  }

  const isLast = skill.evidence.length <= 1

  return (
    <li
      className={cn(
        'rounded-xl border p-3',
        state === 'rejected' ? 'border-red-200 bg-red-50/40' : 'border-gray-100',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{skill.skillName}</p>
          <p className="text-xs text-gray-400">{LEVEL_LABELS[skill.level]}</p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
            chip.className,
          )}
        >
          {chip.label}
        </span>
      </div>

      {state === 'rejected' && (
        <div className="mt-2 flex flex-col gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-red-100">
          <p className="text-xs text-red-700">
            Not on your license{skill.rejectionReason ? `: ${skill.rejectionReason}` : '.'} The rest
            of your license stays valid.
          </p>
          <button
            type="button"
            onClick={onEdit}
            className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-purple-800"
          >
            <Wrench className="h-3.5 w-3.5" />
            Fix proof &amp; resubmit
          </button>
        </div>
      )}
      {state === 'resubmitted' && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          Your fix is waiting for review. The rest of your license stays valid.
        </p>
      )}

      {skill.evidence.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {skill.evidence.map((ev) => (
            <EvidenceRow
              key={ev.id}
              evidence={ev}
              onRemove={editable ? () => void run(() => removeApprovedProof(ev.id)) : undefined}
              removeDisabled={busy || isLast}
              visibility={
                editable
                  ? {
                      onToggle: () => void run(() => setProofPublic(ev.id, !ev.isPublic)),
                      disabled: busy,
                    }
                  : undefined
              }
              removeTitle={
                isLast ? 'A skill on your license needs at least one proof.' : 'Remove proof'
              }
            />
          ))}
        </ul>
      )}

      {editable &&
        (adding ? (
          <AddEvidenceForm
            licenseSkillId={skill.id}
            createPreviewUrl={(file) => URL.createObjectURL(file)}
            onAdd={(ev) => void add(ev)}
            onCancel={() => {
              setAdding(false)
              setError(null)
            }}
            busy={busy}
            externalError={error}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-2 flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-purple-700 transition-colors hover:bg-purple-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add proof
          </button>
        ))}

      {error && !adding && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </li>
  )
}
