import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Plus } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../contexts/AuthProvider";
import { useSearch } from "../../contexts/SearchContext";
import { ScrollRow, LeafCard } from "./cards";
import AddSkillsView from "./AddSkillsView";
import AllSkillsView from "./AllSkillsView";
import EditSkillModal from "./EditSkillModal";
import type { SkillNode } from "./types";

type View = "overview" | "all" | "add";

/* ── Big navigation card ── */
function NavCard({
  icon,
  title,
  description,
  color,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex h-full w-full cursor-pointer flex-col items-start rounded-2xl p-7 text-left transition hover:-translate-y-0.5 ${color}`}
      style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.07)" }}
    >
      <div className="mb-auto pb-8">{icon}</div>
      <p className="text-2xl font-semibold text-gray-900">{title}</p>
      <div className="mt-1 flex w-full items-center justify-between">
        <p className="text-sm text-gray-500">{description}</p>
        <ArrowRight className="h-4 w-4 text-gray-400 transition group-hover:translate-x-1" />
      </div>
    </button>
  );
}

/* ── Sub-page header with back button ── */
function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <button
        onClick={onBack}
        className="rounded-lg p-1.5 text-gray-400 transition hover:bg-white hover:text-gray-700"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <h1 className="text-3xl font-normal text-gray-900">{title}</h1>
    </div>
  );
}

/* ══════════════════════════════════════════════
   SKILLS PAGE
   ══════════════════════════════════════════════ */

export default function SkillsPage() {
  const { session } = useAuth();
  const { setQuery } = useSearch();
  const [view, setView] = useState<View>("overview");

  const goTo = (v: View) => {
    if (v !== "add") setQuery("");
    setView(v);
  };

  const [firstName, setFirstName] = useState("");
  const [skillCount, setSkillCount] = useState(0);
  const [recentSkills, setRecentSkills] = useState<SkillNode[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [editingNode, setEditingNode] = useState<{ node: SkillNode; index: number } | null>(null);

  /* ── profile name ── */
  useEffect(() => {
    if (!session?.user) return;
    supabase
      .from("profiles")
      .select("first_name")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        if (data?.first_name) setFirstName(data.first_name);
      });
  }, [session]);

  /* ── recently added skills ── */
  const fetchRecent = useCallback(async () => {
    if (!session?.user) return;

    const { data: rows } = await supabase
      .from("user_skills")
      .select("skill_node_id")
      .eq("user_id", session.user.id);

    if (!rows || rows.length === 0) {
      setSkillCount(0);
      setRecentSkills([]);
      return;
    }

    setSkillCount(rows.length);

    const ids = rows.map((r: { skill_node_id: string }) => r.skill_node_id).slice(0, 8);
    const { data: nodes } = await supabase
      .from("skill_nodes")
      .select("*")
      .in("id", ids);

    setRecentSkills(nodes ?? []);
  }, [session]);

  useEffect(() => {
    fetchRecent().then(() => setLoadingRecent(false));
  }, [fetchRecent]);

  /* ── add skill callback (re-fetch overview) ── */
  const handleSkillAdded = useCallback(() => {
    fetchRecent();
  }, [fetchRecent]);

  /* ══ All Skills view ══ */
  if (view === "all") {
    return (
      <div className="flex flex-1 flex-col -mx-7 px-7 -mt-5 pt-5 -mb-7 pb-8 min-h-0">
        <AllSkillsView onGoToAdd={() => goTo("add")} onBack={() => goTo("overview")} />
      </div>
    );
  }

  /* ══ Add Skills view ══ */
  if (view === "add") {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden -mx-7 px-7 -mt-5 pt-5 -mb-7 pb-8" style={{ scrollbarColor: "rgba(156,163,175,0.5) transparent" }}>
        <SubHeader title="Add Skills" onBack={() => goTo("overview")} />
        <AddSkillsView onSkillAdded={handleSkillAdded} />
      </div>
    );
  }

  /* ══ Overview ══ */
  return (
    <>
    {editingNode && session?.user && (
      <EditSkillModal
        node={editingNode.node}
        index={editingNode.index}
        userId={session.user.id}
        onSave={() => setEditingNode(null)}
        onCancel={() => setEditingNode(null)}
        onDelete={async () => {
          if (!session?.user || !editingNode) return;
          if (!confirm(`Remove "${editingNode.node.name}" from your profile?`)) return;
          await supabase
            .from("user_skill_attributes")
            .delete()
            .eq("user_id", session.user.id)
            .eq("skill_node_id", editingNode.node.id);
          await supabase
            .from("user_skills")
            .delete()
            .eq("user_id", session.user.id)
            .eq("skill_node_id", editingNode.node.id);
          setEditingNode(null);
          fetchRecent();
        }}
      />
    )}
    <div
      className="flex flex-1 flex-col gap-8 overflow-y-auto overflow-x-hidden -mx-7 px-7 -mt-5 pt-5 -mb-7 pb-8 skills-scroll"
      style={{ scrollbarColor: "rgba(156,163,175,0.5) transparent" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm text-gray-400">Hey, {firstName || "there"}!</p>
          <h1 className="mt-1 text-4xl font-normal text-gray-900">Your skills</h1>
        </div>
        <div className="flex items-center gap-3 pt-4">
          <span className="text-5xl font-normal text-gray-900">{skillCount}</span>
          <div className="leading-tight">
            <p className="text-xs font-semibold text-gray-500">Skills</p>
            <p className="text-[10px] text-gray-400">Total</p>
          </div>
        </div>
      </div>

      {/* Recently added */}
      {loadingRecent ? (
        <div className="flex h-16 items-center">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-gray-200 border-t-purple-600" />
        </div>
      ) : recentSkills.length > 0 ? (
        <ScrollRow label="Recently added">
          {recentSkills.map((node, i) => (
            <LeafCard
              key={node.id}
              node={node}
              numUsers={0}
              index={i}
              onView={() => setEditingNode({ node, index: i })}
            />
          ))}
        </ScrollRow>
      ) : null}

      {/* Nav cards */}
      <div className="grid flex-1 grid-cols-2 gap-4">
        <NavCard
          icon={<BookOpen className="h-7 w-7 text-violet-500" />}
          title="All Skills"
          description="View and manage your full skill list"
          color="bg-violet-50"
          onClick={() => goTo("all")}
        />
        <NavCard
          icon={<Plus className="h-7 w-7 text-emerald-500" />}
          title="Add Skills"
          description="Browse and discover new skills to add"
          color="bg-emerald-50"
          onClick={() => goTo("add")}
        />
      </div>
    </div>
    </>
  );
}
