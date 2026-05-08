import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../contexts/AuthProvider";
import { useSearch } from "../../contexts/SearchContext";
import { ScrollRow, LeafCard, BranchCard } from "./cards";
import AddSkillModal, { type AttributeValue } from "./AddSkillModal";
import type { SkillNode, SkillStat } from "./types";

interface AddSkillsViewProps {
  onSkillAdded: () => void;
}

export default function AddSkillsView({ onSkillAdded }: AddSkillsViewProps) {
  const { session } = useAuth();
  const { query, setQuery } = useSearch();

  const [searchResults, setSearchResults] = useState<SkillNode[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [recommended, setRecommended] = useState<SkillNode[]>([]);
  const [popular, setPopular] = useState<SkillNode[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, number>>({});
  const [userSkillIds, setUserSkillIds] = useState<Set<string>>(new Set());

  const [rootNodes, setRootNodes] = useState<SkillNode[]>([]);
  const [currentBranch, setCurrentBranch] = useState<SkillNode | null>(null);
  const [branchChildren, setBranchChildren] = useState<SkillNode[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<SkillNode[]>([]);

  const [loading, setLoading] = useState(true);
  const [pendingNode, setPendingNode] = useState<{ node: SkillNode; index: number } | null>(null);

  /* ── data fetching ── */

  const fetchStats = useCallback(async () => {
    const { data } = await supabase.from("skill_stats").select("skill_node_id, num_users");
    if (data) {
      const map: Record<string, number> = {};
      data.forEach((s: SkillStat) => (map[s.skill_node_id] = s.num_users));
      setStatsMap(map);
    }
  }, []);

  const fetchRoots = useCallback(async () => {
    const { data } = await supabase
      .from("skill_nodes")
      .select("*")
      .is("parent_id", null)
      .order("name");
    if (data) setRootNodes(data);
  }, []);

  const fetchUserSkillIds = useCallback(async () => {
    if (!session?.user) return;
    const { data } = await supabase
      .from("user_skills")
      .select("skill_node_id")
      .eq("user_id", session.user.id);
    setUserSkillIds(new Set((data ?? []).map((r: { skill_node_id: string }) => r.skill_node_id)));
  }, [session]);

  const fetchRecommended = useCallback(async () => {
    if (!session?.user) return;

    const { data: userSkills } = await supabase
      .from("user_skills")
      .select("skill_node_id")
      .eq("user_id", session.user.id);

    if (!userSkills || userSkills.length === 0) {
      const { data: fallback } = await supabase
        .from("skill_nodes")
        .select("*")
        .eq("is_leaf", true)
        .limit(12);
      if (fallback) setRecommended(fallback);
      return;
    }

    const userSkillIds = userSkills.map((us) => us.skill_node_id);
    const { data: userNodes } = await supabase
      .from("skill_nodes")
      .select("parent_id")
      .in("id", userSkillIds);

    const parentIds = [
      ...new Set(
        (userNodes ?? []).map((n) => n.parent_id).filter(Boolean) as string[]
      ),
    ];

    if (parentIds.length === 0) {
      const { data: fallback } = await supabase
        .from("skill_nodes")
        .select("*")
        .eq("is_leaf", true)
        .limit(12);
      if (fallback) setRecommended(fallback);
      return;
    }

    const { data: siblings } = await supabase
      .from("skill_nodes")
      .select("*")
      .in("parent_id", parentIds)
      .eq("is_leaf", true)
      .not("id", "in", `(${userSkillIds.join(",")})`)
      .limit(20);

    setRecommended(siblings ?? []);
  }, [session]);

  const fetchPopular = useCallback(async () => {
    const { data: topStats } = await supabase
      .from("skill_stats")
      .select("skill_node_id, num_users")
      .order("num_users", { ascending: false })
      .limit(20);

    if (!topStats || topStats.length === 0) return;

    const ids = topStats.map((s: SkillStat) => s.skill_node_id);
    const { data: nodes } = await supabase
      .from("skill_nodes")
      .select("*")
      .in("id", ids)
      .eq("is_leaf", true);

    if (nodes) setPopular(nodes);
  }, []);

  useEffect(() => {
    Promise.all([
      fetchStats(),
      fetchRoots(),
      fetchUserSkillIds(),
      fetchRecommended(),
      fetchPopular(),
    ]).then(() => setLoading(false));
  }, [fetchStats, fetchRoots, fetchUserSkillIds, fetchRecommended, fetchPopular]);

  /* ── add skill ── */

  // Opens the confirmation modal
  const openAddModal = (node: SkillNode, index: number) => {
    if (!session?.user || userSkillIds.has(node.id)) return;
    setPendingNode({ node, index });
  };

  // Called when user confirms in the modal — returns a promise so the modal
  // can animate success before it closes itself via onDone.
  const confirmAddSkill = async (attributeValues: AttributeValue[], status: string): Promise<void> => {
    if (!session?.user || !pendingNode) return;
    const { node } = pendingNode;

    const { error } = await supabase
      .from("user_skills")
      .insert({ user_id: session.user.id, skill_node_id: node.id, status });

    if (error) throw error;

    if (attributeValues.length > 0) {
      await supabase.from("user_skill_attributes").insert(
        attributeValues.map((av) => ({
          user_id: session.user.id,
          skill_node_id: node.id,
          attribute_def_id: av.attribute_def_id,
          value_json: av.value_json,
        }))
      );
    }
    setUserSkillIds((prev) => new Set([...prev, node.id]));
    onSkillAdded();
    // Modal closes itself after its success animation via onDone
  };

  /* ── branch navigation ── */

  const openBranch = async (node: SkillNode) => {
    setBreadcrumbs((prev) => [...prev, node]);
    setCurrentBranch(node);
    const { data } = await supabase
      .from("skill_nodes")
      .select("*")
      .eq("parent_id", node.id)
      .order("name");
    setBranchChildren(data ?? []);
  };

  const goBack = () => {
    const prev = [...breadcrumbs];
    prev.pop();
    setBreadcrumbs(prev);
    if (prev.length === 0) {
      setCurrentBranch(null);
      setBranchChildren([]);
    } else {
      const parent = prev[prev.length - 1];
      setCurrentBranch(parent);
      supabase
        .from("skill_nodes")
        .select("*")
        .eq("parent_id", parent.id)
        .order("name")
        .then(({ data }) => setBranchChildren(data ?? []));
    }
  };

  /* ── search driven by TopBar ── */

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    supabase
      .from("skill_nodes")
      .select("*")
      .ilike("name", `%${q}%`)
      .limit(30)
      .then(({ data }) => setSearchResults(data ?? []));
  }, [query]);

  /* ── loading ── */

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-purple-600" />
      </div>
    );
  }

  const allSkillsNodes = currentBranch ? branchChildren : rootNodes;

  return (
    <>
    <div className="flex flex-col gap-8">
      {/* Search results */}
      {isSearching ? (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <button
              onClick={() => {
                setIsSearching(false);
                setSearchResults([]);
                setQuery("");
              }}
              className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h2 className="text-2xl font-normal text-gray-900">
              Results for "{query}"
            </h2>
          </div>
          {searchResults.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-400">No skills found.</p>
          ) : (
            <div className="flex flex-col gap-5">
              {/* Branches first */}
              {searchResults.filter((n) => !n.is_leaf).length > 0 && (
                <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
                  {searchResults.filter((n) => !n.is_leaf).map((node, i) => (
                    <BranchCard
                      key={node.id}
                      node={node}
                      numUsers={statsMap[node.id] ?? 0}
                      index={i}
                      onClick={() => openBranch(node)}
                    />
                  ))}
                </div>
              )}
              {/* Leaf nodes: 3 per branch column, same gap */}
              {searchResults.filter((n) => n.is_leaf).length > 0 && (
                <div className="grid grid-cols-6 gap-5 lg:grid-cols-9">
                  {searchResults.filter((n) => n.is_leaf).map((node, i) => (
                    <LeafCard
                      key={node.id}
                      node={node}
                      numUsers={statsMap[node.id] ?? 0}
                      index={i}
                      fill
                      action={
                        userSkillIds.has(node.id)
                          ? { type: "added" }
                          : { type: "add", onClick: () => openAddModal(node, i) }
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Recommended */}
          {recommended.length > 0 && (
            <ScrollRow label="Recommended for you">
              {recommended.map((node, i) => (
                <LeafCard
                  key={node.id}
                  node={node}
                  numUsers={statsMap[node.id] ?? 0}
                  index={i}
                  action={
                    userSkillIds.has(node.id)
                      ? { type: "added" }
                      : { type: "add", onClick: () => openAddModal(node, i) }
                  }
                />
              ))}
            </ScrollRow>
          )}

          {/* Popular */}
          {popular.length > 0 && (
            <ScrollRow label="Popular skills">
              {popular.map((node, i) => (
                <LeafCard
                  key={node.id}
                  node={node}
                  numUsers={statsMap[node.id] ?? 0}
                  index={i}
                  action={
                    userSkillIds.has(node.id)
                      ? { type: "added" }
                      : { type: "add", onClick: () => openAddModal(node, i) }
                  }
                />
              ))}
            </ScrollRow>
          )}

          {/* Browse all */}
          <section>
            <div className="mb-4 flex items-center gap-2">
              {currentBranch && (
                <button
                  onClick={goBack}
                  className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              <h2 className="flex items-center gap-1.5 text-2xl font-normal text-gray-900">
                <span
                  className={
                    currentBranch
                      ? "cursor-pointer text-gray-400 transition hover:text-gray-700"
                      : ""
                  }
                  onClick={
                    currentBranch
                      ? () => {
                          setCurrentBranch(null);
                          setBranchChildren([]);
                          setBreadcrumbs([]);
                        }
                      : undefined
                  }
                >
                  All skills
                </span>
                {breadcrumbs.map((crumb, i) => (
                  <span key={crumb.id} className="flex items-center gap-1.5">
                    <ChevronRight className="h-4 w-4 text-gray-300" />
                    <span
                      className={
                        i < breadcrumbs.length - 1
                          ? "cursor-pointer text-gray-400 transition hover:text-gray-700"
                          : "text-gray-900"
                      }
                      onClick={
                        i < breadcrumbs.length - 1
                          ? () => {
                              const newCrumbs = breadcrumbs.slice(0, i + 1);
                              setBreadcrumbs(newCrumbs);
                              const target = newCrumbs[newCrumbs.length - 1];
                              setCurrentBranch(target);
                              supabase
                                .from("skill_nodes")
                                .select("*")
                                .eq("parent_id", target.id)
                                .order("name")
                                .then(({ data }) => setBranchChildren(data ?? []));
                            }
                          : undefined
                      }
                    >
                      {crumb.name}
                    </span>
                  </span>
                ))}
              </h2>
            </div>

            {allSkillsNodes.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">
                No skills in this category yet.
              </p>
            ) : (
              <>
                {allSkillsNodes.filter((n) => !n.is_leaf).length > 0 && (
                  <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
                    {allSkillsNodes
                      .filter((n) => !n.is_leaf)
                      .map((node, i) => (
                        <BranchCard
                          key={node.id}
                          node={node}
                          numUsers={statsMap[node.id] ?? 0}
                          index={i}
                          onClick={() => openBranch(node)}
                        />
                      ))}
                  </div>
                )}
                {allSkillsNodes.filter((n) => n.is_leaf).length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-4">
                    {allSkillsNodes
                      .filter((n) => n.is_leaf)
                      .map((node, i) => (
                        <LeafCard
                          key={node.id}
                          node={node}
                          numUsers={statsMap[node.id] ?? 0}
                          index={i}
                          action={
                            !userSkillIds.has(node.id)
                              ? { type: "add", onClick: () => openAddModal(node, i) }
                              : undefined
                          }
                        />
                      ))}
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>

    {pendingNode && (
      <AddSkillModal
        node={pendingNode.node}
        index={pendingNode.index}
        onConfirm={confirmAddSkill}
        onCancel={() => setPendingNode(null)}
        onDone={() => setPendingNode(null)}
      />
    )}
    </>
  );
}
