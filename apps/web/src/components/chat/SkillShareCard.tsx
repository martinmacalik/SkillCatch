import { useState } from 'react'
import { Check, Plus } from 'lucide-react'
import type { Message, SkillShareMetadata } from '@/lib/chat-queries'
import { STATUS_OPTIONS } from '@/pages/skills/skillStatus'
import { colorForIndex } from '@/pages/skills/types'

interface Props {
  message: Message
  mine: boolean
  hasSkill: boolean // the viewer already has this skill in their profile
  onAdd: () => Promise<void>
}

// A shared skill: the sender's progress as it was when they shared it.
// The add button is for the others; the sender already has the skill.
export function SkillShareCard({ message, mine, hasSkill, onAdd }: Props) {
  const meta = message.metadata as SkillShareMetadata
  const [opening, setOpening] = useState(false)
  const status = STATUS_OPTIONS.find(o => o.key === meta.status)
  // the skill was deleted since → the snapshot stays, but it can't be added
  const available = message.skill_node_id !== null

  const add = async () => {
    setOpening(true)
    try { await onAdd() } finally { setOpening(false) }
  }

  return (
    <div className={`w-64 overflow-hidden rounded-2xl bg-white text-gray-900 shadow-sm ${mine ? 'rounded-br-md' : 'rounded-bl-md'}`}>
      <div className="relative h-20">
        {meta.image_url ? (
          <img src={meta.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className={`h-full w-full ${colorForIndex(meta.name.length)}`} />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-black/70 to-transparent" />
        {status && (
          <span className={`absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide shadow-sm ${status.active}`}>
            {status.label}
          </span>
        )}
        <p className="absolute bottom-2 left-3 right-3 truncate text-base font-semibold text-white">{meta.name}</p>
      </div>

      <div className="flex flex-col gap-2.5 p-3 text-xs">
        {meta.level && (
          <div className="flex items-center justify-between gap-3">
            <span className="truncate font-medium text-gray-700">{meta.level.name}</span>
            {/* one dot per level, filled up to mine */}
            <span className="flex shrink-0 gap-0.5" title={`Level ${meta.level.rank} of ${meta.level.total}`}>
              {Array.from({ length: meta.level.total }, (_, i) => (
                <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < meta.level!.rank ? 'bg-purple-600' : 'bg-gray-200'}`} />
              ))}
            </span>
          </div>
        )}

        {meta.progress && (
          <div>
            <div className="mb-1 flex justify-between text-gray-500">
              <span>Progress</span>
              <span className="font-medium text-gray-700">{meta.progress.done}/{meta.progress.total}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-linear-to-r from-indigo-600 to-fuchsia-600"
                style={{ width: `${(meta.progress.done / meta.progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {meta.attributes.length > 0 && (
          <dl className="flex flex-col gap-1">
            {meta.attributes.map(a => (
              <div key={a.label} className="flex justify-between gap-3">
                <dt className="text-gray-500">{a.label}</dt>
                <dd className="truncate text-right font-medium text-gray-700">{formatValue(a.value, a.unit)}</dd>
              </div>
            ))}
          </dl>
        )}

        {!mine && (
          hasSkill ? (
            <p className="flex items-center justify-center gap-1 rounded-full bg-gray-100 py-1.5 font-medium text-gray-500">
              <Check className="h-3.5 w-3.5" /> In your skills
            </p>
          ) : available ? (
            <button
              onClick={e => { e.stopPropagation(); void add() }}
              disabled={opening}
              className="flex items-center justify-center gap-1 rounded-full bg-gray-900 py-1.5 font-medium text-white transition hover:bg-gray-700 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add skill
            </button>
          ) : (
            <p className="text-center text-gray-400">This skill is no longer available.</p>
          )
        )}
      </div>
    </div>
  )
}

// value_json from the add-skill form: text, number, yes/no or a list
function formatValue(value: unknown, unit: string | null): string {
  const text =
    Array.isArray(value) ? value.join(', ')
    : typeof value === 'boolean' ? (value ? 'Yes' : 'No')
    : String(value ?? '')
  return unit ? `${text} ${unit}` : text
}
