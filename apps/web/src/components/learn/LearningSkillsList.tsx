import { useState } from 'react'
import { Pin } from 'lucide-react'
import type { UserLearningSkill, UserSkillStatus } from '@/lib/learn-queries'

function nodeOf(s: UserLearningSkill) {
  return Array.isArray(s.skill_nodes) ? s.skill_nodes[0] : s.skill_nodes
}

const COLUMNS: {
  key: UserSkillStatus
  label: string
  dot: string
  activeBg: string
  activeText: string
  activeCount: string
}[] = [
  { key: 'watchlist', label: 'Watchlist', dot: 'bg-violet-400', activeBg: 'bg-violet-50',  activeText: 'text-violet-700', activeCount: 'text-violet-400' },
  { key: 'learning',  label: 'Learning',  dot: 'bg-blue-400',   activeBg: 'bg-blue-50',    activeText: 'text-blue-700',   activeCount: 'text-blue-400'   },
  { key: 'learned',   label: 'Learned',   dot: 'bg-emerald-400',activeBg: 'bg-emerald-50', activeText: 'text-emerald-700',activeCount: 'text-emerald-400'},
  { key: 'dormant',   label: 'Dormant',   dot: 'bg-slate-400',  activeBg: 'bg-slate-50',   activeText: 'text-slate-600',  activeCount: 'text-slate-400'  },
]

export function LearningSkillsList({
  skills,
  activeId,
  onSelect,
}: {
  skills: UserLearningSkill[]
  activeId: string | null
  onSelect: (skillNodeId: string) => void
}) {
  const [activeColumn, setActiveColumn] = useState<UserSkillStatus>('learning')

  const visible = skills.filter(s => s.status === activeColumn)
  const col = COLUMNS.find(c => c.key === activeColumn)!

  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-bold text-black">Your Skills</h3>

      {/* 2×2 column grid */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {COLUMNS.map(c => {
          const count = skills.filter(s => s.status === c.key).length
          const active = activeColumn === c.key
          return (
            <button
              key={c.key}
              onClick={() => setActiveColumn(c.key)}
              className={`cursor-pointer rounded-xl p-3 text-left transition ${
                active ? c.activeBg : 'bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <div className={`h-1 w-5 rounded-full mb-2 ${c.dot}`} />
              <p className={`text-xs font-semibold ${active ? c.activeText : 'text-gray-500'}`}>
                {c.label}
              </p>
              <p className={`text-xl font-bold mt-0.5 ${active ? c.activeText : 'text-gray-800'}`}>
                {count}
              </p>
            </button>
          )
        })}
      </div>

      {/* Skill list for the selected column */}
      <div className="mt-3 flex flex-1 flex-col gap-1 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="text-xs text-gray-400 mt-1">No skills in this column yet.</p>
        ) : (
          visible.map(s => {
            const node = nodeOf(s)
            if (!node) return null
            const active = s.skill_node_id === activeId
            return (
              <button
                key={s.skill_node_id}
                onClick={() => onSelect(s.skill_node_id)}
                className={`group flex items-center gap-2 rounded-xl px-3 py-2 text-left transition ${
                  active ? 'bg-black text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {s.pinned && (
                  <Pin
                    className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-white' : 'text-blue-600'}`}
                    fill="currentColor"
                  />
                )}
                <span className="truncate text-sm font-medium">{node.name}</span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
