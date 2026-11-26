import { useState } from 'react'
import { Check, Pencil, Plus, Sparkles } from 'lucide-react'
import type { ProfileSkill } from '@/lib/profile-blocks'
import { colorForIndex } from '@/pages/skills/types'
import { LevelDots, TeachesBadge } from '@/components/skills/SkillVisuals'
import { useBlocks, type BlockProps } from '../BlocksContext'
import { SkillPicker } from '../SkillPicker'

// Compact list of the skills I picked, in my order. No time here (only the spotlight shows it).
export function SkillListBlock({ block, onChange }: BlockProps) {
  const { editable, ownerId, skills } = useBlocks()
  const [picking, setPicking] = useState(false)
  const [title, setTitle] = useState(block.data.title ?? '')
  const ids = block.data.skill_ids ?? []
  // a skill removed from my profile since (or not loaded yet) is just left out
  const rows = ids.map(id => skills.get(id)).filter((s): s is ProfileSkill => !!s)

  return (
    <div className="relative rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        {editable ? (
          <input
            value={title}
            onChange={e => setTitle(e.target.value.slice(0, 60))}
            onBlur={() => {
              const next = title.trim() || undefined
              if (next !== block.data.title) onChange({ ...block.data, title: next })
            }}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            placeholder="Skills"
            className="min-w-0 flex-1 bg-transparent text-base font-semibold text-gray-900 outline-none placeholder:text-gray-900"
          />
        ) : (
          <h3 className="flex-1 text-base font-semibold text-gray-900">{block.data.title || 'Skills'}</h3>
        )}
        {editable && rows.length > 0 && (
          <button
            onClick={() => setPicking(true)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        )}
      </div>

      {rows.length === 0 && editable && picking ? (
        // empty list: the search opens inside the block instead of a dropdown
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-2">
          <SkillPicker
            inline
            ownerId={ownerId}
            mode="multi"
            selected={ids}
            onSave={next => { if (next.join() !== ids.join()) onChange({ ...block.data, skill_ids: next }) }}
            onClose={() => setPicking(false)}
          />
        </div>
      ) : rows.length === 0 && editable ? (
        <button
          onClick={() => setPicking(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-6 text-sm text-gray-400 transition hover:border-gray-300 hover:text-gray-600"
        >
          <Sparkles className="h-4 w-4" /> Choose skills
        </button>
      ) : (
        <ul className="flex flex-col">
          {rows.map(s => <SkillRow key={s.id} skill={s} />)}
        </ul>
      )}

      {picking && rows.length > 0 && (
        <SkillPicker
          ownerId={ownerId}
          mode="multi"
          selected={ids}
          onSave={next => {
            if (next.join() !== ids.join()) onChange({ ...block.data, skill_ids: next })
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}

function SkillRow({ skill }: { skill: ProfileSkill }) {
  const { editable, mySkillIds, onAddSkill } = useBlocks()
  const canAdd = !editable && !!onAddSkill
  const has = mySkillIds?.has(skill.id)

  return (
    <li className="group/row flex items-center gap-3 border-t border-gray-50 py-2 first:border-t-0">
      {skill.image_url ? (
        <img src={skill.image_url} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className={`h-8 w-8 shrink-0 rounded-lg ${colorForIndex(skill.name.length)}`} />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{skill.name}</p>
        {skill.level && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="truncate">{skill.level.name}</span>
            <LevelDots rank={skill.level.rank} total={skill.level.total} />
          </div>
        )}
      </div>
      {skill.teaches && <TeachesBadge level={skill.teaches.level} verified={skill.teaches.verified} />}
      {canAdd && (
        has ? (
          <span title="In your skills" className="text-gray-300"><Check className="h-4 w-4" /></span>
        ) : (
          <button
            onClick={() => onAddSkill!(skill.id)}
            title="Add to my skills"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 opacity-0 transition hover:bg-gray-900 hover:text-white group-hover/row:opacity-100"
          >
            <Plus className="h-4 w-4" />
          </button>
        )
      )}
    </li>
  )
}
