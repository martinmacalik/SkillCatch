import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AuditLogEntry } from '../types/api';
import { AuditRow } from '../components/AuditRow';
import { api, ApiError } from '../lib/api';

export function AuditPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getAuditLog()
      .then((res) => setEntries(res.data))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) navigate('/access-denied');
        else setError(e instanceof ApiError ? e.message : 'Failed to load audit log');
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <h1 className="text-white text-xl font-semibold">Audit Log</h1>

      {loading && <p className="text-neutral-500 text-sm">Loading…</p>}

      {error && (
        <div className="space-y-2">
          <p className="text-rose-400 text-sm">{error}</p>
          <button
            onClick={load}
            className="text-indigo-400 hover:text-indigo-300 text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <p className="text-neutral-500 text-sm">No audit log entries yet.</p>
      )}

      {!loading && !error && entries.length > 0 && (
        <div className="bg-[#111] border border-neutral-800 rounded-lg px-4">
          {entries.map((e) => (
            <AuditRow key={e.id} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}
