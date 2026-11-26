import { useState } from 'react'
import { Check, Clock, Plus, Repeat, Star } from 'lucide-react'
import { formatDuration } from '@/lib/profile-blocks'
import { colorForIndex } from '@/pages/skills/types'
import { LevelDots, ProgressBar, StatusPill, TeachesBadge } from '@/components/skills/SkillVisuals'
import { formatAttrValue } from '@/lib/skill-format'
import { useBlocks, type BlockProps } from '../BlocksContext'
import { SkillPicker } from '../SkillPicker'

// One skill, big, with LIVE data (unlike the chat card, which is a snapshot).
// Time comes only when show_time is on — the RPC doesn't even send it otherwise.
export function SkillSpotlightBlock({ block, onChange }: BlockProps) {
  const { editable, ownerId, skills, mySkillIds, onAddSkill } = useBlocks()
  const [picking, setPicking] = useState(false)
  const skill = block.data.skill_id ? skills.get(block.data.skill_id) : undefined
  const showTime = block.data.show_time !== false

  const picker = (inline: boolean) => picking && (
    <SkillPicker
      inline={inline}
      ownerId={ownerId}
      mode="single"
      selected={block.data.skill_id ? [block.data.skill_id] : []}
      onSave={([id]) => { if (id && id !== block.data.skill_id) onChange({ ...block.data, skill_id: id }) }}
      onClose={() => setPicking(false)}
    />
  )

  if (!skill) {
    if (!editable) return null
    // empty block: the search opens right inside the dashed box (nothing to fall off the screen)
    if (picking) {
      return <div className="h-48 rounded-2xl border-2 border-dashed border-gray-200 p-2">{picker(true)}</div>
    }
    return (
      <button
        onClick={() => setPicking(true)}
        className="flex h-48 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 text-sm text-gray-400 transition hover:border-gray-300 hover:text-gray-600"
      >
        <Star className="h-6 w-6" />
        {block.data.skill_id ? 'Loading…' : 'Choose a skill'}
      </button>
    )
  }

  const has = mySkillIds?.has(skill.id)

  return (
    <div className="relative">
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="relative h-32">
        {skill.image_url ? (
          <img src={skill.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className={`h-full w-full ${colorForIndex(skill.name.length)}`} />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-black/70 to-transparent" />
        <StatusPill status={skill.status} className="absolute right-3 top-3" />
        <p className="absolute bottom-3 left-4 right-4 truncate text-xl font-semibold text-white">{skill.name}</p>
      </div>

      <div className="flex flex-col gap-3 p-4 text-sm">
        {skill.teaches && (
          <div><TeachesBadge level={skill.teaches.level} verified={skill.teaches.verified} /></div>
        )}

        {skill.level && (
          <div className="flex items-center justify-between gap-3">
            <span className="truncate font-medium text-gray-800">{skill.level.name}</span>
            <span className="flex items-center gap-2 text-xs text-gray-400">
              <LevelDots rank={skill.level.rank} total={skill.level.total} size="md" />
              {skill.level.rank}/{skill.level.total}
            </span>
          </div>
        )}

        {skill.progress && (
          <div>
            <div className="mb-1 flex justify-between text-xs text-gray-500">
              <span>Progress</span>
              <span className="font-medium text-gray-700">{skill.progress.done}/{skill.progress.total}</span>
            </div>
            <ProgressBar done={skill.progress.done} total={skill.progress.total} />
          </div>
        )}

        {showTime && skill.time && skill.time.total_seconds > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Clock className="h-3.5 w-3.5" />
            <span className="font-medium text-gray-700">{formatDuration(skill.time.total_seconds)}</span>
            {skill.time.last_30d_seconds > 0 && <span>· {formatDuration(skill.time.last_30d_seconds)} in the last 30 days</span>}
          </div>
        )}

        {skill.attributes.length > 0 && (
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {skill.attributes.map(a => (
              <div key={a.label} className="flex gap-1">
                <dt className="text-gray-500">{a.label}:</dt>
                <dd className="font-medium text-gray-700">{formatAttrValue(a.value, a.unit)}</dd>
              </div>
            ))}
          </dl>
        )}

        {editable ? (
          <div className="flex items-center gap-1 border-t border-gray-50 pt-3">
            <button
              onClick={() => setPicking(true)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <Repeat className="h-3.5 w-3.5" /> Change skill
            </button>
            <button
              onClick={() => onChange({ ...block.data, show_time: !showTime })}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition hover:bg-gray-100 ${showTime ? 'text-gray-700' : 'text-gray-400'}`}
              title="Show how much time you tracked on this skill"
            >
              <Clock className="h-3.5 w-3.5" /> Show time
              <span className={`ml-1 h-3.5 w-6 rounded-full p-0.5 transition ${showTime ? 'bg-gray-900' : 'bg-gray-200'}`}>
                <span className={`block h-2.5 w-2.5 rounded-full bg-white transition ${showTime ? 'translate-x-2.5' : ''}`} />
              </span>
            </button>
          </div>
        ) : onAddSkill && (
          has ? (
            <p className="flex items-center justify-center gap-1 rounded-full bg-gray-100 py-1.5 text-xs font-medium text-gray-500">
              <Check className="h-3.5 w-3.5" /> In your skills
            </p>
          ) : (
            <button
              onClick={() => onAddSkill(skill.id)}
              className="flex items-center justify-center gap-1 rounded-full bg-gray-900 py-1.5 text-xs font-medium text-white transition hover:bg-gray-700"
            >
              <Plus className="h-3.5 w-3.5" /> Add skill
            </button>
          )
        )}
      </div>
    </div>
    {picker(false)}
    </div>
  )
}
