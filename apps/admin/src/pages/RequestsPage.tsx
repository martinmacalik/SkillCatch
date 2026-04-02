import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RestructureRequest, RequestStatus } from '../types/api';
import { RequestCard } from '../components/RequestCard';
import { api, ApiError } from '../lib/api';

const TABS: { label: string; value: RequestStatus | '' }[] = [
  { label: 'Pending', value: 'pending' },
  { label: 'All', value: '' },
  { label: 'Approved', value: 'approved' },
  { label: 'Denied', value: 'denied' },
];

export function RequestsPage() {
  const [tab, setTab] = useState<RequestStatus | ''>('pending');
  const [requests, setRequests] = useState<RestructureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback((currentTab: RequestStatus | '') => {
    setLoading(true);
    setError(null);
    api
      .getRequests(currentTab ? { status: currentTab } : undefined)
      .then((res) => setRequests(res.data))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) navigate('/access-denied');
        else setError(e instanceof ApiError ? e.message : 'Failed to load requests');
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  const handleUpdate = (updated: RestructureRequest) => {
    setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <h1 className="text-white text-xl font-semibold">Restructure Requests</h1>

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
          <button
            onClick={() => load(tab)}
            className="text-indigo-400 hover:text-indigo-300 text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && requests.length === 0 && (
        <p className="text-neutral-500 text-sm">
          No {tab ? tab : ''} requests.
        </p>
      )}

      {!loading && !error && requests.length > 0 && (
        <div className="space-y-3">
          {requests.map((r) => (
            <RequestCard key={r.id} request={r} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
