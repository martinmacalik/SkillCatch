import { useEffect, useState } from "react";
import { X, Pencil, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { colorForIndex } from "./types";
import type { SkillNode, SkillAttributeDef } from "./types";

type Status = "watchlist" | "learning" | "learned" | "dormant";
type Mode = "view" | "edit";

const STATUS_OPTIONS: {
  key: Status;
  label: string;
  active: string;
  inactive: string;
}[] = [
  { key: "watchlist", label: "Watchlist", active: "bg-violet-600 text-white",  inactive: "bg-violet-50 text-violet-700 hover:bg-violet-100" },
  { key: "learning",  label: "Learning",  active: "bg-blue-600 text-white",    inactive: "bg-blue-50 text-blue-700 hover:bg-blue-100" },
  { key: "learned",   label: "Learned",   active: "bg-emerald-600 text-white", inactive: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
  { key: "dormant",   label: "Dormant",   active: "bg-slate-500 text-white",   inactive: "bg-slate-50 text-slate-600 hover:bg-slate-100" },
];

interface EditSkillModalProps {
  node: SkillNode;
  index: number;
  userId: string;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

export default function EditSkillModal({
  node,
  index,
  userId,
  onSave,
  onCancel,
  onDelete,
}: EditSkillModalProps) {
  const [mode, setMode] = useState<Mode>("view");
  const [defs, setDefs] = useState<SkillAttributeDef[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>("watchlist");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ data: defsData }, { data: savedData }, { data: skillRow }] =
        await Promise.all([
          supabase
            .from("skill_attribute_defs")
            .select("*")
            .eq("skill_node_id", node.id)
            .order("sort_order"),
          supabase
            .from("user_skill_attributes")
            .select("attribute_def_id, value_json")
            .eq("user_id", userId)
            .eq("skill_node_id", node.id),
          supabase
            .from("user_skills")
            .select("status")
            .eq("user_id", userId)
            .eq("skill_node_id", node.id)
            .single(),
        ]);

      const savedMap: Record<string, string> = {};
      (savedData ?? []).forEach(
        (row: { attribute_def_id: string; value_json: unknown }) => {
          savedMap[row.attribute_def_id] =
            row.value_json !== null && row.value_json !== undefined
              ? String(row.value_json)
              : "";
        }
      );

      const initial: Record<string, string> = {};
      (defsData ?? []).forEach((d: SkillAttributeDef) => {
        initial[d.id] = savedMap[d.id] ?? "";
      });

      setDefs(defsData ?? []);
      setValues(initial);
      if (skillRow?.status) setStatus(skillRow.status as Status);
      setLoading(false);
    }
    load();
  }, [node.id, userId]);

  const setValue = (id: string, val: string) =>
    setValues((prev) => ({ ...prev, [id]: val }));

  /* Status saves immediately and closes */
  const handleStatusChange = async (s: Status) => {
    await supabase
      .from("user_skills")
      .update({ status: s })
      .eq("user_id", userId)
      .eq("skill_node_id", node.id);
    onSave();
  };

  const handleSave = async () => {
    setSaving(true);
    const rows = defs
      .filter((d) => values[d.id]?.trim())
      .map((d) => ({
        user_id: userId,
        skill_node_id: node.id,
        attribute_def_id: d.id,
        value_json: parseValue(values[d.id], d.type),
      }));

    if (rows.length > 0) {
      await supabase
        .from("user_skill_attributes")
        .upsert(rows, { onConflict: "user_id,skill_node_id,attribute_def_id" });
    }

    const clearedIds = defs
      .filter((d) => !values[d.id]?.trim())
      .map((d) => d.id);
    if (clearedIds.length > 0) {
      await supabase
        .from("user_skill_attributes")
        .delete()
        .eq("user_id", userId)
        .eq("skill_node_id", node.id)
        .in("attribute_def_id", clearedIds);
    }

    setSaving(false);
    onSave();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Top buttons: Edit (pencil) + Remove (trash) + Close.
            Default state has no background — circle appears on hover only. */}
        <div className="absolute right-4 top-4 z-10 flex items-center gap-1">
          {mode === "view" && (
            <>
              <button
                onClick={() => setMode("edit")}
                className="cursor-pointer rounded-full p-1.5 text-white transition hover:bg-black/30"
                title="Edit details"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={onDelete}
                className="cursor-pointer rounded-full p-1.5 text-white transition hover:bg-rose-600/70"
                title="Remove from profile"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            onClick={onCancel}
            className="cursor-pointer rounded-full p-1.5 text-white transition hover:bg-black/30"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Hero */}
        <div className="p-3 pb-0">
          <div className="relative h-52 overflow-hidden rounded-2xl">
            {node.image_url ? (
              <img
                src={node.image_url}
                alt={node.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className={`h-full w-full ${colorForIndex(index)}`} />
            )}
            <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
            <p className="absolute bottom-4 left-4 text-2xl font-semibold text-white">
              {node.name}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 pt-5">
          {/* Status selector */}
          <div className="mb-5 grid grid-cols-4 gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => handleStatusChange(opt.key)}
                className={`cursor-pointer rounded-xl py-1.5 text-xs font-semibold transition ${
                  status === opt.key ? opt.active : opt.inactive
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex h-16 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-purple-600" />
            </div>
          ) : defs.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">
              No attributes defined for this skill
            </p>
          ) : mode === "view" ? (
            /* ── View mode: read-only values ── */
            <div className="flex flex-col gap-4">
              {defs.map((def) => {
                const val = values[def.id];
                return (
                  <div key={def.id}>
                    <p className="text-xs font-medium text-gray-400">{def.label}</p>
                    <p className="mt-0.5 text-sm text-gray-900">
                      {val ? (
                        def.unit ? `${val} ${def.unit}` : val
                      ) : (
                        <span className="text-gray-300">Not set</span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Edit mode: editable inputs ── */
            <div className="flex flex-col gap-3">
              {defs.map((def) => (
                <div key={def.id} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500">
                    {def.label}
                    {def.required && (
                      <span className="ml-0.5 text-red-400">*</span>
                    )}
                  </label>
                  {def.type === "enum" && def.enum_values?.length ? (
                    <select
                      value={values[def.id] ?? ""}
                      onChange={(e) => setValue(def.id, e.target.value)}
                      className="rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-800 outline-none transition focus:border-gray-400 focus:bg-white"
                    >
                      <option value="">Select…</option>
                      {def.enum_values.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  ) : def.unit ? (
                    <div className="flex items-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 transition focus-within:border-gray-400 focus-within:bg-white">
                      <input
                        type={def.type === "number" ? "number" : "text"}
                        value={values[def.id] ?? ""}
                        onChange={(e) => setValue(def.id, e.target.value)}
                        placeholder={`Enter ${def.label.toLowerCase()}`}
                        className="flex-1 bg-transparent px-3.5 py-2.5 text-sm text-gray-800 outline-none"
                      />
                      <span className="shrink-0 border-l border-gray-200 bg-gray-100 px-3 py-2.5 text-sm text-gray-400">
                        {def.unit}
                      </span>
                    </div>
                  ) : (
                    <input
                      type={def.type === "number" ? "number" : "text"}
                      value={values[def.id] ?? ""}
                      onChange={(e) => setValue(def.id, e.target.value)}
                      placeholder={`Enter ${def.label.toLowerCase()}`}
                      className="rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-800 outline-none transition focus:border-gray-400 focus:bg-white"
                    />
                  )}
                </div>
              ))}

              <div className="mt-3 flex gap-3">
                <button
                  onClick={() => setMode("view")}
                  className="flex-1 cursor-pointer rounded-2xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 cursor-pointer rounded-2xl bg-gray-900 py-3 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function parseValue(raw: string, type: string): unknown {
  if (type === "number") return parseFloat(raw) || 0;
  return raw;
}
