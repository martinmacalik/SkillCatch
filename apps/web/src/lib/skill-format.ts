// value_json from the add-skill form: text, number, yes/no or a list
// (shared by the chat skill card and the profile skill blocks)
export function formatAttrValue(value: unknown, unit: string | null): string {
  const text =
    Array.isArray(value) ? value.join(', ')
    : typeof value === 'boolean' ? (value ? 'Yes' : 'No')
    : String(value ?? '')
  return unit ? `${text} ${unit}` : text
}
