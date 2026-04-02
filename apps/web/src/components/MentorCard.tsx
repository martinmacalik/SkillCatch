import { Star } from 'lucide-react'

import { cn } from '@/lib/cn'
import { Card, CardContent } from '@/components/ui/card'

type MentorCardProps = {
  name: string
  headline: string
  skills: string[]
  isOnline: boolean
  price: string
  rating: number
  matchReasons: string[]
}

export function MentorCard({
  name,
  headline,
  skills,
  isOnline,
  price,
  rating,
  matchReasons,
}: MentorCardProps) {
  return (
    <Card className="h-full">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-semibold">{name}</p>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                  isOnline ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-800/60 text-zinc-300',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    isOnline ? 'bg-emerald-400' : 'bg-zinc-500',
                  )}
                />
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-400">{headline}</p>
          </div>
          <div className="flex items-center gap-1 text-sm text-zinc-200">
            <Star className="h-4 w-4 text-amber-300" />
            <span className="font-medium">{rating.toFixed(1)}</span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {skills.map((skill) => (
            <span
              key={skill}
              className="rounded-full bg-zinc-800/60 px-2 py-0.5 text-xs text-zinc-200"
            >
              {skill}
            </span>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-zinc-300">{price}</p>
          <span className="text-xs text-zinc-500">za hodinu</span>
        </div>

        <div className="mt-4 rounded-xl border border-zinc-800/60 bg-zinc-950/40 p-3">
          <p className="text-xs font-medium text-zinc-200">Proč se hodí</p>
          <ul className="mt-2 space-y-1">
            {matchReasons.map((reason) => (
              <li key={reason} className="text-xs text-zinc-400">
                • {reason}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
