import { useState } from 'react';
import type { SupportMessage } from '../types/api';
import { StatusBadge } from './StatusBadge';
import { api, ApiError } from '../lib/api';

interface Props {
  message: SupportMessage;
  onUpdate: (updated: SupportMessage) => void;
}

export function MessageItem({ message, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setLoading(true);
    setError(null);
    try {
      const updated =
        message.status === 'open'
          ? await api.closeMessage(message.id)
          : await api.openMessage(message.id);
      onUpdate(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-neutral-800 bg-[#111] rounded-lg p-4 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={message.status} />
            <span className="text-white text-sm font-medium truncate">
              {message.subject}
            </span>
          </div>
          <p className="text-neutral-500 text-xs">
            {message.sender?.username ?? message.email ?? 'anonymous'} ·{' '}
            {new Date(message.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-neutral-500 hover:text-white text-xs transition-colors"
          >
            {expanded ? 'collapse' : 'read'}
          </button>
          <button
            onClick={toggle}
            disabled={loading}
            className={`text-xs px-2.5 py-1 rounded border transition-colors disabled:opacity-50 ${
              message.status === 'open'
                ? 'border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500'
                : 'border-neutral-800 text-neutral-600 hover:text-neutral-400'
            }`}
          >
            {loading ? '…' : message.status === 'open' ? 'Close' : 'Reopen'}
          </button>
        </div>
      </div>

      {expanded && (
        <p className="text-neutral-300 text-sm whitespace-pre-wrap border-t border-neutral-800 pt-2">
          {message.body}
        </p>
      )}

      {error && <p className="text-rose-400 text-xs">{error}</p>}
    </div>
  );
}
