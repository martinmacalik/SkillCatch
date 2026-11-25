import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthProvider";
import { useSearch } from "../contexts/SearchContext";
import { usePageSearchScope } from "../hooks/usePageSearchScope";

interface UserProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
}

export default function DiscoverPage() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const [people, setPeople] = useState<UserProfile[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  // the TopBar search filters this list (no separate field here)
  const { query: peopleQuery, setQuery } = useSearch();
  usePageSearchScope("people");

  // the query is shared with other pages → start and leave clean
  useEffect(() => {
    setQuery("");
    return () => setQuery("");
  }, [setQuery]);
  const [firstName, setFirstName] = useState("");

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

  useEffect(() => {
    let cancelled = false;
    // small debounce: the query changes on every keystroke in the TopBar
    const t = setTimeout(() => {
      // strip characters that would break the PostgREST or() filter
      const q = peopleQuery.trim().replace(/[,()%*]/g, " ").trim();
      let query = supabase
        .from("profiles")
        .select("id, first_name, last_name, username, avatar_url, bio")
        .order("first_name")
        .limit(40);
      if (q) {
        query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,username.ilike.%${q}%`);
      }
      query.then(({ data }) => {
        if (cancelled) return;
        setPeople(data ?? []);
        setPeopleLoading(false);
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [peopleQuery]);

  return (
    <div className="flex flex-1 flex-col gap-8 overflow-y-auto pr-1">
      {/* Header */}
      <div>
        <p className="text-sm text-gray-400">Hey there, {firstName || "explorer"}!</p>
        <h1 className="mt-1 text-3xl font-bold text-gray-900">Discover people</h1>
      </div>

      {/* People grid */}
      {peopleLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-purple-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((person) => {
            const name =
              [person.first_name, person.last_name].filter(Boolean).join(" ") ||
              person.username ||
              "User";
            return (
              <button
                key={person.id}
                onClick={() => navigate(`/dashboard/profile/${person.id}`)}
                className="flex items-center gap-3 rounded-2xl bg-white p-4 text-left transition hover:-translate-y-0.5"
                style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}
              >
                {person.avatar_url ? (
                  <img
                    src={person.avatar_url}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded-full bg-linear-to-br from-pink-300 to-rose-400" />
                )}
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{name}</p>
                  {person.username && (
                    <p className="text-xs text-gray-400">@{person.username}</p>
                  )}
                  {person.bio && (
                    <p className="mt-0.5 truncate text-xs text-gray-500">{person.bio}</p>
                  )}
                </div>
              </button>
            );
          })}
          {people.length === 0 && (
            <p className="col-span-full py-12 text-center text-sm text-gray-400">
              {peopleQuery.trim() ? `No one matches “${peopleQuery.trim()}”.` : "No profiles yet."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
