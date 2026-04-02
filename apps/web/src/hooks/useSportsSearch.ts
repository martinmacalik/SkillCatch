import { useEffect, useMemo, useState } from 'react'

const ENDPOINT = 'https://query.wikidata.org/sparql'
const PAGE_SIZE = 50

type SportRow = {
  id: string
  label: string
  desc: string
}

type UseSportsSearchResult = {
  rows: SportRow[]
  loading: boolean
  error: string
  page: number
  setPage: (page: number) => void
  hasMore: boolean
}

function buildQuery({ search, offset }: { search: string; offset: number }): string {
  const searchFilter = search?.trim()
    ? `FILTER(CONTAINS(LCASE(STR(?label)), LCASE("${search.replaceAll('"', '\\"')}"))).`
    : ''

  return `
SELECT ?item ?label ?desc WHERE {
  {
    ?item wdt:P31 wd:Q349 .
  }
  UNION
  {
    ?item wdt:P279+ wd:Q349 .
  }

  ?item rdfs:label ?label .
  FILTER(LANG(?label) = "en").

  OPTIONAL {
    ?item schema:description ?desc .
    FILTER(LANG(?desc) = "en").
  }

  ${searchFilter}
}
ORDER BY ?label
LIMIT ${PAGE_SIZE}
OFFSET ${offset}
`
}

export function useSportsSearch(search: string): UseSportsSearchResult {
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<SportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const offset = useMemo(() => page * PAGE_SIZE, [page])

  useEffect(() => {
    const ac = new AbortController()

    async function run() {
      try {
        setLoading(true)
        setError('')

        const sparql = buildQuery({ search, offset })
        const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(sparql)}`

        const res = await fetch(url, {
          signal: ac.signal,
          headers: {
            Accept: 'application/sparql-results+json',
          },
        })

        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()

        const bindings = data?.results?.bindings ?? []
        setRows(
          bindings.map((b: any) => ({
            id: b.item.value,
            label: b.label.value,
            desc: b.desc?.value ?? '',
          }))
        )
      } catch (e: any) {
        if (e?.name !== 'AbortError') setError(e?.message ?? String(e))
      } finally {
        setLoading(false)
      }
    }

    run()
    return () => ac.abort()
  }, [search, offset])

  return {
    rows,
    loading,
    error,
    page,
    setPage,
    hasMore: rows.length === PAGE_SIZE,
  }
}
