/**
 * Czech schools → src/data/schools/cz.json
 *
 * Source: Rejstřík škol a školských zařízení (MŠMT), dataset "celá ČR",
 * found via the national open data catalogue (data.gov.cz). The old XML at
 * rejstriky.msmt.cz/opendata/vrejcelk.xml is gone (404); MŠMT now publishes
 * JSON-LD on lkod-ftp.msmt.gov.cz, refreshed daily.
 *   schema: https://lkod.msmt.gov.cz/schemas/rssz-json-schema.jschema
 *
 * Structure (only the fields we read):
 *   { datumVystupu, list: [ {
 *       redIzo, uplnyNazev, adresa: { obec, cisloObvoduPrahy },
 *       skolyAZarizeni: [ { druh: "B00", ... } ]      ← schools/facilities run by the entity
 *   } ] }
 *
 * One output row per legal entity (RED_IZO = "ředitelství"), because that is
 * what a teacher names as their school. Entities running only canteens,
 * dormitories, counselling centres etc. are skipped.
 *
 * Run: pnpm --filter web build:schools:cz
 */
import type { SchoolRecord } from '../../src/types/institutions.ts'
import { fetchJson, isRecord, run, str, writeRecords } from './shared.ts'

const SOURCE_URL =
  'https://lkod-ftp.msmt.gov.cz/00022985/88a7c12b-6084-4e47-8b50-46097c6e683f/RSSZ-cela-CR.jsonld'

/**
 * "druh" codes (MŠMT classification) worth listing, with the label shown in the app.
 * Order = order in the joined label ("SŠ, ZŠ" never "ZŠ, SŠ").
 */
const SCHOOL_TYPES: [code: string, label: string][] = [
  ['E00', 'VOŠ'], // vyšší odborná škola
  ['D00', 'Konzervatoř'],
  ['C00', 'SŠ'], // střední škola
  ['B00', 'ZŠ'], // základní škola
  ['A00', 'MŠ'], // mateřská škola
  ['F10', 'ZUŠ'], // základní umělecká škola
  ['F20', 'Jazyková škola'],
  ['G11', 'SVČ'], // dům dětí a mládeže / středisko volného času
  ['G12', 'SVČ'], // stanice zájmových činností
  ['G13', 'SVČ'],
]
const LABEL_BY_CODE = new Map(SCHOOL_TYPES)
const LABEL_ORDER = [...new Set(SCHOOL_TYPES.map(([, label]) => label))]

/** Legal-form suffix that only adds noise to a search result. */
const LEGAL_SUFFIX = /[\s,–-]*(příspěvková organizace\.?|p\.\s?o\.)\s*$/i

function cityOf(address: unknown): string {
  if (!isRecord(address)) return ''
  // Prague is one "obec"; the district ("Praha 4") is far more useful
  return str(address.cisloObvoduPrahy) || str(address.obec)
}

function typeOf(facilities: unknown): string {
  if (!Array.isArray(facilities)) return ''
  const labels = new Set<string>()
  for (const f of facilities) {
    const label = isRecord(f) ? LABEL_BY_CODE.get(str(f.druh)) : undefined
    if (label) labels.add(label)
  }
  return LABEL_ORDER.filter((l) => labels.has(l)).join(', ')
}

async function main() {
  const data = await fetchJson(SOURCE_URL)
  if (!isRecord(data) || !Array.isArray(data.list)) {
    throw new Error('Unexpected format: expected { list: [...] }. Check the MŠMT schema.')
  }
  process.stdout.write(`  register date: ${str(data.datumVystupu)}, entities: ${data.list.length}\n`)

  const byId = new Map<string, SchoolRecord>()
  for (const entity of data.list) {
    if (!isRecord(entity)) continue
    const id = str(entity.redIzo)
    const name = str(entity.uplnyNazev).replace(LEGAL_SUFFIX, '')
    const type = typeOf(entity.skolyAZarizeni)
    if (!id || !name || !type) continue // not a school (or broken row)
    byId.set(id, { id, name, city: cityOf(entity.adresa), type, countryCode: 'CZ' })
  }

  const collator = new Intl.Collator('cs')
  const records = [...byId.values()].sort(
    (a, b) => collator.compare(a.name, b.name) || collator.compare(a.city, b.city) || a.id.localeCompare(b.id),
  )
  if (records.length < 1000) throw new Error(`Only ${records.length} schools parsed, the format probably changed.`)

  await writeRecords('src/data/schools/cz.json', records)
}

run(main)
