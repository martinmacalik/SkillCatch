import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, Plus, Pin } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthProvider'
import { colorForIndex } from './skills/types'
import type { SkillNode } from './skills/types'
import EditSkillModal from './skills/EditSkillModal'

/* ── helpers ── */

const progressData = [
  { day: 'M', height: 55, color: '#8B5CF6', striped: false },
  { day: 'T', height: 68, color: '#7C3AED', striped: false },
  { day: 'W', height: 78, color: '#EC4899', striped: false },
  { day: 'T', height: 48, color: '#A78BFA', striped: false },
  { day: 'F', height: 42, color: '#C4B5FD', striped: true },
  { day: 'S', height: 38, color: '#C4B5FD', striped: true },
  { day: 'S', height: 28, color: '#C4B5FD', striped: true },
]

const chatContacts = [
  { name: 'Peter Vivaldi', color: '#F9A8D4', time: '14:52', message: 'Good Job!' },
  { name: 'John Beaver', color: '#86EFAC', time: '14:52', message: 'Good Job!' },
  { name: 'Anna Gray', color: '#BAE6FD', time: '14:52', message: 'Good Job!' },
  { name: 'John Steven', color: '#C4B5FD', time: '14:52', message: 'Good Job!' },
]

const stripePattern =
  'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.45) 3px, rgba(255,255,255,0.45) 6px)'

function calcStreak(dates: string[]): number {
  if (!dates.length) return 0
  let streak = 1
  for (let i = 1; i < dates.length; i++) {
    const curr = new Date(dates[i - 1])
    const prev = new Date(dates[i])
    const diff = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24))
    if (diff === 1) streak++
    else break
  }
  return streak
}

/* ── page ── */

