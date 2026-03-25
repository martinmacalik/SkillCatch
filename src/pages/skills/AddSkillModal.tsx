import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { colorForIndex } from "./types";
import type { SkillNode, SkillAttributeDef } from "./types";

type Status = "watchlist" | "learning" | "learned" | "dormant";

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

export interface AttributeValue {
  attribute_def_id: string;
  value_json: unknown;
}

interface AddSkillModalProps {
  node: SkillNode;
  index: number;
  onConfirm: (values: AttributeValue[], status: Status) => void;
  onCancel: () => void;
}

export default function AddSkillModal({ node, index, onConfirm, onCancel }: AddSkillModalProps) {
  const [defs, setDefs] = useState<SkillAttributeDef[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>("watchlist");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("skill_attribute_defs")
      .select("*")
      .eq("skill_node_id", node.id)
      .order("sort_order")
      .then(({ data }) => {
        setDefs(data ?? []);
        // Pre-fill empty strings for each def
        const initial: Record<string, string> = {};
        (data ?? []).forEach((d: SkillAttributeDef) => (initial[d.id] = ""));
        setValues(initial);
        setLoading(false);
      });
  }, [node.id]);

  const setValue = (id: string, val: string) =>
    setValues((prev) => ({ ...prev, [id]: val }));

  const handleConfirm = () => {
    const result: AttributeValue[] = defs
      .filter((d) => values[d.id]?.trim())
      .map((d) => ({
        attribute_def_id: d.id,
        value_json: parseValue(values[d.id], d.type),
      }));
    onConfirm(result, status);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Close */}
        <button
          onClick={onCancel}
          className="absolute right-4 top-4 z-10 cursor-pointer rounded-full bg-black/30 p-1.5 text-white transition hover:bg-black/50"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Hero */}
        <div className="p-3 pb-0">
          <div className="relative h-52 overflow-hidden rounded-2xl">
            {node.image_url ? (
              <img src={node.image_url} alt={node.name} className="h-full w-full object-cover" />
            ) : (
              <div className={`h-full w-full ${colorForIndex(index)}`} />
            )}
            <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
            <p className="absolute bottom-4 left-4 text-2xl font-semibold text-white">{node.name}</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 pt-5">
          {/* Status selector */}
          <div className="mb-5 grid grid-cols-4 gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setStatus(opt.key)}
                className={`cursor-pointer rounded-xl py-1.5 text-xs font-semibold transition ${
                  status === opt.key ? opt.active : opt.inactive
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <h2 className="text-lg font-semibold text-gray-900">Add skill to your profile</h2>
          <p className="mt-0.5 text-sm text-gray-400">
            {loading ? "Loading attributes…" : defs.length > 0 ? "Fill in your details below" : "No attributes defined for this skill"}
          </p>

          {!loading && (
            <div className="mt-5 flex flex-col gap-3">
              {/* Defined attributes */}
              {defs.map((def) => (
                <div key={def.id} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500">
                    {def.label}
                    {def.required && <span className="ml-0.5 text-red-400">*</span>}
                  </label>
                  {def.type === "enum" && def.enum_values?.length ? (
                    <select
                      value={values[def.id] ?? ""}
                      onChange={(e) => setValue(def.id, e.target.value)}
                      className="rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-800 outline-none transition focus:border-gray-400 focus:bg-white"
                    >
                      <option value="">Select…</option>
                      {def.enum_values.map((v) => (
                        <option key={v} value={v}>{v}</option>
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

            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 rounded-2xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="flex-1 rounded-2xl bg-gray-900 py-3 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function parseValue(raw: string, type: string): unknown {
  if (type === "number") return parseFloat(raw) || 0;
  return raw;
}
