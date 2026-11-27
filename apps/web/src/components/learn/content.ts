// Block content is free-form JSON from the database: old rows may hold a number
// where a string is expected, or an object where a list is. Read it through these
// so a renderer never crashes and an editor never wipes a value it doesn't understand.

/** strings as-is, numbers as text, anything else → '' */
export const asText = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')

/** arrays as-is, anything else → [] (items may still be null → read fields with asText) */
export const asList = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.map(x => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {})) : []
