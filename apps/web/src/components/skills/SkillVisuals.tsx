import { BadgeCheck, GraduationCap } from 'lucide-react'
import { STATUS_OPTIONS } from '@/pages/skills/skillStatus'

// Small pieces of a skill card, shared by the chat card (SkillShareCard)
// and the profile blocks (skill list, spotlight).

// one dot per level, filled up to mine
export function LevelDots({ rank, total, size = 'sm' }: { rank: number; total: number; size?: 'sm' | 'md' }) {
  const dot = size === 'md' ? 'h-2 w-2' : 'h-1.5 w-1.5'
  return (
    <span className="flex shrink-0 gap-0.5" title={`Level ${rank} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`${dot} rounded-full ${i < rank ? 'bg-purple-600' : 'bg-gray-200'}`} />
      ))}
    </span>
  )
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
      <div
        className="h-full rounded-full bg-linear-to-r from-indigo-600 to-fuchsia-600"
        style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
      />
    </div>
  )
}

export function StatusPill({ status, className = '' }: { status: string; className?: string }) {
  const option = STATUS_OPTIONS.find(o => o.key === status)
  if (!option) return null
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide shadow-sm ${option.active} ${className}`}>
      {option.label}
    </span>
  )
}

// "✓ Teaches · verified": an approved skill on the teacher license
export function TeachesBadge({ level, verified }: { level: string; verified: boolean }) {
  return (
    <span
      title={`Teaches this skill (${level})${verified ? ', verified educator' : ''}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
    >
      {verified ? <BadgeCheck className="h-3.5 w-3.5" /> : <GraduationCap className="h-3.5 w-3.5" />}
      Teaches{verified && <span className="text-emerald-600/80">· verified</span>}
    </span>
  )
}
