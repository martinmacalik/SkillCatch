import { useEffect, useState, useRef, useCallback } from "react";
import { Search, ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthProvider";

/* ── types ── */

interface SkillNode {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  is_leaf: boolean;
}

interface SkillStat {
  skill_node_id: string;
  num_users: number;
}

/* ── pastel banner palette ── */

const BANNER_COLORS = [
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

function colorForIndex(i: number) {
  return BANNER_COLORS[i % BANNER_COLORS.length];
}

/* ── horizontal scroll helpers ── */

function ScrollRow({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    ref.current?.scrollBy({
      left: dir === "left" ? -320 : 320,
      behavior: "smooth",
    });
  };

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">{label}</h2>
        <div className="flex gap-1">
          <button
            onClick={() => scroll("left")}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => scroll("right")}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div
        ref={ref}
        className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide"
        style={{ scrollbarWidth: "none" }}
      >
        {children}
      </div>
    </section>
  );
}

/* ── small leaf card (recommended / popular) ── */

function LeafCard({
  node,
  numUsers,
  index,
}: {
  node: SkillNode;
  numUsers: number;
  index: number;
}) {
  return (
    <div className="flex w-56 shrink-0 cursor-pointer flex-col rounded-2xl bg-white transition hover:-translate-y-0.5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
      {/* inset colour banner */}
      <div className="p-2.5 pb-0">
        <div className={`aspect-square w-full rounded-xl ${colorForIndex(index)}`} />
      </div>
      {/* text area */}
      <div className="flex flex-1 flex-col px-3.5 pb-3 pt-3">
        <p className="text-base font-bold leading-snug text-gray-900">{node.name}</p>
        <p className="mt-auto pt-6 text-[11px] text-gray-400">
          {numUsers >= 1000 ? `${(numUsers / 1000).toFixed(0)}k` : numUsers} people assigned
        </p>
      </div>
    </div>
  );
}

/* ── wider branch / category card ── */

