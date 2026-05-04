import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, Plus } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthProvider'
import { colorForIndex } from './skills/types'
import type { SkillNode } from './skills/types'
import EditSkillModal from './skills/EditSkillModal'

/* ── helpers ── */


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
          onDelete={async () => {
            if (!session?.user || !editingNode) return
            if (!confirm(`Remove "${editingNode.node.name}" from your profile?`)) return
            await supabase
              .from('user_skill_attributes')
              .delete()
              .eq('user_id', session.user.id)
              .eq('skill_node_id', editingNode.node.id)
            await supabase
              .from('user_skills')
              .delete()
              .eq('user_id', session.user.id)
              .eq('skill_node_id', editingNode.node.id)
            setEditingNode(null)
          }}
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
        <div className="grid shrink-0 grid-cols-4 gap-2 sm:gap-3 lg:gap-5">
          {/* Total Skills – accent card */}
          <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl bg-linear-to-br from-violet-950 to-fuchsia-700 p-3 text-white sm:p-4 lg:p-6">
            <div className="flex items-start justify-between">
              <p className="text-[11px] font-medium text-white sm:text-sm">Total Skills</p>
              <button
                onClick={() => navigate('/dashboard/skills')}
                className="hidden h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white transition hover:bg-gray-100 sm:flex lg:h-9 lg:w-9"
              >
                <ArrowUpRight className="h-4 w-4 text-gray-900 lg:h-5 lg:w-5" />
              </button>
            </div>
            <div className="relative my-1 sm:my-2">
              {/* Pink glow behind the number */}
              <div className="absolute -left-2 top-1/2 h-5 w-10 -translate-y-1/2 rounded-full bg-fuchsia-400 opacity-60 blur-2xl sm:h-14 sm:w-20 lg:h-20 lg:w-28" />
              <p className="relative text-3xl font-medium leading-none sm:text-4xl lg:text-6xl">{totalSkills}</p>
            </div>
            <p className="hidden text-xs text-fuchsia-400 sm:block sm:text-sm">Skills tracked</p>
          </div>

          <StatCard shortLabel="Streak" title="Day Streak" value={String(dayStreak)} badgeLabel="Consecutive login days" onArrowClick={() => navigate('/dashboard/learn')} />
          <StatCard shortLabel="Learning" title="Skills Learning" value={String(learningCount)} badgeLabel="Currently in progress" onArrowClick={() => navigate('/dashboard/learn')} />
          <StatCard shortLabel="Chats" title="New Chats" value="0" badgeLabel="Coming soon" />
        </div>

        {/* ── Rows 2 & 3 Combined – Custom Asymmetric Grid ── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:flex-1 2xl:min-h-155 2xl:grid-cols-6 2xl:gap-5 2xl:grid-rows-[4fr_1fr_1fr_4fr]">
          {/* Learning Progress: tablet col1 row2 | desktop rows 1-2, cols 1-3 */}
          <div className="flex min-h-48 flex-col rounded-2xl bg-white p-6 sm:col-start-1 sm:row-start-2 2xl:col-span-3 2xl:col-start-1 2xl:row-start-1 2xl:row-end-3 2xl:min-h-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-gray-900">Learning Progress</h3>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400">Coming soon</span>
            </div>
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-gray-400">No data yet</p>
            </div>
          </div>

          {/* Reminders: tablet col1 row3 | desktop rows 1-2, cols 4-5 */}
          <div className="flex min-h-36 flex-col rounded-2xl bg-white p-6 sm:col-start-1 sm:row-start-3 2xl:col-span-2 2xl:col-start-4 2xl:row-start-1 2xl:row-end-3 2xl:min-h-0">
            <h3 className="text-base font-semibold text-gray-900">Reminders</h3>
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-gray-400">No reminders yet</p>
            </div>
          </div>

          {/* Skills Learning: tablet col2 row2 | desktop rows 1-3, col 6 */}
          <div className="flex min-h-36 flex-col rounded-2xl bg-white p-6 sm:col-start-2 sm:row-start-2 2xl:col-span-1 2xl:col-start-6 2xl:row-start-1 2xl:row-end-4 2xl:min-h-0">
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

          {/* Chats: tablet col1 row1 | desktop rows 3-4, cols 1-2 */}
          <div className="flex min-h-48 flex-col rounded-2xl bg-white p-6 sm:col-start-1 sm:row-start-1 2xl:col-span-2 2xl:col-start-1 2xl:row-start-3 2xl:row-end-5 2xl:min-h-0">
            <div className="flex shrink-0 items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-gray-900">Chats</h3>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400">Coming soon</span>
              </div>
              <button className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-200">
                Edit
              </button>
            </div>

            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-gray-400">No chats yet</p>
            </div>
          </div>

          {/* Pinned Skill: tablet col2 row3 | desktop rows 3-4, cols 3-5 */}
          <div className="flex min-h-48 flex-col rounded-2xl bg-white p-6 sm:col-start-2 sm:row-start-3 2xl:col-span-3 2xl:col-start-3 2xl:row-start-3 2xl:row-end-5 2xl:min-h-0">
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

          {/* Time Tracker: tablet col2 row1 | desktop row 4, col 6 */}
          <div className="flex min-h-24 flex-col justify-end rounded-2xl bg-gradient-to-br from-indigo-900 to-fuchsia-700 p-6 sm:col-start-2 sm:row-start-1 2xl:col-span-1 2xl:col-start-6 2xl:row-start-4 2xl:row-end-5 2xl:min-h-0">
            <p className="text-2xl font-bold text-white">Time Tracker</p>
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Sub-components ── */

function StatCard({
  shortLabel,
  title,
  value,
  badgeLabel,
  onArrowClick,
}: {
  shortLabel: string
  title: string
  value: string
  badgeLabel: string
  onArrowClick?: () => void
}) {
  return (
    <div className="flex flex-col justify-between rounded-2xl bg-white p-3 sm:p-4 lg:p-6">
      <div className="flex items-start justify-between">
        <p className="text-lg font-medium text-black sm:text-lg">
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{title}</span>
        </p>
        <button
          onClick={onArrowClick}
          disabled={!onArrowClick}
          className="hidden h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-black transition hover:bg-gray-100 disabled:cursor-default disabled:opacity-40 sm:flex lg:h-9 lg:w-9"
        >
          <ArrowUpRight className="h-4 w-4 text-black lg:h-5 lg:w-5" />
        </button>
      </div>
      <p className="my-1 text-3xl font-medium text-gray-900 sm:my-2 sm:text-4xl lg:text-6xl">{value}</p>
      <p className="hidden text-xs text-fuchsia-700 sm:block sm:text-sm">{badgeLabel}</p>
    </div>
  )
}
