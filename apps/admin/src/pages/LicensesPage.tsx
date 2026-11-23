import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LicenseKind, LicenseReviewStatus, LicenseSubmissionSummary } from '../types/api';
import { api, ApiError } from '../lib/api';
import { LicenseReviewPanel } from '../components/LicenseReviewPanel';

const TABS: { label: string; value: LicenseReviewStatus }[] = [
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
];

const COLUMNS: { kind: LicenseKind; title: string; hint: string }[] = [
  { kind: 'new', title: 'New licenses', hint: 'First license of a teacher' },
  { kind: 'edit', title: 'Edits', hint: 'Changes to an approved license' },
];

export function LicensesPage() {
  const [tab, setTab] = useState<LicenseReviewStatus>('pending');
  const [rows, setRows] = useState<LicenseSubmissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(
    (status: LicenseReviewStatus) => {
      setLoading(true);
      setError(null);
      api
        .getLicenses(status)
        .then((res) => setRows(res.data))
        .catch((e) => {
          if (e instanceof ApiError && e.status === 403) navigate('/access-denied');
          else setError(e instanceof ApiError ? e.message : 'Failed to load licenses');
        })
        .finally(() => setLoading(false));
    },
    [navigate],
  );

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  return (
    <div className="p-6 space-y-4 max-w-6xl">
      <h1 className="text-white text-xl font-semibold">Teaching Licenses</h1>

      <div className="flex gap-1 bg-[#111] border border-neutral-800 rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              tab === t.value ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-white'
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

      {!loading && !error && (
        <div className="grid gap-4 md:grid-cols-2">
          {COLUMNS.map((col) => {
            const items = rows.filter((r) => r.kind === col.kind);
            return (
              <section key={col.kind} className="bg-[#0b0b0b] border border-neutral-900 rounded-xl p-4 space-y-3">
                <div className="flex items-baseline justify-between">
                  <div>
                    <h2 className="text-white text-sm font-semibold">{col.title}</h2>
                    <p className="text-neutral-500 text-xs">{col.hint}</p>
                  </div>
                  <span className="text-neutral-400 text-xs">{items.length}</span>
                </div>
                {items.length === 0 ? (
                  <p className="text-neutral-600 text-sm py-6 text-center">Nothing here.</p>
                ) : (
                  items.map((r) => <SubmissionCard key={r.id} row={r} onOpen={() => setOpenId(r.id)} />)
                )}
              </section>
            );
          })}
        </div>
      )}

      {openId && (
        <LicenseReviewPanel
          id={openId}
          onClose={() => setOpenId(null)}
          onDecided={() => {
            setOpenId(null);
            load(tab);
          }}
        />
      )}
    </div>
  );
}

function SubmissionCard({ row, onOpen }: { row: LicenseSubmissionSummary; onOpen: () => void }) {
  const when = row.status === 'pending' ? row.submitted_at : row.reviewed_at;
  return (
    <button
      onClick={onOpen}
      className="w-full text-left bg-[#111] border border-neutral-800 hover:border-neutral-600 rounded-lg p-3 transition-colors"
    >
      <div className="flex items-center gap-3">
        {row.user.avatar_url ? (
          <img src={row.user.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <div className="h-8 w-8 rounded-full bg-neutral-800" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-white text-sm font-medium truncate">{row.user.name}</p>
          <p className="text-neutral-500 text-xs truncate">{row.institution_name || 'No institution'}</p>
        </div>
        {row.verification_status !== 'none' && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              row.verification_status === 'verified' ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'
            }`}
          >
            {row.verification_status === 'verified' ? 'e-mail verified' : 'doc to check'}
          </span>
        )}
      </div>
      <p className="mt-2 text-neutral-400 text-xs truncate">{row.skill_names.join(' · ')}</p>
      {row.rejection_reason && <p className="mt-1 text-rose-400 text-xs truncate">Reason: {row.rejection_reason}</p>}
      {when && <p className="mt-1 text-neutral-600 text-[11px]">{new Date(when).toLocaleString()}</p>}
    </button>
  );
}
