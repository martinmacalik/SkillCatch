import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { StatusBadge } from './StatusBadge';

type BlockType = 'heading' | 'text' | 'callout' | 'resource_list' | 'flashcards' | 'checklist';

interface ProposedBlock {
  id?: string;
  type: BlockType;
  content: Record<string, unknown>;
  sort_order: number;
}

interface LiveBlock {
  id: string;
  type: BlockType;
  content: Record<string, unknown>;
  sort_order: number;
}

export interface LearningSuggestion {
  id: string;
  skill_node_id: string;
  submitted_by: string;
  proposed_blocks: ProposedBlock[];
  message: string | null;
  status: 'pending' | 'approved' | 'denied';
  deny_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  skill_name: string | null;
  submitter_username: string | null;
}

const BLOCK_LABELS: Record<string, string> = {
  heading: 'Heading',
  text: 'Text',
  callout: 'Callout',
  resource_list: 'Resources',
  flashcards: 'Flashcards',
  checklist: 'Checklist',
};

function blockPreview(block: { type: string; content: Record<string, unknown> }): string {
  const c = block.content;
  switch (block.type) {
    case 'heading': return String(c.text ?? '').slice(0, 60) || '(empty)';
    case 'text':    return String(c.text ?? '').slice(0, 80) || '(empty)';
    case 'callout': return `[${String(c.tone ?? 'tip')}] ${String(c.text ?? '').slice(0, 60)}`;
    case 'resource_list': {
      const items = Array.isArray(c.items) ? c.items : [];
      return `${items.length} link${items.length !== 1 ? 's' : ''}`;
    }
    case 'flashcards': {
      const cards = Array.isArray(c.cards) ? c.cards : [];
      return `${cards.length} card${cards.length !== 1 ? 's' : ''}`;
    }
    case 'checklist': {
      const items = Array.isArray(c.items) ? c.items : [];
      return `${items.length} item${items.length !== 1 ? 's' : ''}`;
    }
    default: return '';
  }
}

async function fetchLiveBlocks(skillNodeId: string): Promise<LiveBlock[]> {
  const { data: page } = await supabase
    .from('skill_learning_pages')
    .select('id')
    .eq('skill_node_id', skillNodeId)
    .maybeSingle();
  if (!page) return [];

  const { data: blocks } = await supabase
    .from('skill_learning_blocks')
    .select('id, type, content, sort_order')
    .eq('page_id', page.id)
    .order('sort_order');
  return (blocks ?? []) as LiveBlock[];
}

