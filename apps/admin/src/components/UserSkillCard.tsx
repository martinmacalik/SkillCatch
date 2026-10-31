import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { StatusBadge } from './StatusBadge';
import type { UserCreatedSkill, SimilarSkill } from '../types/api';

const QUICK_REASONS = ['Skill already exists', 'Not a skill', 'Inappropriate', 'Wrong category'];

interface Props {
  skill: UserCreatedSkill;
  onUpdate: (id: string, patch: Partial<UserCreatedSkill>) => void;
}

export function UserSkillCard({ skill, onUpdate }: Props) {
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState('');
  const [duplicate, setDuplicate] = useState<SimilarSkill | null>(null);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SimilarSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Admin can look up the existing skill when it isn't among the suggestions
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      api.searchSkills(q).then((r) => setSearchResults(r.data)).catch(() => setSearchResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const pickDuplicate = (s: SimilarSkill) => {
    setDuplicate(s);
    setRejectMode(true);
    if (!reason.trim()) setReason('Skill already exists');
  };

  const handleApprove = async () => {
    setLoading(true);
    setError(null);
    try {
      const updated = await api.approveUserSkill(skill.id);
      onUpdate(skill.id, { status: updated.status, reviewed_at: updated.reviewed_at });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!reason.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await api.rejectUserSkill(skill.id, reason.trim(), duplicate?.id ?? null);
      onUpdate(skill.id, {
        status: updated.status,
        reviewed_at: updated.reviewed_at,
        rejection_reason: updated.rejection_reason,
        duplicate_of: updated.duplicate_of,
        duplicate_of_name: duplicate?.name ?? null,
      });
      setRejectMode(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  const candidates = searchResults.length > 0 ? searchResults : skill.similar;

  return (
    <div className="border border-neutral-800 bg-[#111] rounded-lg p-4 space-y-3">
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={skill.status} />
          <span className="text-white font-medium text-sm">{skill.name}</span>
          <span className="text-neutral-500 text-xs">in {skill.parent_name ?? 'unknown category'}</span>
        </div>
        <p className="text-neutral-500 text-xs">
          by {skill.creator_username ?? 'unknown user'}
          {skill.show_creator && ' (shown publicly)'} ·{' '}
          {new Date(skill.created_at).toLocaleDateString()}
        </p>
      </div>

      {skill.status === 'pending' && (
        <div className="bg-[#0d0d0d] border border-neutral-800 rounded-lg p-3 space-y-2">
          <p className="text-neutral-600 text-[10px] uppercase tracking-wide">
            {searchResults.length > 0 ? 'Search results' : 'Similar existing skills'}
          </p>
          {candidates.length === 0 ? (
            <p className="text-neutral-600 text-xs italic">Nothing similar found</p>
          ) : (
            <div className="space-y-1">
              {candidates.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-xs">
                  <span className="text-neutral-200">{s.name}</span>
                  {s.parent_name && <span className="text-neutral-600">in {s.parent_name}</span>}
                  <button
                    onClick={() => pickDuplicate(s)}
                    className={`ml-auto shrink-0 px-2 py-0.5 rounded transition-colors ${
                      duplicate?.id === s.id
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'text-neutral-500 hover:text-rose-300'
                    }`}
                  >
                    {duplicate?.id === s.id ? 'duplicate ✓' : 'mark as duplicate'}
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search other skills…"
            className="w-full bg-black border border-neutral-800 text-white text-xs rounded px-2 py-1.5 placeholder-neutral-600 focus:outline-none focus:border-neutral-600"
          />
        </div>
      )}

      {error && <p className="text-rose-400 text-xs">{error}</p>}

      {skill.status === 'pending' && !rejectMode && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleApprove}
            disabled={loading}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs rounded transition-colors"
          >
            {loading ? 'Approving…' : 'Approve'}
          </button>
          <button
            onClick={() => setRejectMode(true)}
            disabled={loading}
            className="px-3 py-1.5 border border-rose-500/40 hover:border-rose-500 text-rose-400 hover:text-rose-300 text-xs rounded transition-colors"
          >
            Reject
          </button>
        </div>
      )}

      {rejectMode && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className="px-2 py-0.5 rounded-full border border-neutral-700 text-neutral-400 hover:text-white text-[11px] transition-colors"
              >
                {r}
              </button>
            ))}
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason shown to the user (required)"
            className="w-full bg-[#0d0d0d] border border-neutral-700 text-white text-xs rounded p-2 resize-none h-20 placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
          />
          {duplicate && (
            <p className="text-xs text-neutral-400">
              User will get a link to <span className="text-white">{duplicate.name}</span>{' '}
              <button onClick={() => setDuplicate(null)} className="text-neutral-600 hover:text-white">
                (remove)
              </button>
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleReject}
              disabled={loading || !reason.trim()}
              className="px-3 py-1.5 bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white text-xs rounded transition-colors"
            >
              {loading ? 'Rejecting…' : 'Confirm Reject'}
            </button>
            <button
              onClick={() => { setRejectMode(false); setDuplicate(null); }}
              className="px-3 py-1.5 text-neutral-500 hover:text-white text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {skill.status === 'rejected' && skill.rejection_reason && (
        <p className="text-neutral-600 text-xs italic border-t border-neutral-800 pt-2">
          Rejected: {skill.rejection_reason}
          {skill.duplicate_of_name && ` → ${skill.duplicate_of_name}`}
        </p>
      )}
    </div>
  );
}
