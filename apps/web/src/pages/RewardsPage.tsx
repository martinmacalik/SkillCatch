import { useEffect, useState } from 'react'
import { Flash, Lock, ShoppingBag } from 'reicon-react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthProvider'
import { REWARD_GROUPS, levelFor, xpForLevel, type RewardRule } from '@/lib/rewards'

const PATH_LEVELS = 10 // how many levels the path on the right shows
const SHOP_SLOTS = 6

export default function RewardsPage() {
  const { session } = useAuth()
  const [balance, setBalance] = useState({ coins: 0, xp: 0 })

  useEffect(() => {
    if (!session?.user) return
    supabase
      .from('profiles')
      .select('skillcoin_balance, xp')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (data) setBalance({ coins: data.skillcoin_balance, xp: data.xp })
      })
  }, [session])

  const { level, from, to } = levelFor(balance.xp)
  const progress = Math.round(((balance.xp - from) / (to - from)) * 100)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      {/* ── Header ── */}
      <div className="shrink-0">
        <h1 className="text-3xl font-bold text-gray-900">Rewards</h1>
        <p className="mt-1.5 text-base text-gray-500">
          XP shows how much you learn, SkillCoins reward you for helping the app grow.
        </p>
      </div>

      {/* ── Overview: 4 equal columns (level card spans 2) so its gap lines up with the 2 columns below ── */}
      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
        <div className="flex items-center gap-4 rounded-2xl bg-white p-4 sm:p-6">
          <img src="/coin.png" alt="" className="h-12 w-12 drop-shadow-[0_2px_3px_rgba(0,0,0,0.2)]" />
          <div>
            <p className="text-sm text-gray-500">SkillCoins</p>
            <p className="text-3xl font-medium text-gray-900">{balance.coins}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl bg-white p-4 sm:p-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-indigo-50 to-fuchsia-50">
            <Flash weight="Filled" className="nav-icon-active h-6 w-6" />
          </span>
          <div>
            <p className="text-sm text-gray-500">XP</p>
            <p className="text-3xl font-medium text-gray-900">{balance.xp}</p>
          </div>
        </div>

        <div className="col-span-2 flex flex-col justify-center gap-3 rounded-2xl bg-linear-to-br from-violet-950 to-fuchsia-700 p-4 text-white sm:p-6">
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-semibold">Level {level}</p>
            <p className="text-sm text-fuchsia-200">
              {to - balance.xp} XP to level {level + 1}
            </p>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-fuchsia-200">
            {balance.xp - from} / {to - from} XP in this level
          </p>
        </div>
      </div>

      {/* ── Left: how to earn | Right: level path + shop ── */}
      <div className="grid grid-cols-1 gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-2">
        <section className="flex flex-col rounded-2xl bg-white p-6 lg:min-h-0">
          <h2 className="shrink-0 text-base font-semibold text-gray-900">How to earn</h2>
          <div className="mt-4 flex flex-col gap-6 lg:min-h-0 lg:overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
            {REWARD_GROUPS.map(group => (
              <div key={group.title}>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{group.title}</p>
                <p className="mb-2 text-sm text-gray-500">{group.subtitle}</p>
                <div className="flex flex-col gap-1.5">
                  {group.rules.map(rule => <RuleRow key={rule.label} rule={rule} />)}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col rounded-2xl bg-white p-6 lg:min-h-0">
          <div className="lg:min-h-0 lg:overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
            <h2 className="text-base font-semibold text-gray-900">Level path</h2>
            <p className="mb-4 text-sm text-gray-500">Each level unlocks something new.</p>

            <ol className="relative">
              {Array.from({ length: PATH_LEVELS - 1 }, (_, i) => i + 2).map(lvl => {
                const reached = level >= lvl
                const next = lvl === level + 1
                return (
                  <li key={lvl} className="relative flex items-center gap-4 pb-4 last:pb-0">
                    {/* connector line to the next step */}
                    {lvl < PATH_LEVELS && <span className="absolute bottom-0 left-5 top-10 w-px bg-gray-200" />}
                    <span
                      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        reached
                          ? 'bg-linear-to-br from-indigo-600 to-fuchsia-600 text-white'
                          : next
                            ? 'border-2 border-purple-300 bg-white text-purple-700'
                            : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {lvl}
                    </span>
                    <div className={`flex flex-1 items-center justify-between rounded-xl px-4 py-3 ${next ? 'bg-purple-50' : 'bg-gray-50'}`}>
                      <div>
                        <p className={`text-sm font-semibold ${reached || next ? 'text-gray-900' : 'text-gray-400'}`}>
                          {xpForLevel(lvl)} XP
                        </p>
                        <p className="text-xs text-gray-400">Reward coming soon</p>
                      </div>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-base font-bold text-gray-300 shadow-sm">
                        ?
                      </span>
                    </div>
                  </li>
                )
              })}
            </ol>

            <div className="mt-8 flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-gray-900" />
              <h2 className="text-base font-semibold text-gray-900">Shop</h2>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400">Coming soon</span>
            </div>
            <p className="mb-4 text-sm text-gray-500">Spend your SkillCoins on extras.</p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: SHOP_SLOTS }, (_, i) => (
                <div key={i} className="flex flex-col items-center gap-2 rounded-xl bg-gray-50 p-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-xl font-bold text-gray-300 shadow-sm">
                    ?
                  </span>
                  <span className="flex items-center gap-1 text-xs font-semibold text-gray-400">
                    <Lock className="h-3.5 w-3.5" />
                    <img src="/coin.png" alt="" className="h-4 w-4" />
                    {(i + 1) * 50}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function RuleRow({ rule }: { rule: RewardRule }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">{rule.label}</p>
          {!rule.live && (
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-gray-400">Soon</span>
          )}
        </div>
        <p className="text-xs leading-relaxed text-gray-500">{rule.description}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {rule.xp != null && (
          <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-700">+{rule.xp} XP</span>
        )}
        {rule.coins != null && (
          <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-600">
            <img src="/coin.png" alt="" className="h-3.5 w-3.5" />+{rule.coins}
          </span>
        )}
      </div>
    </div>
  )
}
