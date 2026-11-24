import { searchKey } from '@/lib/searchKey'

/**
 * How well a query matches a text, VS Code style (0 = no match):
 *   100 whole text starts with it · 80 a word starts with it · 60 contains it
 *   40 keywords contain it · 20 letters in order ("stg" → "Settings")
 * Accent- and case-insensitive.
 */
export function matchScore(query: string, title: string, keywords = ''): number {
  const q = searchKey(query).trim()
  if (!q) return 0
  const t = searchKey(title)
  if (t.startsWith(q)) return 100
  if (t.split(/[\s\-/·]+/).some((w) => w.startsWith(q))) return 80
  if (t.includes(q)) return 60
  if (keywords && searchKey(keywords).includes(q)) return 40
  if (q.length >= 2 && isSubsequence(q.replace(/\s+/g, ''), t)) return 20
  return 0
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0
  for (const ch of haystack) {
    if (ch === needle[i]) i++
    if (i === needle.length) return true
  }
  return false
}

/**
 * Where the query sits in the text, for highlighting. searchKey keeps one
 * character per character for Latin letters ("Č" → "c"), so indexes line up;
 * when they don't, nothing is highlighted.
 */
export function matchRange(query: string, text: string): [number, number] | null {
  const q = searchKey(query).trim()
  const t = searchKey(text)
  if (!q || t.length !== text.length) return null
  const i = t.indexOf(q)
  return i < 0 ? null : [i, i + q.length]
}
