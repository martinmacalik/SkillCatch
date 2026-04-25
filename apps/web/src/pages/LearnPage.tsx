import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getUserLearningSkills, type UserLearningSkill } from '@/lib/learn-queries'

function nodeOf(s: UserLearningSkill) {
  return Array.isArray(s.skill_nodes) ? s.skill_nodes[0] : s.skill_nodes
}

export default function LearnPage() {
  const [items, setItems] = useState<UserLearningSkill[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getUserLearningSkills().then(d => {
      setItems(d)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-black" />
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-black">Learn</h1>
      <p className="mt-0.5 text-sm text-gray-500">
        Skills currently in your <span className="font-medium text-blue-700">Learning</span> column.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {items.map(item => {
          const node = nodeOf(item)
          if (!node) return null
          return (
            <Link
              key={item.skill_node_id}
              to={`/skills/${node.slug}/learn`}
              className="group flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-5 transition hover:border-black"
            >
              <div>
                <p className="font-semibold text-black">{node.name}</p>
                <p className="mt-0.5 text-xs text-gray-400">Learning</p>
              </div>
              <span className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-500 group-hover:border-black group-hover:text-black">
                Open Learn page
              </span>
            </Link>
          )
        })}
        {items.length === 0 && (
          <p className="rounded-2xl border border-dashed border-gray-200 p-12 text-center text-sm text-gray-400">
            No skills in your Learning column yet. Move a skill into "Learning" from the Skills page, or tap "Add to Learn" on a skill page.
          </p>
        )}
      </div>
    </div>
  )
}
