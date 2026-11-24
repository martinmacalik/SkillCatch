import { useEffect } from 'react'
import { useSearch, type PageScope } from '@/contexts/SearchContext'

/**
 * A page that filters its own list by the TopBar query registers it while
 * mounted; the global search then only adds "Also found: …" on that page.
 */
export function usePageSearchScope(scope: PageScope) {
  const { setPageScope } = useSearch()
  useEffect(() => {
    setPageScope(scope)
    return () => setPageScope(null)
  }, [scope, setPageScope])
}
