import * as React from 'react'

import { cn } from '@/lib/cn'

type DivProps = React.HTMLAttributes<HTMLDivElement>

type HeadingProps = React.HTMLAttributes<HTMLHeadingElement>

export function Card({ className, ...props }: DivProps) {
  return (
    <div
      className={cn(
        'rounded-2xl bg-zinc-900/40 text-zinc-50 backdrop-blur',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: DivProps) {
  return <div className={cn('flex flex-col gap-1 p-5', className)} {...props} />
}

export function CardTitle({ className, ...props }: HeadingProps) {
  return <h3 className={cn('text-lg font-semibold tracking-tight', className)} {...props} />
}

export function CardContent({ className, ...props }: DivProps) {
  return <div className={cn('p-5 pt-0', className)} {...props} />
}
