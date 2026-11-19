import { cn } from '@/lib/cn'
import { STATUS_LABELS, type LicenseStatus } from '@/types/teaching'
import { STATUS_STYLES } from './teach-utils'

export function StatusBadge({ status, className }: { status: LicenseStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
        STATUS_STYLES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
