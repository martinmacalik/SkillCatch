import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/cn'
import { Card, CardContent } from '@/components/ui/card'

type StatCardProps = {
  title: string
  value: number
  subtitle?: string
  icon: LucideIcon
  trend?: 'up' | 'down'
  trendValue?: string
}

export function StatCard({ title, value, subtitle, icon: Icon, trend, trendValue }: StatCardProps) {
  return (
    <Card className="animate-fade-in">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm text-zinc-400">{title}</p>
            <div className="flex items-end gap-2">
              <p className="text-2xl font-semibold tracking-tight">{value}</p>
              {trend && trendValue ? (
                <span
                  className={cn(
                    'text-xs font-medium',
                    trend === 'up' ? 'text-emerald-400' : 'text-rose-400',
                  )}
                >
                  {trendValue}
                </span>
              ) : null}
            </div>
            {subtitle ? <p className="text-xs text-zinc-500">{subtitle}</p> : null}
          </div>

          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800/60">
            <Icon className="h-5 w-5 text-zinc-200" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