async function applyApproval(suggestion: LearningSuggestion, liveBlocks: LiveBlock[]): Promise<void> {
  const { data: existing } = await supabase
    .from('skill_learning_pages')
    .select('id')
    .eq('skill_node_id', suggestion.skill_node_id)
    .maybeSingle();

  let pageId: string;
  if (existing) {
    pageId = existing.id;
  } else {
    const { data: created, error: createErr } = await supabase
      .from('skill_learning_pages')
      .insert({ skill_node_id: suggestion.skill_node_id })
      .select('id')
      .single();
    if (createErr) throw new Error(createErr.message);
    pageId = created.id;
  }

  const currentIds = new Set(liveBlocks.map(b => b.id));
  const keptIds = new Set(suggestion.proposed_blocks.filter(b => b.id).map(b => b.id as string));

  const toDelete = [...currentIds].filter(id => !keptIds.has(id));
  if (toDelete.length > 0) {
    const { error } = await supabase.from('skill_learning_blocks').delete().in('id', toDelete);
    if (error) throw new Error(error.message);
  }

  for (const block of suggestion.proposed_blocks) {
    if (block.id && currentIds.has(block.id)) {
      const { error } = await supabase
        .from('skill_learning_blocks')
        .update({ type: block.type, content: block.content, sort_order: block.sort_order })
        .eq('id', block.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from('skill_learning_blocks')
        .insert({ page_id: pageId, type: block.type, content: block.content, sort_order: block.sort_order });
      if (error) throw new Error(error.message);
    }
  }

  const { error: markErr } = await supabase
    .from('skill_learning_suggestions')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('id', suggestion.id);
  if (markErr) throw new Error(markErr.message);
}

interface Props {
  suggestion: LearningSuggestion;
  onUpdate: (id: string, patch: Partial<LearningSuggestion>) => void;
}

export function SuggestionCard({ suggestion, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [liveBlocks, setLiveBlocks] = useState<LiveBlock[] | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [denyMode, setDenyMode] = useState(false);
  const [denyReason, setDenyReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch live blocks lazily when first expanded
  useEffect(() => {
    if (!expanded || liveBlocks !== null) return;
    setLoadingDiff(true);
    fetchLiveBlocks(suggestion.skill_node_id)
      .then(setLiveBlocks)
      .catch(() => setLiveBlocks([]))
      .finally(() => setLoadingDiff(false));
  }, [expanded, liveBlocks, suggestion.skill_node_id]);

  const handleApprove = async () => {
    setLoading(true);
    setError(null);
    try {
      await applyApproval(suggestion, liveBlocks ?? []);
      onUpdate(suggestion.id, { status: 'approved', reviewed_at: new Date().toISOString() });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeny = async () => {
    if (!denyReason.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('skill_learning_suggestions')
        .update({ status: 'denied', deny_reason: denyReason.trim(), reviewed_at: new Date().toISOString() })
        .eq('id', suggestion.id);
      if (err) throw new Error(err.message);
      onUpdate(suggestion.id, { status: 'denied', deny_reason: denyReason.trim(), reviewed_at: new Date().toISOString() });
      setDenyMode(false);
      setDenyReason('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  // Compute diff once live blocks are loaded
  const proposedIds = new Set(suggestion.proposed_blocks.filter(b => b.id).map(b => b.id as string));
  const deletedBlocks = (liveBlocks ?? []).filter(b => !proposedIds.has(b.id));

  return (
    <div className="border border-neutral-800 bg-[#111] rounded-lg p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={suggestion.status} />
            <span className="text-white font-medium text-sm">
              {suggestion.skill_name ?? 'Unknown skill'}
            </span>
          </div>
          <p className="text-neutral-500 text-xs">
            by {suggestion.submitter_username ?? 'anonymous'} ·{' '}
            {new Date(suggestion.created_at).toLocaleDateString()} ·{' '}
            {suggestion.proposed_blocks.length} block{suggestion.proposed_blocks.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-neutral-500 hover:text-white text-xs shrink-0 transition-colors"
        >
          {expanded ? 'collapse' : 'expand'}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="space-y-3">
          {suggestion.message && (
            <div className="bg-indigo-500/10 border border-indigo-500/25 rounded-lg p-3">
              <p className="text-indigo-400 text-[10px] uppercase tracking-wide font-semibold mb-1.5">
                User's note
              </p>
              <p className="text-neutral-200 text-sm leading-relaxed">"{suggestion.message}"</p>
            </div>
          )}

          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-lg p-3">
            <p className="text-neutral-600 text-[10px] uppercase tracking-wide mb-2">
              Block diff
            </p>

            {loadingDiff ? (
              <p className="text-neutral-600 text-xs">Loading current blocks…</p>
            ) : (
              <div className="space-y-1">
                {/* Deleted blocks — in live but not in proposal */}
                {deletedBlocks.map(block => (
                  <div key={block.id} className="flex items-start gap-2 rounded bg-rose-500/10 border-l-2 border-rose-500/50 px-2 py-1">
                    <span className="shrink-0 mt-0.5 text-rose-500 text-[10px] font-bold">−</span>
                    <span className="shrink-0 mt-0.5 bg-rose-500/20 text-rose-400 text-[10px] px-1.5 py-0.5 rounded font-mono">
                      {BLOCK_LABELS[block.type] ?? block.type}
                    </span>
                    <span className="text-rose-400 text-xs truncate line-through opacity-70">
                      {blockPreview(block)}
                    </span>
                    <span className="shrink-0 text-rose-500 text-[10px] font-semibold ml-auto">deleted</span>
                  </div>
                ))}

                {/* Proposed blocks — new or kept */}
                {suggestion.proposed_blocks.map((block, i) => {
                  const isNew = !block.id;
                  return (
                    <div
                      key={block.id ?? i}
                      className={`flex items-start gap-2 rounded px-2 py-1 ${
                        isNew
                          ? 'bg-emerald-500/10 border-l-2 border-emerald-500/50'
                          : 'border-l-2 border-transparent'
                      }`}
                    >
                      <span className={`shrink-0 mt-0.5 text-[10px] font-bold ${isNew ? 'text-emerald-500' : 'text-neutral-700'}`}>
                        {isNew ? '+' : '·'}
                      </span>
                      <span className={`shrink-0 mt-0.5 text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        isNew ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-800 text-neutral-400'
                      }`}>
                        {BLOCK_LABELS[block.type] ?? block.type}
                      </span>
                      <span className={`text-xs truncate ${isNew ? 'text-emerald-300' : 'text-neutral-400'}`}>
                        {blockPreview(block)}
                      </span>
                      {isNew && (
                        <span className="shrink-0 text-emerald-500 text-[10px] font-semibold ml-auto">new</span>
                      )}
                    </div>
                  );
                })}

                {suggestion.proposed_blocks.length === 0 && deletedBlocks.length === 0 && (
                  <p className="text-neutral-600 text-xs italic">No changes detected</p>
                )}
                {suggestion.proposed_blocks.length === 0 && deletedBlocks.length > 0 && (
                  <p className="text-neutral-600 text-xs italic mt-1">All blocks removed — page would be empty</p>
                )}

                {/* Legend */}
                {(deletedBlocks.length > 0 || suggestion.proposed_blocks.some(b => !b.id)) && (
                  <div className="flex gap-4 mt-2 pt-2 border-t border-neutral-800">
                    <span className="flex items-center gap-1.5 text-[10px] text-neutral-500">
                      <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500/40 border-l border-emerald-500" />
                      new
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] text-neutral-500">
                      <span className="inline-block w-2 h-2 rounded-sm bg-rose-500/40 border-l border-rose-500" />
                      deleted
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] text-neutral-500">
                      <span className="text-neutral-600">·</span> kept
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-rose-400 text-xs">{error}</p>}

      {suggestion.status === 'pending' && !denyMode && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleApprove}
            disabled={loading}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs rounded transition-colors"
          >
            {loading ? 'Applying…' : 'Approve & apply'}
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
            value={denyReason}
            onChange={e => setDenyReason(e.target.value)}
            placeholder="Reason for denial (required)"
            className="w-full bg-[#0d0d0d] border border-neutral-700 text-white text-xs rounded p-2 resize-none h-20 placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleDeny}
              disabled={loading || !denyReason.trim()}
              className="px-3 py-1.5 bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white text-xs rounded transition-colors"
            >
              {loading ? 'Denying…' : 'Confirm Deny'}
            </button>
            <button
              onClick={() => { setDenyMode(false); setDenyReason(''); }}
              className="px-3 py-1.5 text-neutral-500 hover:text-white text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {suggestion.status === 'denied' && suggestion.deny_reason && (
        <p className="text-neutral-600 text-xs italic border-t border-neutral-800 pt-2">
          Denied: {suggestion.deny_reason}
        </p>
      )}
    </div>
  );
}
