import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LearningSuggestion } from '../types/api';
import { SuggestionCard } from '../components/SuggestionCard';
import { api, ApiError } from '../lib/api';

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
  const navigate = useNavigate();

  const load = useCallback((status: Tab) => {
    setLoading(true);
    setError(null);
    api
      .getSuggestions({ status })
      .then((res) => setSuggestions(res.data))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) navigate('/access-denied');
        else setError(e instanceof ApiError ? e.message : 'Failed to load suggestions');
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  const handleUpdate = (id: string, patch: Partial<LearningSuggestion>) => {
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <h1 className="text-white text-xl font-semibold">Learn Page Suggestions</h1>

      <div className="flex gap-1 bg-[#111] border border-neutral-800 rounded-lg p-1 w-fit">
        {TABS.map((t) => (
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
          <button onClick={() => load(tab)} className="text-indigo-400 hover:text-indigo-300 text-sm">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && suggestions.length === 0 && (
        <p className="text-neutral-500 text-sm">No {tab} suggestions.</p>
      )}

      {!loading && !error && suggestions.length > 0 && (
        <div className="space-y-3">
          {suggestions.map((s) => (
            <SuggestionCard key={s.id} suggestion={s} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
