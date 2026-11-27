import type { SubmissionState } from '@/lib/teach-assignments-queries'

/** pill colors per state; red = waiting for YOU (teacher) to review */
export const STATE_PILL: Record<SubmissionState, string> = {
  not_started: 'bg-gray-100 text-gray-500',
  submitted: 'bg-rose-50 text-rose-600',
  returned: 'bg-amber-50 text-amber-700',
  done: 'bg-emerald-50 text-emerald-700',
  left: 'bg-gray-50 text-gray-400',
  removed: 'bg-gray-50 text-gray-400',
}
