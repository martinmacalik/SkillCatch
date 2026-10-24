import { useEffect, useState } from 'react'
import { searchPeople, type ChatProfile } from '@/lib/chat-queries'

// People search for the chat modals, with a small debounce so we don't
// query on every keystroke.
export function usePeopleSearch(myId: string) {
  const [query, setQuery] = useState('')
  const [people, setPeople] = useState<ChatProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      searchPeople(query, myId)
        .then(data => { if (!cancelled) { setPeople(data); setError(null) } })
        .catch(() => { if (!cancelled) setError('Search failed.') })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, myId])

  const search = (q: string) => {
    setQuery(q)
    setLoading(true)
  }

  return { query, search, people, loading, error }
}
