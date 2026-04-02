import { useState } from 'react';
import type { RestructureRequest } from '../types/api';
import { StatusBadge } from './StatusBadge';
import { ProposalDiff } from './ProposalDiff';
import { api, ApiError } from '../lib/api';

interface Props {
  request: RestructureRequest;
  onUpdate: (updated: RestructureRequest) => void;
}

export function RequestCard({ request, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [denyMode, setDenyMode] = useState(false);
  const [denialReason, setDenialReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setLoading(true);
    setError(null);
    try {
      const updated = await api.approveRequest(request.id);
      onUpdate(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeny = async () => {
    if (!denialReason.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await api.denyRequest(request.id, denialReason);
      onUpdate(updated);
      setDenyMode(false);
      setDenialReason('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-neutral-800 bg-[#111] rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={request.status} />
            <span className="text-white font-medium text-sm truncate">
              {request.target_node?.name ?? 'Unknown node'}
            </span>
            {request.target_node?.path && (
              <span className="text-neutral-600 text-xs font-mono">
                {String(request.target_node.path)}
              </span>
            )}
          </div>
          <p className="text-neutral-500 text-xs">
            by {request.requester?.username ?? 'anonymous'} ·{' '}
            {new Date(request.created_at).toLocaleDateString()}
          </p>
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-neutral-500 hover:text-white text-xs shrink-0 transition-colors"
        >
          {expanded ? 'collapse' : 'expand'}
        </button>
      </div>

      {expanded && (
        <ProposalDiff proposal={request.proposal} message={request.message} />
      )}

      {error && <p className="text-rose-400 text-xs">{error}</p>}

      {request.status === 'pending' && !denyMode && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleApprove}
            disabled={loading}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs rounded transition-colors"
          >
            {loading ? 'Approving…' : 'Approve'}
          </button>
          <button
            onClick={() => setDenyMode(true)}
            disabled={loading}
            className="px-3 py-1.5 border border-rose-500/40 hover:border-rose-500 text-rose-400 hover:text-rose-300 text-xs rounded transition-colors"
          >
            Deny
          </button>
        </div>
      )}

      {denyMode && (
        <div className="space-y-2">
          <textarea
            value={denialReason}
            onChange={(e) => setDenialReason(e.target.value)}
            placeholder="Reason for denial (required)"
            className="w-full bg-[#0d0d0d] border border-neutral-700 text-white text-xs rounded p-2 resize-none h-20 placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleDeny}
              disabled={loading || !denialReason.trim()}
              className="px-3 py-1.5 bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white text-xs rounded transition-colors"
            >
              {loading ? 'Denying…' : 'Confirm Deny'}
            </button>
            <button
              onClick={() => {
                setDenyMode(false);
                setDenialReason('');
              }}
              className="px-3 py-1.5 text-neutral-500 hover:text-white text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {request.status === 'denied' && request.denial_reason && (
        <p className="text-neutral-600 text-xs italic border-t border-neutral-800 pt-2">
          Denied: {request.denial_reason}
        </p>
      )}
    </div>
  );
}
