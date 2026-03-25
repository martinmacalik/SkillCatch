export interface SkillNode {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  is_leaf: boolean;
  image_url: string | null;
}

export interface SkillAttributeDef {
  id: string;
  skill_node_id: string;
  key: string;
  label: string;
  type: string;        // e.g. "text" | "number" | "enum"
  unit: string | null;
  required: boolean;
  enum_values: string[] | null;
  sort_order: number;
}

export interface SkillStat {
  skill_node_id: string;
  num_users: number;
}

export interface UserSkillRow {
  skill_node_id: string;
  skill_nodes: SkillNode;
}

export const BANNER_COLORS = [
  "bg-violet-200",
  "bg-sky-200",
  "bg-amber-200",
  "bg-emerald-200",
  "bg-rose-200",
  "bg-indigo-200",
  "bg-teal-200",
  "bg-pink-200",
  "bg-orange-200",
  "bg-cyan-200",
];

export function colorForIndex(i: number) {
  return BANNER_COLORS[i % BANNER_COLORS.length];
}
