import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { SuggestionCard, type LearningSuggestion } from '../components/SuggestionCard';

type Tab = 'pending' | 'approved' | 'denied';

const TABS: { label: string; value: Tab }[] = [
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Denied', value: 'denied' },
];

export function SuggestionsPage() {
  const [tab, setTab] = useState<Tab>('pending');
  const [suggestions, setSuggestions] = useState<LearningSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (status: Tab) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('skill_learning_suggestions')
        .select('id, skill_node_id, submitted_by, proposed_blocks, message, status, deny_reason, reviewed_at, created_at, skill_nodes(name)')
        .eq('status', status)
        .order('created_at', { ascending: false });

      if (err) throw new Error(err.message);

      const rows = data ?? [];

      // Batch-fetch usernames for all submitted_by IDs
      const userIds = [...new Set(rows.map((r: any) => r.submitted_by as string))];
      let usernameMap: Record<string, string | null> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', userIds);
        for (const p of profiles ?? []) {
          usernameMap[p.id] = p.username;
        }
      }

      const enriched: LearningSuggestion[] = rows.map((r: any) => ({
        id: r.id,
        skill_node_id: r.skill_node_id,
        submitted_by: r.submitted_by,
        proposed_blocks: Array.isArray(r.proposed_blocks) ? r.proposed_blocks : [],
        message: r.message,
        status: r.status,
        deny_reason: r.deny_reason,
        reviewed_at: r.reviewed_at,
        created_at: r.created_at,
        skill_name: Array.isArray(r.skill_nodes) ? (r.skill_nodes[0]?.name ?? null) : (r.skill_nodes?.name ?? null),
        submitter_username: usernameMap[r.submitted_by] ?? null,
      }));

      setSuggestions(enriched);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load suggestions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  const handleUpdate = (id: string, patch: Partial<LearningSuggestion>) => {
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <h1 className="text-white text-xl font-semibold">Learn Page Suggestions</h1>

      <div className="flex gap-1 bg-[#111] border border-neutral-800 rounded-lg p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              tab === t.value
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-500 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-neutral-500 text-sm">Loading…</p>}

      {error && (
        <div className="space-y-2">
          <p className="text-rose-400 text-sm">{error}</p>
          <button
            onClick={() => load(tab)}
            className="text-indigo-400 hover:text-indigo-300 text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && suggestions.length === 0 && (
        <p className="text-neutral-500 text-sm">No {tab} suggestions.</p>
      )}

      {!loading && !error && suggestions.length > 0 && (
        <div className="space-y-3">
          {suggestions.map(s => (
            <SuggestionCard key={s.id} suggestion={s} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
