import { createContext, useContext, useState } from "react";

/**
 * The TopBar search query, shared with pages that filter their own list by it.
 *
 * pageScope: the category the current page already shows filtered (Chats →
 * 'chats', Discover → 'people', Add Skills → 'new_skills'). The global search
 * panel then only adds "Also found: …" instead of covering the list.
 */
export type PageScope = "chats" | "people" | "new_skills";

interface SearchContextValue {
  query: string;
  setQuery: (q: string) => void;
  commit: () => void;        // user pressed Enter / clicked Search
  committed: string;         // the last committed query
  pageScope: PageScope | null;
  setPageScope: (s: PageScope | null) => void;
}

const SearchContext = createContext<SearchContextValue>({
  query: "",
  setQuery: () => {},
  commit: () => {},
  committed: "",
  pageScope: null,
  setPageScope: () => {},
});

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const [committed, setCommitted] = useState("");
  const [pageScope, setPageScope] = useState<PageScope | null>(null);

  const commit = () => setCommitted(query);

  return (
    <SearchContext.Provider value={{ query, setQuery, commit, committed, pageScope, setPageScope }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  return useContext(SearchContext);
}
