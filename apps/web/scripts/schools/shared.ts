import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** apps/web */
export const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Downloads a JSON(-LD) file, failing loudly on HTTP errors. */
export async function fetchJson(url: string): Promise<unknown> {
  process.stdout.write(`↓ ${url}\n`)
  const res = await fetch(url, { headers: { 'User-Agent': 'skillcatch-data-build' } })
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} ${res.statusText} (${url})`)
  // some government files start with a UTF-8 BOM, JSON.parse would choke on it
  const raw = await res.text()
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
  return JSON.parse(text)
}

/** Writes compact JSON (one record per line keeps git diffs readable). */
export async function writeRecords(relPath: string, records: readonly object[]): Promise<void> {
  const target = resolve(WEB_ROOT, relPath)
  await mkdir(dirname(target), { recursive: true })
  const body = `[\n${records.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`
  await writeFile(target, body, 'utf8')
  const kb = (Buffer.byteLength(body) / 1024).toFixed(0)
  process.stdout.write(`✓ ${relPath}: ${records.length} records, ${kb} kB\n`)
}

/** "Univerzita Karlova" → "univerzita-karlova" (diacritics stripped). */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function str(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

/** Runs main() and exits non-zero on failure, so CI / npm notice. */
export function run(main: () => Promise<void>): void {
  main().catch((err: unknown) => {
    process.stderr.write(`✗ ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  })
}
