import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../contexts/AuthProvider";
import { ScrollRow, LeafCard } from "./cards";
import type { UserSkillRow } from "./types";

interface MySkillsViewProps {
  onSkillCountChange: (count: number) => void;
  onGoToAdd: () => void;
}

export default function MySkillsView({ onSkillCountChange, onGoToAdd }: MySkillsViewProps) {
  const { session } = useAuth();
  const [userSkills, setUserSkills] = useState<UserSkillRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUserSkills = useCallback(async () => {
    if (!session?.user) return;

    const { data: userSkillRows } = await supabase
      .from("user_skills")
      .select("skill_node_id")
      .eq("user_id", session.user.id);

    if (!userSkillRows || userSkillRows.length === 0) {
      setUserSkills([]);
      onSkillCountChange(0);
      return;
    }

    const ids = userSkillRows.map((r: { skill_node_id: string }) => r.skill_node_id);
    const { data: nodes } = await supabase
      .from("skill_nodes")
      .select("*")
      .in("id", ids);

    const nodeMap: Record<string, UserSkillRow["skill_nodes"]> = {};
    (nodes ?? []).forEach((n) => (nodeMap[n.id] = n));

    const rows: UserSkillRow[] = userSkillRows
      .filter((r: { skill_node_id: string }) => nodeMap[r.skill_node_id])
      .map((r: { skill_node_id: string }) => ({
        skill_node_id: r.skill_node_id,
        skill_nodes: nodeMap[r.skill_node_id],
      }));

    setUserSkills(rows);
    onSkillCountChange(rows.length);
  }, [session, onSkillCountChange]);

  useEffect(() => {
    fetchUserSkills().then(() => setLoading(false));
  }, [fetchUserSkills]);

  const removeSkill = async (skillNodeId: string) => {
    if (!session?.user) return;
    await supabase
      .from("user_skills")
      .delete()
      .eq("user_id", session.user.id)
      .eq("skill_node_id", skillNodeId);
    setUserSkills((prev) => {
      const next = prev.filter((s) => s.skill_node_id !== skillNodeId);
      onSkillCountChange(next.length);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-purple-600" />
      </div>
    );
  }

  if (userSkills.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="text-5xl">🎯</div>
        <div>
          <p className="text-xl font-normal text-gray-800">No skills yet</p>
          <p className="mt-1 text-sm text-gray-400">
            Head over to the Add Skills tab to get started.
          </p>
        </div>
        <button
          onClick={onGoToAdd}
          className="mt-2 rounded-xl bg-purple-700 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-800"
        >
          Add your first skill
        </button>
      </div>
    );
  }

  const recent = userSkills.slice(0, 8);

  return (
    <div className="flex flex-col gap-8">
      {/* Recently added */}
      <ScrollRow label="Recently added">
        {recent.map((row, i) => (
          <LeafCard
            key={row.skill_node_id}
            node={row.skill_nodes}
            numUsers={0}
            index={i}
            action={{ type: "remove", onClick: () => removeSkill(row.skill_node_id) }}
          />
        ))}
      </ScrollRow>

      {/* All skills */}
      <section>
        <h2 className="mb-4 text-2xl font-normal text-gray-900">All your skills</h2>
        <div className="flex flex-wrap gap-4">
          {userSkills.map((row, i) => (
            <LeafCard
              key={row.skill_node_id}
              node={row.skill_nodes}
              numUsers={0}
              index={i}
              action={{ type: "remove", onClick: () => removeSkill(row.skill_node_id) }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
