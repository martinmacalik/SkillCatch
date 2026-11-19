/**
 * World universities → src/data/universities.json
 *
 * Source: github.com/Hipo/university-domains-list (MIT), file
 * world_universities_and_domains.json. Structure of one entry:
 *   { name, alpha_two_code: "CZ", country, "state-province", domains: [..], web_pages: [..] }
 *
 * The list has no ids, so we build a stable slug "<cc>-<name>". Entries with
 * the same country + name (the source has a few duplicates) are merged and
 * their domains combined.
 *
 * Run: pnpm --filter web build:universities
 */
import type { UniversityRecord } from '../../src/types/institutions.ts'
import { fetchJson, isRecord, run, slugify, str, writeRecords } from './shared.ts'

const SOURCE_URL =
  'https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json'

function domainsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((d) => str(d).toLowerCase().replace(/^www\./, '')).filter((d) => d.includes('.'))
}

async function main() {
  const data = await fetchJson(SOURCE_URL)
  if (!Array.isArray(data)) throw new Error('Unexpected format: expected a JSON array.')

  const byId = new Map<string, UniversityRecord>()
  for (const row of data) {
    if (!isRecord(row)) continue
    const name = str(row.name)
    const countryCode = str(row.alpha_two_code).toUpperCase()
    if (!name || !/^[A-Z]{2}$/.test(countryCode)) continue

    const domains = domainsOf(row.domains)
    // a name in a non-Latin script slugifies to "", fall back to the domain
    const slug = slugify(name) || slugify(domains[0] ?? '')
    if (!slug) continue
    const id = `${countryCode.toLowerCase()}-${slug}`
    const existing = byId.get(id)
    if (existing) {
      existing.domains = [...new Set([...existing.domains, ...domains])]
    } else {
      byId.set(id, { id, name, countryCode, domains: [...new Set(domains)] })
    }
  }

  const records = [...byId.values()].sort(
    (a, b) => a.countryCode.localeCompare(b.countryCode) || a.name.localeCompare(b.name, 'en'),
  )
  if (records.length < 5000) throw new Error(`Only ${records.length} universities parsed, the format probably changed.`)

  await writeRecords('src/data/universities.json', records)
}

run(main)
