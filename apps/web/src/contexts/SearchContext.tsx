import { createContext, useContext, useState } from "react";

interface SearchContextValue {
  query: string;
  setQuery: (q: string) => void;
  commit: () => void;        // user pressed Enter / clicked Search
  committed: string;         // the last committed query
}

const SearchContext = createContext<SearchContextValue>({
  query: "",
  setQuery: () => {},
  commit: () => {},
  committed: "",
});

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const [committed, setCommitted] = useState("");

  const commit = () => setCommitted(query);

  return (
    <SearchContext.Provider value={{ query, setQuery, commit, committed }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  return useContext(SearchContext);
}
