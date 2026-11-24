import { useEffect, useState, type ReactNode } from 'react';
import type { LicensePayload, LicenseSubmissionDetail } from '../types/api';
import { api, ApiError } from '../lib/api';

interface Props {
  id: string;
  onClose: () => void;
  onDecided: () => void;
}

/**
 * Full submission in a side panel. For an edit, every field that differs from
 * the approved license is marked "changed" and shows the old value.
 */
export function LicenseReviewPanel({ id, onClose, onDecided }: Props) {
  const [detail, setDetail] = useState<LicenseSubmissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  // skills left off the license: skillNodeId → reason shown to the teacher
  const [leftOut, setLeftOut] = useState<Record<string, string>>({});

  useEffect(() => {
    api
      .getLicense(id)
      .then(setDetail)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'));
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const decide = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDecided();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <aside
        className="h-full w-full max-w-2xl overflow-y-auto bg-[#0b0b0b] border-l border-neutral-800 p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-neutral-500 text-xs uppercase tracking-wider">
              {detail?.kind === 'edit' ? 'Edit of an approved license' : 'New license'}
            </p>
            <h2 className="text-white text-lg font-semibold">{detail?.user.name ?? '…'}</h2>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white text-sm">
            Close
          </button>
        </div>

        {error && <p className="text-rose-400 text-sm">{error}</p>}
        {!detail && !error && <p className="text-neutral-500 text-sm">Loading…</p>}

        {detail && (
          <ReviewBody
            detail={detail}
            leftOut={leftOut}
            onLeftOutChange={detail.status === 'pending' ? setLeftOut : undefined}
          />
        )}

        {detail?.status === 'pending' && (
          <div className="sticky bottom-0 -mx-6 -mb-6 border-t border-neutral-800 bg-[#0b0b0b] p-4 space-y-3">
            {rejecting ? (
              <>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={1000}
                  placeholder="Why is it rejected? The teacher sees this."
                  className="w-full rounded-lg bg-[#111] border border-neutral-800 p-3 text-sm text-white placeholder:text-neutral-600"
                  rows={3}
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setRejecting(false)} className="px-3 py-2 text-sm text-neutral-400 hover:text-white">
                    Back
                  </button>
                  <button
                    disabled={busy || !reason.trim()}
                    onClick={() => void decide(() => api.rejectLicense(id, reason.trim()))}
                    className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium disabled:opacity-40"
                  >
                    Reject
                  </button>
                </div>
              </>
            ) : (
              <div className="flex justify-end gap-2">
                <button
                  disabled={busy}
                  onClick={() => setRejecting(true)}
                  className="px-4 py-2 rounded-lg border border-neutral-700 text-neutral-300 hover:text-white text-sm"
                >
                  Reject…
                </button>
                <ApproveButton
                  detail={detail}
                  leftOut={leftOut}
                  busy={busy}
                  onApprove={() =>
                    void decide(() =>
                      api.approveLicense(
                        id,
                        Object.entries(leftOut).map(([skill_node_id, r]) => ({ skill_node_id, reason: r.trim() })),
                      ),
                    )
                  }
                />
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

/** Approve with the per-skill decisions; says how many skills stay off the card. */
function ApproveButton({
  detail,
  leftOut,
  busy,
  onApprove,
}: {
  detail: LicenseSubmissionDetail;
  leftOut: Record<string, string>;
  busy: boolean;
  onApprove: () => void;
}) {
  const skills = detail.payload.skills;
  const leftOutCount = skills.filter((s) => s.skillNodeId in leftOut).length;
  const missingReason = Object.values(leftOut).some((r) => !r.trim());
  const noneLeft = leftOutCount === skills.length;

  const label =
    leftOutCount === 0
      ? detail.kind === 'edit'
        ? 'Approve changes'
        : 'Approve license'
      : `Approve without ${leftOutCount} ${leftOutCount === 1 ? 'skill' : 'skills'}`;
  const hint = noneLeft
    ? 'Every skill is left out. Reject the license instead.'
    : missingReason
      ? 'Give a reason for every skill you leave out.'
      : undefined;

  return (
    <div className="flex items-center gap-3">
      {hint && <span className="text-xs text-amber-400">{hint}</span>}
      <button
        disabled={busy || noneLeft || missingReason}
        onClick={onApprove}
        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-40"
      >
        {label}
      </button>
    </div>
  );
}

/* ── body ── */

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');

function ReviewBody({
  detail,
  leftOut,
  onLeftOutChange,
}: {
  detail: LicenseSubmissionDetail;
  leftOut: Record<string, string>;
  /** Present only while the submission can still be decided. */
  onLeftOutChange?: (next: Record<string, string>) => void;
}) {
  const p = detail.payload;
  const old = detail.live?.payload ?? null;
  const url = (path: string | null) => (path ? detail.file_urls[path] : undefined);

  return (
    <div className="space-y-5">
      {detail.rejection_reason && (
        <p className="rounded-lg bg-rose-950/50 border border-rose-900 p-3 text-rose-300 text-sm">
          Rejected: {detail.rejection_reason}
        </p>
      )}

      <div className="flex gap-4">
        {url(p.photoPath) ? (
          <img src={url(p.photoPath)} alt="" className="h-24 w-20 rounded object-cover border border-neutral-800" />
        ) : (
          <div className="h-24 w-20 rounded border border-dashed border-neutral-800" />
        )}
        <dl className="flex-1 space-y-2">
          <Field label="Name titles" value={join(p.titleBefore, p.titleAfter)} old={old && join(old.titleBefore, old.titleAfter)} />
          <Field label="Role" value={p.role} old={old?.role} />
          <Field label="Photo" value={p.photoPath ? 'set' : 'none'} old={old && (old.photoPath ? 'set' : 'none')}
            changed={!!old && old.photoPath !== p.photoPath} />
          <Field label="Theme" value={p.theme} old={old?.theme} />
        </dl>
      </div>

      <Group title="Institution">
        <Field
          label="Institution"
          value={join(p.countryCode, p.institutionType, p.institutionName)}
          old={old && join(old.countryCode, old.institutionType, old.institutionName)}
        />
        <Field label="From list" value={p.institutionId ? `yes (${p.institutionId})` : 'no, typed by hand'} />
        <Field label="Domains" value={p.institutionDomains?.join(', ') ?? '—'} />
      </Group>

      <Group title="Bio">
        <Field label="" value={p.bio || '—'} old={old?.bio} />
      </Group>

      <Group title="Skills">
        <Skills now={p} old={old} url={url} leftOut={leftOut} onLeftOutChange={onLeftOutChange} />
      </Group>

      <Group title="Verification (mock: e-mail codes are not really sent yet)">
        <Field
          label="Status"
          value={join(p.verification.status, p.verification.kind, p.verification.method)}
          old={old && join(old.verification.status, old.verification.kind, old.verification.method)}
        />
        {p.verification.email && <Field label="E-mail" value={p.verification.email} old={old?.verification.email} />}
        {p.verification.documentPath && (
          <div className="text-sm">
            <a href={url(p.verification.documentPath)} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300">
              Open document ({p.verification.documentFileName ?? 'file'})
            </a>
          </div>
        )}
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-neutral-400 text-xs uppercase tracking-wider">{title}</h3>
      <dl className="space-y-2">{children}</dl>
    </section>
  );
}

/** One value; with `old` given (edits) it is marked when it differs. */
function Field({
  label,
  value,
  old,
  changed,
}: {
  label: string;
  value: string | null | undefined;
  old?: string | null;
  changed?: boolean;
}) {
  const isChanged = changed ?? (old !== undefined && old !== null && (old ?? '') !== (value ?? ''));
  return (
    <div className={`text-sm ${isChanged ? 'border-l-2 border-amber-500 pl-2' : ''}`}>
      {label && <dt className="text-neutral-500 text-xs">{label}{isChanged && <span className="ml-2 text-amber-400">changed</span>}</dt>}
      <dd className="text-neutral-100 whitespace-pre-wrap">{value || '—'}</dd>
      {isChanged && old && <dd className="text-neutral-600 text-xs line-through">{old}</dd>}
    </div>
  );
}

function Skills({
  now,
  old,
  url,
  leftOut,
  onLeftOutChange,
}: {
  now: LicensePayload;
  old: LicensePayload | null;
  url: (path: string | null) => string | undefined;
  leftOut: Record<string, string>;
  onLeftOutChange?: (next: Record<string, string>) => void;
}) {
  const oldById = new Map(old?.skills.map((s) => [s.skillNodeId, s]) ?? []);
  const removed = old?.skills.filter((s) => !now.skills.some((n) => n.skillNodeId === s.skillNodeId)) ?? [];

  const setDecision = (skillNodeId: string, out: boolean) => {
    if (!onLeftOutChange) return;
    const next = { ...leftOut };
    if (out) next[skillNodeId] = next[skillNodeId] ?? '';
    else delete next[skillNodeId];
    onLeftOutChange(next);
  };

  return (
    <div className="space-y-3">
      {now.skills.map((s) => {
        const before = oldById.get(s.skillNodeId);
        // already on the card: its proofs are the teacher's to manage, nothing to decide
        const alreadyApproved = before?.status === 'approved';
        const evidenceChanged = !!before && JSON.stringify(before.evidence) !== JSON.stringify(s.evidence);
        const tag =
          old && !before
            ? 'added'
            : before?.status === 'rejected'
              ? 'resubmitted'
              : before && (before.level !== s.level || (!alreadyApproved && evidenceChanged))
                ? 'changed'
                : null;
        const isOut = s.skillNodeId in leftOut;
        const canDecide = !!onLeftOutChange && !alreadyApproved;

        return (
          <div
            key={s.skillNodeId}
            className={`rounded-lg border p-3 ${isOut ? 'border-rose-900/70 bg-rose-950/20' : 'border-neutral-800 bg-[#111]'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className={`text-sm font-medium ${isOut ? 'text-rose-300' : 'text-white'}`}>{s.skillName}</p>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-neutral-400">{s.level}</span>
                {tag && (
                  <span className={tag === 'added' ? 'text-emerald-400' : 'text-amber-400'}>{tag}</span>
                )}
                {alreadyApproved && <span className="text-neutral-500">on license</span>}
              </div>
            </div>

            {before?.status === 'rejected' && before.rejectionReason && (
              <p className="mt-1 text-xs text-neutral-500">Previously left out: {before.rejectionReason}</p>
            )}
            {alreadyApproved && (
              <p className="mt-1 text-xs text-neutral-500">
                Approved earlier. The teacher manages its proofs, so they are not part of this review.
              </p>
            )}

            {!alreadyApproved && (
            <ul className="mt-2 space-y-1.5">
              {s.evidence.map((e, i) => {
                const href = e.kind === 'link' ? e.url ?? undefined : url(e.path);
                return (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    {e.kind === 'image' && href ? (
                      <img src={href} alt="" className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded bg-neutral-900 text-neutral-500 uppercase text-[10px]">
                        {e.kind}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-neutral-300">{join(e.type, e.date, e.description)}</p>
                      {href ? (
                        <a href={href} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300 truncate block">
                          {e.fileName ?? e.url}
                        </a>
                      ) : (
                        <p className="text-neutral-600">file missing</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            )}

            {canDecide && (
              <div className="mt-3 space-y-2 border-t border-neutral-800 pt-3">
                <div className="flex w-fit gap-1 rounded-lg border border-neutral-800 bg-black p-0.5">
                  <button
                    type="button"
                    onClick={() => setDecision(s.skillNodeId, false)}
                    className={`rounded px-2.5 py-1 text-xs font-medium ${!isOut ? 'bg-emerald-700 text-white' : 'text-neutral-500 hover:text-white'}`}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecision(s.skillNodeId, true)}
                    className={`rounded px-2.5 py-1 text-xs font-medium ${isOut ? 'bg-rose-700 text-white' : 'text-neutral-500 hover:text-white'}`}
                  >
                    Leave out
                  </button>
                </div>
                {isOut && (
                  <textarea
                    value={leftOut[s.skillNodeId]}
                    onChange={(e) => onLeftOutChange?.({ ...leftOut, [s.skillNodeId]: e.target.value })}
                    maxLength={500}
                    rows={2}
                    placeholder="Why is this skill left out? The teacher sees this and can fix the proof."
                    className="w-full rounded-lg border border-neutral-800 bg-black p-2 text-xs text-white placeholder:text-neutral-600"
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
      {removed.map((s) => (
        <div key={s.skillNodeId} className="rounded-lg border border-rose-900/60 p-3 text-sm text-rose-300 line-through">
          {s.skillName} <span className="no-underline text-xs">(removed)</span>
        </div>
      ))}
    </div>
  );
}
