import { Award, Brain, CheckCircle2, Target } from 'lucide-react'

import { cn } from '@/lib/cn'

type TimelineItem = {
  id: string
  type: 'skill' | 'checkin' | 'achievement' | 'goal'
  title: string
  description?: string
  date: string
}

type TimelineProps = {
  items: TimelineItem[]
}

const icons = {
  skill: Brain,
  checkin: CheckCircle2,
  achievement: Award,
  goal: Target,
} as const

const accents: Record<TimelineItem['type'], string> = {
  skill: 'bg-indigo-500/15 text-indigo-300',
  checkin: 'bg-emerald-500/15 text-emerald-300',
  achievement: 'bg-amber-500/15 text-amber-300',
  goal: 'bg-fuchsia-500/15 text-fuchsia-300',
}

export function Timeline({ items }: TimelineProps) {
  return (
    <div className="space-y-4">
      {items.map((item, idx) => {
        const Icon = icons[item.type]
        return (
          <div key={item.id} className="flex gap-4">
            <div className="relative flex w-10 flex-col items-center">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl',
                  accents[item.type],
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              {idx < items.length - 1 ? (
                <div className="absolute top-10 bottom-0 w-px bg-zinc-800/60" />
              ) : null}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-100">{item.title}</p>
                  {item.description ? (
                    <p className="mt-1 text-sm text-zinc-400">{item.description}</p>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs text-zinc-500">{item.date}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