function BranchCard({
  node,
  numUsers,
  index,
  onClick,
}: {
  node: SkillNode;
  numUsers: number;
  index: number;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="flex w-full cursor-pointer flex-col rounded-2xl bg-white transition hover:-translate-y-0.5"
      style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}
    >
      {/* inset colour banner */}
      <div className="p-3 pb-0">
        <div className={`h-28 w-full rounded-xl ${colorForIndex(index)}`} />
      </div>
      {/* text area */}
      <div className="px-4 pb-5 pt-4">
        <p className="text-xl font-bold leading-snug text-gray-900">{node.name}</p>
        <p className="mt-8 text-xs text-gray-400">
          {numUsers >= 1000 ? `${(numUsers / 1000).toFixed(0)}k` : numUsers} skills located here
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   DISCOVER PAGE
   ══════════════════════════════════════════════ */

export default function DiscoverPage() {
  const { session } = useAuth();

  /* ── state ── */
  const [firstName, setFirstName] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SkillNode[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [totalUserSkills, setTotalUserSkills] = useState(0);
  const [recommended, setRecommended] = useState<SkillNode[]>([]);
  const [popular, setPopular] = useState<SkillNode[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, number>>({});

  // "All skills" browsing
  const [rootNodes, setRootNodes] = useState<SkillNode[]>([]);
  const [currentBranch, setCurrentBranch] = useState<SkillNode | null>(null);
  const [branchChildren, setBranchChildren] = useState<SkillNode[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<SkillNode[]>([]);

  const [loading, setLoading] = useState(true);

  /* ── fetch profile name ── */
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

  /* ── fetch skill stats (all) ── */
  const fetchStats = useCallback(async () => {
    const { data } = await supabase.from("skill_stats").select("skill_node_id, num_users");
    if (data) {
      const map: Record<string, number> = {};
      data.forEach((s: SkillStat) => (map[s.skill_node_id] = s.num_users));
      setStatsMap(map);
    }
  }, []);

  /* ── fetch root nodes ── */
  const fetchRoots = useCallback(async () => {
    const { data } = await supabase
      .from("skill_nodes")
      .select("*")
      .is("parent_id", null)
      .order("name");
    if (data) setRootNodes(data);
  }, []);

  /* ── fetch user skills count ── */
  const fetchUserSkillCount = useCallback(async () => {
    if (!session?.user) return;
    const { count } = await supabase
      .from("user_skills")
      .select("*", { count: "exact", head: true })
      .eq("user_id", session.user.id);
    setTotalUserSkills(count ?? 0);
  }, [session]);

  /* ── fetch recommended (leaf siblings of the user's skills) ── */
  const fetchRecommended = useCallback(async () => {
    if (!session?.user) return;

    // Get user's leaf skill ids
    const { data: userSkills } = await supabase
      .from("user_skills")
      .select("skill_node_id")
      .eq("user_id", session.user.id);

    if (!userSkills || userSkills.length === 0) {
      // Fallback: show random leaf skills
      const { data: fallback } = await supabase
        .from("skill_nodes")
        .select("*")
        .eq("is_leaf", true)
        .limit(12);
      if (fallback) setRecommended(fallback);
      return;
    }

    const userSkillIds = userSkills.map((us) => us.skill_node_id);

    // Get parent ids of user's skills
    const { data: userNodes } = await supabase
      .from("skill_nodes")
      .select("parent_id")
      .in("id", userSkillIds);

    const parentIds = [
      ...new Set(
        (userNodes ?? [])
          .map((n) => n.parent_id)
          .filter(Boolean) as string[]
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

    // Get sibling leaf skills that the user does NOT have
    const { data: siblings } = await supabase
      .from("skill_nodes")
      .select("*")
      .in("parent_id", parentIds)
      .eq("is_leaf", true)
      .not("id", "in", `(${userSkillIds.join(",")})`)
      .limit(20);

    setRecommended(siblings ?? []);
  }, [session]);

  /* ── fetch popular leaf skills ── */
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

  /* ── initial load ── */
  useEffect(() => {
    Promise.all([
      fetchStats(),
      fetchRoots(),
      fetchUserSkillCount(),
      fetchRecommended(),
      fetchPopular(),
    ]).then(() => setLoading(false));
  }, [fetchStats, fetchRoots, fetchUserSkillCount, fetchRecommended, fetchPopular]);

  /* ── drill into a branch ── */
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

  /* ── loading state ── */
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-purple-600" />
      </div>
    );
  }

  /* ── which nodes to show in "All skills" ── */
  const allSkillsNodes = currentBranch ? branchChildren : rootNodes;
  const allSkillsTitle = currentBranch ? currentBranch.name : "All skills";

  return (
    <div className="flex flex-1 flex-col gap-8 overflow-y-auto pr-1">
      {/* ═══ Header ═══ */}
      <div className="flex items-start justify-between gap-6">
        {/* left */}
        <div className="flex-1">
          <p className="text-sm text-gray-400">
            Hey there, {firstName || "explorer"}!
          </p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">
            Explore all the skills here
          </h1>

          {/* search bar */}
          <div className="mt-4 flex items-center gap-2">
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
                placeholder="Search"
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
        </div>

        {/* right – skill counter */}
        <div className="flex items-center gap-3 pt-4">
          <span className="text-4xl font-bold text-gray-900">
            {totalUserSkills}
          </span>
          <div className="leading-tight">
            <p className="text-xs font-semibold text-gray-500">Skills</p>
            <p className="text-[10px] text-gray-400">Total</p>
          </div>
        </div>
      </div>

      {/* ═══ Search results (replaces main content while searching) ═══ */}
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
            <h2 className="text-xl font-bold text-gray-900">
              Results for "{searchQuery}"
            </h2>
          </div>
          {searchResults.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-400">
              No skills found.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {searchResults.map((node, i) =>
                node.is_leaf ? (
                  <LeafCard
                    key={node.id}
                    node={node}
                    numUsers={statsMap[node.id] ?? 0}
                    index={i}
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
          {/* ═══ Recommended for you ═══ */}
          {recommended.length > 0 && (
            <ScrollRow label="Recommended for you">
              {recommended.map((node, i) => (
                <LeafCard
                  key={node.id}
                  node={node}
                  numUsers={statsMap[node.id] ?? 0}
                  index={i}
                />
              ))}
            </ScrollRow>
          )}

          {/* ═══ Popular skills ═══ */}
          {popular.length > 0 && (
            <ScrollRow label="Popular skills">
              {popular.map((node, i) => (
                <LeafCard
                  key={node.id}
                  node={node}
                  numUsers={statsMap[node.id] ?? 0}
                  index={i}
                />
              ))}
            </ScrollRow>
          )}

          {/* ═══ All skills (browsable branches) ═══ */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              {currentBranch && (
                <button
                  onClick={goBack}
                  className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              <h2 className="text-xl font-bold text-gray-900">
                {allSkillsTitle}
              </h2>
            </div>

            {allSkillsNodes.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">
                No skills in this category yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
                {allSkillsNodes.map((node, i) =>
                  node.is_leaf ? (
                    <LeafCard
                      key={node.id}
                      node={node}
                      numUsers={statsMap[node.id] ?? 0}
                      index={i}
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
        </>
      )}
    </div>
  );
}
