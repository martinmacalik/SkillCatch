import { useEffect, useMemo, useState } from "react";
import { X, Check, Search, AlertTriangle } from "lucide-react";
import {
  searchSkills,
  fetchCategoryOptions,
  createUserSkill,
  fetchSkillById,
  CreateSkillFailed,
  SKILL_NAME_MIN,
  SKILL_NAME_MAX,
  type CategoryOption,
} from "../../lib/skill-queries";
import { STATUS_OPTIONS, type Status } from "./skillStatus";
import type { SkillNode } from "./types";

interface CreateSkillModalProps {
  initialName: string;
  initialParentId: string | null;
  userSkillIds: Set<string>;
  onPickExisting: (node: SkillNode) => void; // "it already exists" → add that one instead
  onCreated: (skillId: string) => void;
  onClose: () => void;
}

// "Kytára" and "kytara" should match while filtering categories
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function CreateSkillModal({
  initialName,
  initialParentId,
  userSkillIds,
  onPickExisting,
  onCreated,
  onClose,
}: CreateSkillModalProps) {
  const [name, setName] = useState(initialName.trim().slice(0, SKILL_NAME_MAX));
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [parentId, setParentId] = useState<string | null>(initialParentId);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [status, setStatus] = useState<Status>("watchlist");
  const [showCreator, setShowCreator] = useState(false);

  const [similar, setSimilar] = useState<SkillNode[]>([]);
  const [existing, setExisting] = useState<SkillNode | null>(null); // exact duplicate reported by the server
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchCategoryOptions().then(setCategories).catch(() => setCategories([]));
  }, []);

  // Live duplicate hint: debounce so we don't query on every keystroke
  useEffect(() => {
    const q = name.trim();
    if (q.length < SKILL_NAME_MIN) {
      setSimilar([]);
      return;
    }
    const t = setTimeout(() => {
      searchSkills(q, 6)
        .then((rows) => setSimilar(rows.filter((n) => n.is_leaf)))
        .catch(() => setSimilar([]));
    }, 300);
    return () => clearTimeout(t);
  }, [name]);

  const visibleCategories = useMemo(() => {
    const f = fold(categoryFilter.trim());
    return f ? categories.filter((c) => fold(c.label).includes(f)) : categories;
  }, [categories, categoryFilter]);

  const selectedCategory = categories.find((c) => c.id === parentId) ?? null;
  const trimmed = name.trim();
  const canSubmit =
    trimmed.length >= SKILL_NAME_MIN && trimmed.length <= SKILL_NAME_MAX && !!parentId && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !parentId) return;
    setSubmitting(true);
    setError(null);
    setExisting(null);
    try {
      const id = await createUserSkill({ name: trimmed, parentId, showCreator, status });
      setSuccess(true);
      setTimeout(() => onCreated(id), 1400);
    } catch (e) {
      if (e instanceof CreateSkillFailed) {
        const r = e.reason;
        if (r.kind === "duplicate") {
          const node = r.existingId ? await fetchSkillById(r.existingId) : null;
          setExisting(node);
          setError("This skill already exists in that category.");
        } else if (r.kind === "duplicate_pending") {
          setError("Someone already suggested this skill here. It's waiting for review.");
        } else if (r.kind === "too_many_pending") {
          setError("You have 5 skills waiting for review. Wait until an admin decides on them.");
        } else {
          setError(r.message);
        }
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 cursor-pointer rounded-full bg-gray-100 p-1.5 text-gray-500 transition hover:bg-gray-200"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="overflow-y-auto px-6 pb-6 pt-6">
          <h2 className="text-lg font-semibold text-gray-900">Create a new skill</h2>
          <p className="mt-0.5 text-sm text-gray-400">
            You'll see it in your profile right away. Others will see it once an admin approves it.
          </p>

          {success ? (
            <div className="mt-8 flex flex-col items-center gap-2 py-4">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 shadow-lg"
                style={{ animation: "successPop 0.4s cubic-bezier(0.34,1.56,0.64,1) both" }}
              >
                <Check className="h-7 w-7 text-white" strokeWidth={3} />
              </div>
              <p className="text-sm font-semibold text-gray-900">Submitted for review!</p>
              <p className="text-xs text-gray-400">{trimmed} · we'll notify you when it's decided</p>
            </div>
          ) : (
            <>
              {/* Name */}
              <label className="mt-5 block text-xs font-medium text-gray-500">Skill name</label>
              <input
                autoFocus
                value={name}
                maxLength={SKILL_NAME_MAX}
                onChange={(e) => {
                  setName(e.target.value);
                  setExisting(null);
                  setError(null);
                }}
                placeholder="e.g. Ukulele"
                className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-800 outline-none transition focus:border-gray-400 focus:bg-white"
              />

              {/* Similar skills: the cheapest place to stop a duplicate */}
              {similar.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-800">Is it one of these?</p>
                  <div className="mt-2 flex flex-col gap-1">
                    {similar.map((n) => {
                      const added = userSkillIds.has(n.id);
                      return (
                        <button
                          key={n.id}
                          type="button"
                          disabled={added}
                          onClick={() => onPickExisting(n)}
                          className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-sm text-gray-800 transition hover:bg-amber-100 disabled:cursor-default disabled:opacity-60"
                        >
                          <span>
                            {n.name}
                            {n.status === "pending" && (
                              <span className="ml-2 text-[11px] text-amber-600">pending review</span>
                            )}
                          </span>
                          <span className="text-xs font-semibold text-gray-500">
                            {added ? "In your profile" : "Add this"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Category */}
              <label className="mt-5 block text-xs font-medium text-gray-500">Category</label>
              {selectedCategory ? (
                <div className="mt-1 flex items-center justify-between rounded-xl border border-gray-900 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-800">
                  <span className="truncate">{selectedCategory.label}</span>
                  <button
                    type="button"
                    onClick={() => setParentId(null)}
                    className="ml-2 shrink-0 text-xs font-semibold text-gray-500 hover:text-gray-900"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="mt-1 overflow-hidden rounded-xl border border-gray-200">
                  <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
                    <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <input
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      placeholder="Search categories…"
                      className="flex-1 text-sm outline-none"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto py-1">
                    {visibleCategories.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-400">No categories found</p>
                    ) : (
                      visibleCategories.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setParentId(c.id)}
                          className="block w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
                        >
                          {c.label}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Status in the creator's profile */}
              <label className="mt-5 block text-xs font-medium text-gray-500">In your profile as</label>
              <div className="mt-1 grid grid-cols-4 gap-2">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setStatus(opt.key)}
                    className={`cursor-pointer rounded-xl py-1.5 text-xs font-semibold transition ${
                      status === opt.key ? opt.active : opt.inactive
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Show creator toggle */}
              <label className="mt-5 flex items-start justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <span className="flex-1">
                  <span className="block text-sm font-medium text-gray-900">Show me as the creator</span>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    Others will see “Created by” with your name on this skill.
                  </span>
                </span>
                <button
                  role="switch"
                  aria-checked={showCreator}
                  type="button"
                  onClick={() => setShowCreator((v) => !v)}
                  className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
                    showCreator ? "bg-purple-700" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      showCreator ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </label>

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="flex-1">
                    <p>{error}</p>
                    {existing && !userSkillIds.has(existing.id) && (
                      <button
                        type="button"
                        onClick={() => onPickExisting(existing)}
                        className="mt-1 text-xs font-semibold underline"
                      >
                        Add “{existing.name}” instead
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  onClick={onClose}
                  disabled={submitting}
                  className="flex-1 rounded-2xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gray-900 py-3 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:opacity-40"
                >
                  {submitting ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Submitting…
                    </>
                  ) : (
                    "Submit for review"
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
