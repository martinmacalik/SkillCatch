import type { LucideIcon } from 'lucide-react'
import { ChevronRight } from 'lucide-react'

import { cn } from '@/lib/cn'
import { Card, CardContent } from '@/components/ui/card'

type ActionCardProps = {
  title: string
  description: string
  icon: LucideIcon
  badge?: string
  badgeVariant?: 'warning'
}

export function ActionCard({
  title,
  description,
  icon: Icon,
  badge,
  badgeVariant,
}: ActionCardProps) {
  return (
    <Card className="group">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800/60">
            <Icon className="h-5 w-5 text-zinc-200" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-semibold">{title}</p>
              {badge ? (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-medium',
                    badgeVariant === 'warning'
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'bg-zinc-800/60 text-zinc-300',
                  )}
                >
                  {badge}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-zinc-400">{description}</p>
          </div>
          <ChevronRight className="h-5 w-5 text-zinc-500 transition-transform group-hover:translate-x-0.5" />
        </div>
      </CardContent>
    </Card>
  )
}
