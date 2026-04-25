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
      <h1 className="text-2xl font-bold tracking-tight text-black">Your learning</h1>
      <p className="mt-0.5 text-sm text-gray-500">Skills you're working on.</p>

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
                <p className="mt-0.5 text-xs text-gray-400">
                  {item.status} · {item.progress_percent}%
                </p>
              </div>
              <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full bg-black transition-all"
                  style={{ width: `${item.progress_percent}%` }}
                />
              </div>
            </Link>
          )
        })}
        {items.length === 0 && (
          <p className="rounded-2xl border border-dashed border-gray-200 p-12 text-center text-sm text-gray-400">
            You haven't added any skills to learn yet. Browse skills in Discover and tap "Add to Learn".
          </p>
        )}
      </div>
    </div>
  )
}
