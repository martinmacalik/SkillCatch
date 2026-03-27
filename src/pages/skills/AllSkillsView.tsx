import { useState, useCallback, useEffect, useRef } from "react";
import {
  List,
  LayoutGrid,
  Plus,
  ArrowUpDown,
  SlidersHorizontal,
  ArrowLeft,
  ListFilter,
  ChevronRight,
  Pin,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../contexts/AuthProvider";
import { colorForIndex, type SkillNode } from "./types";

// Inject iridescent keyframes once at module load
if (typeof document !== "undefined" && !document.getElementById("irid-kf")) {
  const s = document.createElement("style");
  s.id = "irid-kf";
  s.textContent = `
    @keyframes iridShift {
      0%   { filter: hue-rotate(0deg)   brightness(1)    saturate(1);    }
      50%  { filter: hue-rotate(28deg)  brightness(1.12) saturate(1.2);  }
      100% { filter: hue-rotate(-28deg) brightness(0.95) saturate(0.85); }
    }
  `;
  document.head.appendChild(s);
}
import EditSkillModal from "./EditSkillModal";

type Status = "watchlist" | "learning" | "dormant" | "learned";
type ViewMode = "list" | "kanban";

interface EnrichedSkill {
  skill_node_id: string;
  status: Status;
  pinned: boolean;
  node: SkillNode;
  parent: string;
  category: string;
  categoryId: string;
  startedAt: string | null;
}

const COLUMNS: {
  key: Status;
  label: string;
  accent: string;
  bg: string;
  dot: string;
  gradient: string;
}[] = [
  { key: "watchlist", label: "Watchlist", accent: "text-violet-700",  bg: "bg-violet-50",  dot: "bg-violet-400",  gradient: "from-violet-100 to-violet-200" },
  { key: "learning",  label: "Learning",  accent: "text-blue-700",    bg: "bg-blue-50",    dot: "bg-blue-400",    gradient: "from-blue-100 to-blue-200" },
  { key: "learned",   label: "Learned",   accent: "text-emerald-700", bg: "bg-emerald-50", dot: "bg-emerald-400", gradient: "from-emerald-100 to-emerald-200" },
  { key: "dormant",   label: "Dormant",   accent: "text-slate-600",   bg: "bg-slate-50",   dot: "bg-slate-400",   gradient: "from-slate-100 to-slate-200" },
];

export default function AllSkillsView({
  onGoToAdd,
  onBack,
}: {
  onGoToAdd: () => void;
  onBack: () => void;
}) {
  const { session } = useAuth();
  const [skills, setSkills] = useState<EnrichedSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [editingSkill, setEditingSkill] = useState<{ node: SkillNode; index: number } | null>(null);

  const fetchSkills = useCallback(async () => {
    if (!session?.user) return;

    const { data: rows } = await supabase
      .from("user_skills")
      .select("*")
      .eq("user_id", session.user.id);

    if (!rows?.length) {
      setSkills([]);
      setLoading(false);
      return;
    }

    const ids = rows.map((r: any) => r.skill_node_id);

    const { data: nodes } = await supabase
      .from("skill_nodes")
      .select("*")
      .in("id", ids);

    if (!nodes?.length) {
      setSkills([]);
      setLoading(false);
      return;
    }

    // Build a full ancestor map by fetching up the tree until all roots are known
    const allNodeMap: Record<string, SkillNode> = Object.fromEntries(
      nodes.map((n: SkillNode) => [n.id, n])
    );

    let idsToFetch = [
      ...new Set(
        nodes
          .filter((n: SkillNode) => n.parent_id && !allNodeMap[n.parent_id])
          .map((n: SkillNode) => n.parent_id as string)
      ),
    ];

    while (idsToFetch.length > 0) {
      const { data: ancestors } = await supabase
        .from("skill_nodes")
        .select("*")
        .in("id", idsToFetch);
      if (!ancestors?.length) break;
      ancestors.forEach((n: SkillNode) => (allNodeMap[n.id] = n));
      idsToFetch = [
        ...new Set(
          ancestors
            .filter((n: SkillNode) => n.parent_id && !allNodeMap[n.parent_id])
            .map((n: SkillNode) => n.parent_id as string)
        ),
      ];
    }

    // Walk up the tree to find the root ancestor
    function getRoot(nodeId: string): SkillNode | null {
      let node = allNodeMap[nodeId];
      while (node?.parent_id && allNodeMap[node.parent_id]) {
        node = allNodeMap[node.parent_id];
      }
      return node ?? null;
    }

    const enriched: EnrichedSkill[] = rows
      .filter((r: any) => allNodeMap[r.skill_node_id])
      .map((r: any) => {
        const node = allNodeMap[r.skill_node_id];
        const directParent = node.parent_id ? allNodeMap[node.parent_id] : null;
        const root = getRoot(r.skill_node_id);
        return {
          skill_node_id: r.skill_node_id,
          status: (r.status as Status) ?? "watchlist",
          pinned: r.pinned ?? false,
          node,
          parent: directParent?.name ?? "—",
          category: root?.name ?? "Other",
          categoryId: root?.id ?? "",
          startedAt: r.created_at ?? null,
        };
      })
      .sort((a: EnrichedSkill, b: EnrichedSkill) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return a.node.name.localeCompare(b.node.name);
      });

    setSkills(enriched);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const categories = [
    { id: "all", name: "All" },
    ...Object.values(
      skills.reduce<Record<string, { id: string; name: string }>>((acc, s) => {
        if (s.categoryId && !acc[s.categoryId])
          acc[s.categoryId] = { id: s.categoryId, name: s.category };
        return acc;
      }, {})
    ),
  ];

  const filtered =
    activeCategory === "all"
      ? skills
      : skills.filter((s) => s.categoryId === activeCategory);

  const openEdit = (node: SkillNode, index: number) =>
    setEditingSkill({ node, index });

  const handleTogglePin = useCallback(async (skillNodeId: string, currentPinned: boolean) => {
    await supabase
      .from("user_skills")
      .update({ pinned: !currentPinned })
      .eq("user_id", session!.user!.id)
      .eq("skill_node_id", skillNodeId);
    setSkills((prev) =>
      prev.map((s) =>
        s.skill_node_id === skillNodeId ? { ...s, pinned: !currentPinned } : s
      )
    );
  }, [session]);

  const handleAdvance = useCallback(async (skillNodeId: string, currentStatus: Status) => {
    const colIndex = COLUMNS.findIndex((c) => c.key === currentStatus);
    if (colIndex === -1 || colIndex >= COLUMNS.length - 1) return;
    const nextStatus = COLUMNS[colIndex + 1].key;
    await supabase
      .from("user_skills")
      .update({ status: nextStatus })
      .eq("user_id", session!.user!.id)
      .eq("skill_node_id", skillNodeId);
    setSkills((prev) =>
      prev.map((s) => (s.skill_node_id === skillNodeId ? { ...s, status: nextStatus } : s))
    );
  }, [session]);

  // ── Drag-and-drop ─────────────────────────────────────────────
  const dragRef = useRef<{
    skill: EnrichedSkill;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);
  const dropRef = useRef<{ colKey: Status; rowIndex: number } | null>(null);
  const colEls = useRef<Partial<Record<Status, HTMLDivElement>>>({});

  const [dragSkill, setDragSkill] = useState<EnrichedSkill | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ colKey: Status; rowIndex: number } | null>(null);

  const registerCol = useCallback((key: Status, el: HTMLDivElement | null) => {
    if (el) colEls.current[key] = el;
    else delete colEls.current[key];
  }, []);

  const handleDragStart = useCallback((skill: EnrichedSkill, e: React.PointerEvent) => {
    dragRef.current = { skill, startX: e.clientX, startY: e.clientY, dragging: false };
  }, []);

  const commitDrop = useCallback(async (
    skill: EnrichedSkill,
    target: { colKey: Status; rowIndex: number } | null
  ) => {
    if (!target || !session?.user || skill.status === target.colKey) return;
    await supabase
      .from("user_skills")
      .update({ status: target.colKey })
      .eq("user_id", session.user.id)
      .eq("skill_node_id", skill.skill_node_id);
    setSkills((prev) =>
      prev.map((s) => s.skill_node_id === skill.skill_node_id ? { ...s, status: target.colKey } : s)
    );
  }, [session]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.dragging) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return;
        d.dragging = true;
        setDragSkill(d.skill);
      }
      setGhostPos({ x: e.clientX, y: e.clientY });
      let target: { colKey: Status; rowIndex: number } | null = null;
      for (const col of COLUMNS) {
        const el = colEls.current[col.key];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) continue;
        const cards = el.querySelectorAll("[data-kanban-card]");
        let rowIndex = cards.length;
        for (let i = 0; i < cards.length; i++) {
          const cr = cards[i].getBoundingClientRect();
          if (e.clientY < cr.top + cr.height / 2) { rowIndex = i; break; }
        }
        target = { colKey: col.key, rowIndex };
        break;
      }
      dropRef.current = target;
      setDropTarget(target);
    };
    const onUp = () => {
      const d = dragRef.current;
      if (d?.dragging) commitDrop(d.skill, dropRef.current);
      dragRef.current = null;
      dropRef.current = null;
      setDragSkill(null);
      setGhostPos(null);
      setDropTarget(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [commitDrop]);

  useEffect(() => {
    document.body.style.cursor = dragSkill ? "grabbing" : "";
    document.body.style.userSelect = dragSkill ? "none" : "";
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragSkill]);

  return (
    <>
    {editingSkill && session?.user && (
      <EditSkillModal
        node={editingSkill.node}
        index={editingSkill.index}
        userId={session.user.id}
        onSave={() => { setEditingSkill(null); fetchSkills(); }}
        onCancel={() => setEditingSkill(null)}
      />
    )}
    {dragSkill && ghostPos && (
      <div
        style={{
          position: "fixed",
          left: ghostPos.x - 90,
          top: ghostPos.y - 40,
          width: 180,
          zIndex: 9999,
          pointerEvents: "none",
          transform: "rotate(3deg) scale(0.95)",
          boxShadow: "0 20px 40px rgba(0,0,0,0.18)",
          borderRadius: 20,
          background: "white",
          overflow: "hidden",
        }}
      >
        <div style={{ height: 56, background: "linear-gradient(135deg,#7c3aed,#a855f7)" }} />
        <div style={{ padding: "10px 14px" }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827" }}>{dragSkill.node.name}</p>
          <p style={{ margin: "3px 0 0", fontSize: 11, color: "#9ca3af" }}>{dragSkill.category}</p>
        </div>
      </div>
    )}
    <div className="flex flex-1 flex-col gap-6 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-white hover:text-gray-700"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Skills Overview</h1>
            <p className="mt-0.5 text-base text-gray-500">
              All your skills in one place
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onGoToAdd}
            className="flex cursor-pointer items-center gap-2 rounded-xl bg-purple-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-800"
          >
            <Plus className="h-4 w-4" />
            Add skill
          </button>
          <div className="flex gap-0.5 rounded-xl bg-gray-100 p-1">
            <button
              onClick={() => setViewMode("list")}
              className={`cursor-pointer rounded-lg p-2 transition ${
                viewMode === "list"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              className={`cursor-pointer rounded-lg p-2 transition ${
                viewMode === "kanban"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-purple-600" />
        </div>
      ) : viewMode === "list" ? (
        <ListView
          skills={filtered}
          categories={categories}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          onEdit={openEdit}
          onTogglePin={handleTogglePin}
        />
      ) : (
        <KanbanView
          skills={filtered}
          onEdit={openEdit}
          onAdvance={handleAdvance}
          onTogglePin={handleTogglePin}
          dragSkillId={dragSkill?.skill_node_id ?? null}
          dropTarget={dropTarget}
          onDragStart={handleDragStart}
          onRegisterCol={registerCol}
        />
      )}
    </div>
    </>
  );
}

