import { Pin } from 'lucide-react'
import type { UserLearningSkill } from '@/lib/learn-queries'

function nodeOf(s: UserLearningSkill) {
  return Array.isArray(s.skill_nodes) ? s.skill_nodes[0] : s.skill_nodes
}

// The Learning column overlay — slides in from the right side and covers the
// widget bar. Clicking a row switches the active Learn page.
export function LearningSkillsList({
  skills,
  activeId,
  onSelect,
}: {
  skills: UserLearningSkill[]
  activeId: string | null
  onSelect: (skillNodeId: string) => void
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5">
      <h3 className="text-base font-bold text-black">Learning</h3>
      <p className="mt-0.5 text-xs text-gray-400">
        {skills.length} {skills.length === 1 ? 'skill' : 'skills'} in your column
      </p>

      <div className="mt-4 flex flex-col gap-1.5 overflow-y-auto">
        {skills.length === 0 ? (
          <p className="text-xs text-gray-400">
            Move a skill into "Learning" from the Skills page to see it here.
          </p>
        ) : (
          skills.map(s => {
            const node = nodeOf(s)
            if (!node) return null
            const active = s.skill_node_id === activeId
            return (
              <button
                key={s.skill_node_id}
                onClick={() => onSelect(s.skill_node_id)}
                className={`group flex items-center gap-2 rounded-xl px-3 py-2 text-left transition ${
                  active
                    ? 'bg-black text-white'
                    : 'text-gray-700 hover:bg-gray-100'
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
