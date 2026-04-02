import * as React from 'react'

import { cn } from '@/lib/cn'

type ButtonVariant = 'default' | 'ghost'
type ButtonSize = 'default' | 'sm'

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 disabled:pointer-events-none disabled:opacity-50'

const variants: Record<ButtonVariant, string> = {
  default: 'bg-indigo-500 text-white hover:bg-indigo-400',
  ghost: 'bg-transparent hover:bg-zinc-800/50 text-zinc-100',
}

const sizes: Record<ButtonSize, string> = {
  default: 'h-10 px-4',
  sm: 'h-9 px-3 text-sm',
}

export function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonProps) {
  return <button className={cn(base, variants[variant], sizes[size], className)} {...props} />
}
