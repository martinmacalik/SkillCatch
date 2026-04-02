import type { AuditLogEntry } from '../types/api';

const ACTION_LABELS: Record<string, string> = {
  approve_restructure_request: 'Approved request',
  deny_restructure_request: 'Denied request',
  close_support_message: 'Closed message',
  reopen_support_message: 'Reopened message',
};

export function AuditRow({ entry }: { entry: AuditLogEntry }) {
  return (
    <div className="border-b border-neutral-900 py-3 flex items-start gap-4">
      <div className="shrink-0 text-xs text-neutral-600 w-36">
        {new Date(entry.created_at).toLocaleString()}
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white text-xs font-medium">
            {ACTION_LABELS[entry.action] ?? entry.action}
          </span>
          <span className="text-neutral-600 text-xs font-mono">
            {entry.entity_type}
          </span>
        </div>
        <p className="text-neutral-500 text-xs">
          by {entry.actor?.username ?? entry.actor_user_id}
        </p>
      </div>
    </div>
  );
}
