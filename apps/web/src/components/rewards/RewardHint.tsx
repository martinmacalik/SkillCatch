import { rewardRule, type RewardId } from '@/lib/rewards'

/** Outlined "+10 XP" / "🪙 +25" badges. `title` explains the reward on hover. */
export function RewardBadges({
  xp,
  coins,
  title,
  className = '',
}: {
  xp?: number
  coins?: number | string
  title?: string
  className?: string
}) {
  return (
    <span title={title} className={`inline-flex shrink-0 items-center gap-1 align-middle ${className}`}>
      {xp != null && (
        <span className="inline-flex h-5 items-center rounded-full border border-purple-200 bg-white px-2 text-xs font-semibold leading-none text-purple-700">
          +{xp} XP
        </span>
      )}
      {coins != null && (
        <span className="inline-flex h-5 items-center gap-0.5 rounded-full border border-amber-200 bg-white pl-1 pr-2 text-xs font-semibold leading-none text-amber-600">
          <img src="/coin.png" alt="" className="h-3.5 w-3.5" />+{coins}
        </span>
      )}
    </span>
  )
}

/** Badges for one rule from lib/rewards.ts, shown where the action happens. */
export function RewardHint({ id, title, className }: { id: RewardId; title?: string; className?: string }) {
  const rule = rewardRule(id)
  return <RewardBadges xp={rule.xp} coins={rule.coins} title={title ?? rule.description} className={className} />
}
