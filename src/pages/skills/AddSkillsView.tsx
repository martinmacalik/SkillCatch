import { useEffect, useState, useCallback } from "react";
import { Search, ArrowLeft, ChevronRight } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../contexts/AuthProvider";
import { ScrollRow, LeafCard, BranchCard } from "./cards";
import type { SkillNode, SkillStat } from "./types";

interface AddSkillsViewProps {
  onSkillAdded: () => void;
}

export default function AddSkillsView({ onSkillAdded }: AddSkillsViewProps) {
  const { session } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");
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

  const addSkill = async (node: SkillNode) => {
    if (!session?.user || userSkillIds.has(node.id)) return;
    const { error } = await supabase
      .from("user_skills")
      .insert({ user_id: session.user.id, skill_node_id: node.id });
    if (!error) {
      setUserSkillIds((prev) => new Set([...prev, node.id]));
      onSkillAdded();
    }
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

  /* ── search ── */

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const { data } = await supabase
      .from("skill_nodes")
      .select("*")
      .ilike("name", `%${q}%`)
      .limit(30);
    setSearchResults(data ?? []);
  };

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
    <div className="flex flex-col gap-8">
      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!e.target.value.trim()) {
                setIsSearching(false);
                setSearchResults([]);
              }
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search for a skill..."
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-700 outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
          />
        </div>
        <button
          onClick={handleSearch}
          className="rounded-xl bg-purple-700 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-800"
        >
          Search
        </button>
      </div>

      {/* Search results */}
      {isSearching ? (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <button
              onClick={() => {
                setIsSearching(false);
                setSearchQuery("");
                setSearchResults([]);
              }}
              className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h2 className="text-2xl font-normal text-gray-900">
              Results for "{searchQuery}"
            </h2>
          </div>
          {searchResults.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-400">No skills found.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {searchResults.map((node, i) =>
                node.is_leaf ? (
                  <LeafCard
                    key={node.id}
                    node={node}
                    numUsers={statsMap[node.id] ?? 0}
                    index={i}
                    action={
                      !userSkillIds.has(node.id)
                        ? { type: "add", onClick: () => addSkill(node) }
                        : undefined
                    }
                  />
                ) : (
                  <BranchCard
                    key={node.id}
                    node={node}
                    numUsers={statsMap[node.id] ?? 0}
                    index={i}
                    onClick={() => openBranch(node)}
                  />
                )
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
                    !userSkillIds.has(node.id)
                      ? { type: "add", onClick: () => addSkill(node) }
                      : undefined
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
                    !userSkillIds.has(node.id)
                      ? { type: "add", onClick: () => addSkill(node) }
                      : undefined
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
                              ? { type: "add", onClick: () => addSkill(node) }
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
  );
}