export default function DashboardPage() {
  const { session } = useAuth()
  const navigate = useNavigate()

  const [totalSkills, setTotalSkills] = useState(0)
  const [learningCount, setLearningCount] = useState(0)
  const [dayStreak, setDayStreak] = useState(0)
  const [pinnedSkill, setPinnedSkill] = useState<SkillNode | null>(null)
  const [learningSkills, setLearningSkills] = useState<SkillNode[]>([])
  const [editingNode, setEditingNode] = useState<{ node: SkillNode; index: number } | null>(null)

  useEffect(() => {
    if (!session?.user) return
    const userId = session.user.id

    async function fetchDashboard() {
      // 1. All user skills
      const { data: rows } = await supabase
        .from('user_skills')
        .select('*')
        .eq('user_id', userId)

      if (!rows?.length) {
        setTotalSkills(0)
        setLearningCount(0)
        return
      }

      setTotalSkills(rows.length)

      const learning = rows.filter((r: any) => r.status === 'learning')
      setLearningCount(learning.length)

      // 2. Fetch nodes for learning skills + pinned
      const pinned = rows.find((r: any) => r.pinned)
      const relevantIds = [
        ...new Set([
          ...learning.map((r: any) => r.skill_node_id),
          ...(pinned ? [pinned.skill_node_id] : []),
        ]),
      ]

      if (relevantIds.length > 0) {
        const { data: nodes } = await supabase
          .from('skill_nodes')
          .select('*')
          .in('id', relevantIds)

        const nodeMap: Record<string, SkillNode> = {}
        ;(nodes ?? []).forEach((n: SkillNode) => (nodeMap[n.id] = n))

        if (pinned && nodeMap[pinned.skill_node_id]) {
          setPinnedSkill(nodeMap[pinned.skill_node_id])
        }

        setLearningSkills(
          learning
            .filter((r: any) => nodeMap[r.skill_node_id])
            .map((r: any) => nodeMap[r.skill_node_id])
        )
      }

      // 3. Login streak — upsert today, then calculate
      const today = new Date().toISOString().slice(0, 10)
      await supabase
        .from('user_login_days')
        .upsert({ user_id: userId, login_date: today }, { onConflict: 'user_id,login_date' })
        .then(() => {}) // ignore errors if table doesn't exist yet

      const { data: loginDays } = await supabase
        .from('user_login_days')
        .select('login_date')
        .eq('user_id', userId)
        .order('login_date', { ascending: false })

      if (loginDays?.length) {
        setDayStreak(calcStreak(loginDays.map((d: { login_date: string }) => d.login_date)))
      }
    }

    fetchDashboard()
  }, [session])

  return (
    <>
      {editingNode && session?.user && (
        <EditSkillModal
          node={editingNode.node}
          index={editingNode.index}
          userId={session.user.id}
          onSave={() => { setEditingNode(null) }}
          onCancel={() => setEditingNode(null)}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-5">
        {/* ── Header ── */}
        <div className="flex shrink-0 items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="mt-1.5 text-base text-gray-500">
              Plan, prioritize and accomplish your skill.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard/skills')}
              className="flex cursor-pointer items-center gap-2 rounded-xl bg-purple-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-800"
            >
              <Plus className="h-4 w-4" />
              Add skill
            </button>
          </div>
        </div>

        {/* ── Stats Row ── */}
        <div className="grid shrink-0 grid-cols-4 gap-5" style={{ height: 'clamp(120px, calc((100% - 4rem) * 0.25), 180px)' }}>
          {/* Total Skills – accent card */}
          <div className="flex h-full flex-col justify-between rounded-2xl bg-gradient-to-br from-indigo-900 to-fuchsia-700 p-6 text-white">
            <div className="flex items-start justify-between">
              <p className="text-m font-medium text-purple-100">Total Skills</p>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
                <ArrowUpRight className="h-5 w-5" />
              </span>
            </div>
            <div className="flex items-end gap-2">
              <p className="text-6xl font-medium leading-none">{totalSkills}</p>
            </div>
            <p className="text-m text-purple-200">Skills tracked</p>
          </div>

          <StatCard title="Day Streak" value={String(dayStreak)} badgeLabel="Consecutive login days" />
          <StatCard title="Skills Learning" value={String(learningCount)} badgeLabel="Currently in progress" />
          <StatCard title="New Chats" value="0" badgeLabel="Coming soon" />
        </div>

        {/* ── Rows 2 & 3 Combined – Custom Asymmetric Grid ── */}
        <div
          className="grid flex-1 grid-cols-6 gap-5"
          style={{ gridTemplateRows: '4fr 1fr 1fr 4fr' }}
        >
          {/* Learning Progress: rows 1-2, cols 1-3 */}
          <div className="col-span-3 col-start-1 row-start-1 flex flex-col rounded-2xl bg-white p-6" style={{ gridRow: '1 / 3' }}>
            <h3 className="text-base font-semibold text-gray-900">Learning Progress</h3>
            <div className="flex flex-1 items-end justify-around gap-3 px-2 pb-4">
              {progressData.map((bar, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <div
                    className="w-16 rounded-t-full transition-all"
                    style={{
                      height: `${bar.height}%`,
                      backgroundColor: bar.color,
                      backgroundImage: bar.striped ? stripePattern : 'none',
                    }}
                  />
                  <span className="text-sm font-semibold text-purple-500">{bar.day}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Reminders: rows 1-2, cols 4-5 */}
          <div className="col-span-2 col-start-4 flex flex-col rounded-2xl bg-white p-6" style={{ gridRow: '1 / 3' }}>
            <h3 className="text-base font-semibold text-gray-900">Reminders</h3>
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-gray-400">No reminders yet</p>
            </div>
          </div>

          {/* Skills Learning: rows 1-3, col 6 */}
          <div className="col-span-1 col-start-6 flex flex-col rounded-2xl bg-white p-6" style={{ gridRow: '1 / 4' }}>
            <h3 className="mb-3 text-base font-semibold text-gray-900">Skills Learning</h3>
            {learningSkills.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-sm text-gray-400">No active skills</p>
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                {learningSkills.map((node, i) => (
                  <button
                    key={node.id}
                    onClick={() => setEditingNode({ node, index: i })}
                    className="flex cursor-pointer items-center gap-2.5 rounded-xl p-2 text-left transition hover:bg-gray-50"
                  >
                    {node.image_url ? (
                      <img src={node.image_url} alt={node.name} className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className={`h-8 w-8 shrink-0 rounded-lg ${colorForIndex(i)}`} />
                    )}
                    <span className="truncate text-sm font-medium text-gray-900">{node.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Chats: rows 3-4, cols 1-2 */}
          <div className="col-span-2 col-start-1 flex flex-col rounded-2xl bg-white p-6" style={{ gridRow: '3 / 5' }}>
            <div className="flex shrink-0 items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Chats</h3>
              <button className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-200">
                Edit
              </button>
            </div>

            <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
              {chatContacts.map((contact) => (
                <div
                  key={contact.name}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-gray-50"
                >
                  <div
                    className="h-11 w-11 shrink-0 rounded-full"
                    style={{ backgroundColor: contact.color }}
                  />
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{contact.name}</span>
                    <span className="rounded-md bg-green-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                      {contact.time}
                    </span>
                    <span className="truncate text-xs text-gray-400">{contact.message}</span>
                  </div>
                  <Pin className="h-4 w-4 shrink-0 text-gray-300" />
                </div>
              ))}
            </div>
          </div>

          {/* Pinned Skill: rows 3-4, cols 3-5 */}
          <div className="col-span-3 col-start-3 flex flex-col rounded-2xl bg-white p-6" style={{ gridRow: '3 / 5' }}>
            <h3 className="mb-3 text-base font-semibold text-gray-900">Pinned Skill</h3>
            {pinnedSkill ? (
              <button
                onClick={() => setEditingNode({ node: pinnedSkill, index: 0 })}
                className="flex flex-1 cursor-pointer items-center gap-5 rounded-2xl p-2 text-left transition hover:bg-gray-50"
              >
                {pinnedSkill.image_url ? (
                  <img
                    src={pinnedSkill.image_url}
                    alt={pinnedSkill.name}
                    className="h-28 w-44 shrink-0 rounded-2xl object-cover"
                  />
                ) : (
                  <div className={`h-28 w-44 shrink-0 rounded-2xl ${colorForIndex(0)}`} />
                )}
                <div>
                  <p className="text-xl font-semibold text-gray-900">{pinnedSkill.name}</p>
                  <p className="mt-1 text-sm text-gray-400">Pinned to your dashboard</p>
                </div>
              </button>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-sm text-gray-400">
                  Pin a skill from your Skills Overview to see it here
                </p>
              </div>
            )}
          </div>

          {/* Time Tracker: row 4 only, col 6 */}
          <div className="col-span-1 col-start-6 flex flex-col justify-end rounded-2xl bg-gradient-to-br from-indigo-900 to-fuchsia-700 p-6" style={{ gridRow: '4 / 5' }}>
            <p className="text-2xl font-bold text-white">Time Tracker</p>
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Sub-components ── */

function StatCard({
  title,
  value,
  badgeLabel,
}: {
  title: string
  value: string
  badgeLabel: string
}) {
  return (
    <div className="flex h-full flex-col justify-between rounded-2xl bg-white p-6">
      <div className="flex items-start justify-between">
        <p className="text-m font-medium text-gray-500">{title}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100">
          <ArrowUpRight className="h-5 w-5 text-gray-400" />
        </span>
      </div>
      <p className="text-6xl font-medium text-gray-900">{value}</p>
      <p className="text-m text-gray-400">{badgeLabel}</p>
    </div>
  )
}
