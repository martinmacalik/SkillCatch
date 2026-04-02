import type { RequestStatus, MessageStatus } from '../types/api';

const STYLES: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  approved: 'bg-green-500/20 text-green-400 border border-green-500/30',
  denied: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
  open: 'bg-neutral-700 text-neutral-300 border border-neutral-600',
  closed: 'bg-neutral-800 text-neutral-500 border border-neutral-700',
};

export function StatusBadge({
  status,
}: {
  status: RequestStatus | MessageStatus;
}) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
        STYLES[status] ?? ''
      }`}
    >
      {status}
    </span>
  );
}