/* ── List View ── */

function ListView({
  skills,
  categories,
  activeCategory,
  onCategoryChange,
  onEdit,
  onTogglePin,
}: {
  skills: EnrichedSkill[];
  categories: { id: string; name: string }[];
  activeCategory: string;
  onCategoryChange: (id: string) => void;
  onEdit: (node: SkillNode, index: number) => void;
  onTogglePin: (skillNodeId: string, currentPinned: boolean) => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-2xl bg-white min-h-0">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onCategoryChange(cat.id)}
              className={`cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                activeCategory === cat.id
                  ? "bg-purple-700 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50">
            <ArrowUpDown className="h-3.5 w-3.5" />
            Sort
          </button>
          <button className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filter
          </button>
        </div>
      </div>

      {/* Table header */}
      <div className="grid shrink-0 grid-cols-[2.5rem_1fr_8rem_8rem_8rem_8rem_7rem_2.5rem] border-b border-gray-100 px-6 py-3">
        <div>
          <input type="checkbox" className="cursor-pointer rounded border-gray-300" />
        </div>
        {["Skill", "Learned for", "Started", "Parent", "Category", "Status"].map((h) => (
          <div key={h} className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            {h}
          </div>
        ))}
        <div />
      </div>

      {/* Rows */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(156,163,175,0.3) transparent" }}
      >
        {skills.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400">No skills found</p>
          </div>
        ) : (
          skills.map((skill, i) => (
            <div
              key={skill.skill_node_id}
              className="grid cursor-pointer grid-cols-[2.5rem_1fr_8rem_8rem_8rem_8rem_7rem_2.5rem] items-center border-b border-gray-50 px-6 py-3.5 transition hover:bg-gray-50"
            >
              <div>
                <input type="checkbox" className="cursor-pointer rounded border-gray-300" />
              </div>
              <div className="flex items-center gap-3" onClick={() => onEdit(skill.node, i)}>
                {skill.node.image_url ? (
                  <img src={skill.node.image_url} alt={skill.node.name} className="h-9 w-9 rounded-lg object-cover" />
                ) : (
                  <IridescentSquare skillId={skill.skill_node_id} index={i} />
                )}
                <span className="text-sm font-medium text-gray-900">{skill.node.name}</span>
              </div>
              <div className="text-sm text-gray-400" onClick={() => onEdit(skill.node, i)}>—</div>
              <div className="text-sm text-gray-400" onClick={() => onEdit(skill.node, i)}>
                {skill.startedAt
                  ? new Date(skill.startedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
                  : "—"}
              </div>
              <div className="text-sm text-gray-500" onClick={() => onEdit(skill.node, i)}>{skill.parent}</div>
              <div className="text-sm text-gray-500" onClick={() => onEdit(skill.node, i)}>{skill.category}</div>
              <div onClick={() => onEdit(skill.node, i)}><StatusBadge status={skill.status} /></div>
              <button
                onClick={(e) => { e.stopPropagation(); onTogglePin(skill.skill_node_id, skill.pinned); }}
                className={`cursor-pointer rounded-lg p-1 transition hover:bg-gray-100 ${skill.pinned ? "text-purple-600" : "text-gray-300 hover:text-gray-500"}`}
                title={skill.pinned ? "Unpin" : "Pin to top"}
              >
                <Pin className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ── Kanban View ── */

function KanbanView({
  skills,
  onEdit,
  onAdvance,
  onTogglePin,
  dragSkillId,
  dropTarget,
  onDragStart,
  onRegisterCol,
}: {
  skills: EnrichedSkill[];
  onEdit: (node: SkillNode, index: number) => void;
  onAdvance: (skillNodeId: string, currentStatus: Status) => void;
  onTogglePin: (skillNodeId: string, currentPinned: boolean) => void;
  dragSkillId: string | null;
  dropTarget: { colKey: Status; rowIndex: number } | null;
  onDragStart: (skill: EnrichedSkill, e: React.PointerEvent) => void;
  onRegisterCol: (key: Status, el: HTMLDivElement | null) => void;
}) {
  return (
    <div className="grid flex-1 min-h-0 overflow-hidden grid-cols-4 gap-3">
      {COLUMNS.map((col) => {
        const colSkills = skills.filter((s) => s.status === col.key);
        const isDropCol = !!dropTarget && dropTarget.colKey === col.key;
        const dropRow = isDropCol ? dropTarget!.rowIndex : -1;

        const items: React.ReactNode[] = [];
        for (let i = 0; i <= colSkills.length; i++) {
          if (isDropCol && dropRow === i) {
            items.push(
              <div
                key="__placeholder__"
                style={{
                  height: 140,
                  borderRadius: 20,
                  background: "#f9fafb",
                  border: "2px dashed #d1d5db",
                  flexShrink: 0,
                }}
              />
            );
          }
          if (i < colSkills.length) {
            const skill = colSkills[i];
            items.push(
              <KanbanCard
                key={skill.skill_node_id}
                skill={skill}
                index={i}
                onEdit={onEdit}
                onAdvance={onAdvance}
                onTogglePin={onTogglePin}
                isLast={col.key === COLUMNS[COLUMNS.length - 1].key}
                isDragSource={dragSkillId === skill.skill_node_id}
                onDragStart={onDragStart}
              />
            );
          }
        }

        return (
          <div key={col.key} className="flex min-h-0 flex-col gap-2 overflow-hidden">
            {/* Column header */}
            <div className={`shrink-0 rounded-2xl bg-linear-to-br ${col.gradient} px-4 py-3.5`}>
              <div className="flex items-center justify-between">
                <p className={`text-base font-bold ${col.accent}`}>{col.label}</p>
                <button className={`rounded-full bg-black/5 p-1.5 transition hover:bg-black/10 ${col.accent}`}>
                  <ListFilter className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-0.5 text-xs text-gray-400">
                {colSkills.length} {colSkills.length === 1 ? "skill" : "skills"}
              </p>
            </div>

            {/* Cards */}
            <div
              ref={(el) => onRegisterCol(col.key, el)}
              className="flex flex-1 flex-col gap-2 overflow-y-auto"
              style={{ scrollbarWidth: "none" }}
            >
              {colSkills.length === 0 && !isDropCol ? (
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-xs text-gray-300">No skills here</p>
                </div>
              ) : (
                items
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({
  skill,
  index,
  onEdit,
  onAdvance,
  onTogglePin,
  isLast,
  isDragSource,
  onDragStart,
}: {
  skill: EnrichedSkill;
  index: number;
  onEdit: (node: SkillNode, index: number) => void;
  onAdvance: (skillNodeId: string, currentStatus: Status) => void;
  onTogglePin: (skillNodeId: string, currentPinned: boolean) => void;
  isLast: boolean;
  isDragSource: boolean;
  onDragStart: (skill: EnrichedSkill, e: React.PointerEvent) => void;
}) {
  return (
    <div
      data-kanban-card
      className="shrink-0 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-gray-100"
      style={{ opacity: isDragSource ? 0.3 : 1, cursor: "grab", touchAction: "none", transition: "opacity 0.15s" }}
      onPointerDown={(e) => onDragStart(skill, e)}
    >
      {/* Image — 90% width with padding */}
      <div className="relative px-3 pt-3" onClick={() => onEdit(skill.node, index)}>
        <div className="cursor-pointer overflow-hidden rounded-2xl">
          {skill.node.image_url ? (
            <img src={skill.node.image_url} alt={skill.node.name} className="h-20 w-full object-cover" />
          ) : (
            <div className={`h-20 w-full ${colorForIndex(index)}`} />
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onTogglePin(skill.skill_node_id, skill.pinned); }}
          className={`absolute right-5 top-5 cursor-pointer rounded-md p-1 transition ${
            skill.pinned
              ? "bg-purple-600 text-white shadow-sm"
              : "bg-white/80 text-gray-400 hover:bg-white hover:text-gray-600"
          }`}
          title={skill.pinned ? "Unpin" : "Pin to dashboard"}
        >
          <Pin className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Name + bottom row */}
      <div className="px-3.5 pb-3 pt-2.5">
        <p
          onClick={() => onEdit(skill.node, index)}
          className="cursor-pointer text-sm font-semibold text-gray-900"
        >
          {skill.node.name}
        </p>
        <div className="mt-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Progress</span>
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 -rotate-90">
              <circle cx="12" cy="12" r="8" stroke="#e5e7eb" strokeWidth="2.5" />
              <circle cx="12" cy="12" r="8" stroke="#7c3aed" strokeWidth="2.5"
                strokeLinecap="round" strokeDasharray="20 30.3" />
            </svg>
          </div>
          {!isLast && (
            <button
              onClick={() => onAdvance(skill.skill_node_id, skill.status)}
              className="cursor-pointer rounded-full border border-gray-200 p-1 text-gray-400 transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-600"
              title="Move to next column"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Iridescent square (CSS-only, no WebGL) ── */

/** FNV-1a hash — proper avalanche effect, great for UUID strings */
function fnv32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Xorshift32 PRNG seeded from FNV-1a hash */
function seededRand(seed: number) {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

function IridescentSquare({ skillId, index }: { skillId: string; index: number }) {
  const rand = seededRand(fnv32(skillId));

  // Skip 15–45° (brown zone)
  const rh = () => { const h = Math.floor(rand() * 315); return h < 15 ? h : h + 30; };
  const rs = () => Math.floor(rand() * 15) + 82;
  const rl = () => Math.floor(rand() * 15) + 62;

  const count = Math.floor(rand() * 3) + 3; // 3–5 blobs
  const blobs = Array.from({ length: count }, () => ({
    hue: rh(), sat: rs(), lit: rl(),
    x: Math.floor(rand() * 110) - 10,   // –10 % to 100 %
    y: Math.floor(rand() * 110) - 10,
    size: Math.floor(rand() * 60) + 50, // 50–110 % of element
  }));

  return (
    <div
      className="h-9 w-9 shrink-0 rounded-lg relative overflow-hidden"
      style={{
        background: `hsl(${blobs[0].hue},${blobs[0].sat}%,${blobs[0].lit}%)`,
        animation: `iridShift ${3 + (index % 4) * 0.7}s ease-in-out ${(index % 7) * 0.45}s infinite alternate`,
      }}
    >
      {/* Blobs container extended beyond bounds so blur edge is never visible */}
      <div style={{ position: "absolute", inset: "-30%", filter: "blur(7px)" }}>
        {blobs.map((b, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              borderRadius: "50%",
              width: `${b.size}%`,
              height: `${b.size}%`,
              left: `${b.x}%`,
              top: `${b.y}%`,
              background: `hsl(${b.hue},${b.sat}%,${b.lit}%)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Status badge ── */

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  watchlist: { label: "Watchlist", className: "bg-violet-50 text-violet-700" },
  learning:  { label: "Learning",  className: "bg-blue-50 text-blue-700" },
  learned:   { label: "Learned",   className: "bg-emerald-50 text-emerald-700" },
  dormant:   { label: "Dormant",   className: "bg-slate-100 text-slate-600" },
};

function StatusBadge({ status }: { status: string }) {
  const badge = STATUS_BADGES[status] ?? { label: status, className: "bg-gray-100 text-gray-500" };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>
      {badge.label}
    </span>
  );
}
