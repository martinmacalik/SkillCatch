import type { SchoolRecord, UniversityRecord } from '@/types/institutions'
import { searchKey } from '@/lib/searchKey'

/** One searchable row, whatever list it came from. */
export interface InstitutionOption {
  id: string
  name: string
  /** Second line: "Praha 4 · ZŠ, MŠ" or the university domain. */
  detail: string
  domains: string[] | null
  /** Pre-normalised name + city for accent-insensitive search. */
  key: string
}

/*
 * import.meta.glob gives one lazy loader per JSON file. Vite turns each into a
 * separate chunk that is only downloaded when the loader is called, so ~1 MB
 * of school names never lands in the main bundle. Adding a country = dropping
 * a new src/data/schools/<cc>.json file in; nothing here changes.
 */
const schoolLoaders = import.meta.glob<SchoolRecord[]>('../data/schools/*.json', { import: 'default' })
const universityLoader = import.meta.glob<UniversityRecord[]>('../data/universities.json', { import: 'default' })

/** "../data/schools/cz.json" → "CZ" */
const SCHOOL_LOADER_BY_COUNTRY = new Map(
  Object.entries(schoolLoaders).map(([path, load]) => [path.match(/([a-z]{2})\.json$/i)?.[1].toUpperCase() ?? '', load]),
)

export function hasSchoolList(countryCode: string): boolean {
  return SCHOOL_LOADER_BY_COUNTRY.has(countryCode.toUpperCase())
}

/* Each list is fetched + indexed once per session, then served from memory. */
const cache = new Map<string, Promise<InstitutionOption[]>>()

function cached(cacheKey: string, build: () => Promise<InstitutionOption[]>): Promise<InstitutionOption[]> {
  let hit = cache.get(cacheKey)
  if (!hit) {
    hit = build()
    hit.catch(() => cache.delete(cacheKey)) // a failed download may be retried later
    cache.set(cacheKey, hit)
  }
  return hit
}

export function loadSchools(countryCode: string): Promise<InstitutionOption[]> | null {
  const cc = countryCode.toUpperCase()
  const load = SCHOOL_LOADER_BY_COUNTRY.get(cc)
  if (!load) return null
  return cached(`school:${cc}`, async () =>
    (await load()).map((s) => ({
      id: s.id,
      name: s.name,
      detail: [s.city, s.type].filter(Boolean).join(' · '),
      domains: null,
      key: searchKey(`${s.name} ${s.city}`),
    })),
  )
}

export function loadUniversities(countryCode: string): Promise<InstitutionOption[]> {
  const cc = countryCode.toUpperCase()
  return cached(`university:${cc}`, async () => {
    const load = Object.values(universityLoader)[0]
    const all = load ? await load() : []
    return all
      .filter((u) => u.countryCode === cc)
      .map((u) => ({
        id: u.id,
        name: u.name,
        detail: u.domains.join(', '),
        domains: u.domains.length ? u.domains : null,
        key: searchKey(`${u.name} ${u.domains.join(' ')}`),
      }))
  })
}

export const MAX_RESULTS = 20

/**
 * Every word of the query must appear somewhere ("zs brno" finds
 * "Základní škola … Brno"). Names starting with the query rank first.
 */
export function searchInstitutions(options: InstitutionOption[], query: string): InstitutionOption[] {
  const words = searchKey(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const first = words.join(' ')
  const starts: InstitutionOption[] = []
  const rest: InstitutionOption[] = []
  for (const opt of options) {
    if (!words.every((w) => opt.key.includes(w))) continue
    ;(opt.key.startsWith(first) ? starts : rest).push(opt)
    if (starts.length >= MAX_RESULTS) break // can't get better than this
  }
  return [...starts, ...rest].slice(0, MAX_RESULTS)
}
