import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UserCreatedSkill, SkillReviewStatus } from '../types/api';
import { UserSkillCard } from '../components/UserSkillCard';
import { api, ApiError } from '../lib/api';

const TABS: { label: string; value: SkillReviewStatus }[] = [
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
];

export function UserSkillsPage() {
  const [tab, setTab] = useState<SkillReviewStatus>('pending');
  const [skills, setSkills] = useState<UserCreatedSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback((status: SkillReviewStatus) => {
    setLoading(true);
    setError(null);
    api
      .getUserSkills({ status })
      .then((res) => setSkills(res.data))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) navigate('/access-denied');
        else setError(e instanceof ApiError ? e.message : 'Failed to load skills');
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  const handleUpdate = (id: string, patch: Partial<UserCreatedSkill>) => {
    setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <h1 className="text-white text-xl font-semibold">User-created Skills</h1>

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

      {!loading && !error && skills.length === 0 && (
        <p className="text-neutral-500 text-sm">No {tab} skills.</p>
      )}

      {!loading && !error && skills.length > 0 && (
        <div className="space-y-3">
          {skills.map((s) => (
            <UserSkillCard key={s.id} skill={s} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
