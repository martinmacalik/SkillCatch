/**
 * Accent- and case-insensitive search key: "Škola Žďár" → "skola zdar".
 * NFD splits "Š" into "S" + combining caron (U+030C); the regex drops the
 * combining marks (U+0300–U+036F), leaving plain letters.
 */
export function searchKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}
