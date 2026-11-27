/** Every inline editor gets the block's content and reports a whole new content object. */
export interface EditorProps {
  content: Record<string, unknown>
  onChange: (content: Record<string, unknown>) => void
  /** a block that was just added: put the cursor in it */
  autoFocus?: boolean
}

/** numbers keep their value as text, so a focus + blur never wipes old data */
export { asText as str } from '../content'

/** the "+ Add …" button under a list editor */
export const addRowClass =
  'mt-1 flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-gray-400 transition hover:bg-gray-100 hover:text-gray-700'

/** the small × at the end of a row (visible when the row is hovered) */
export const removeRowClass =
  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-300 opacity-0 transition hover:bg-gray-100 hover:text-pink-600 group-hover/item:opacity-100 focus:opacity-100'

/** list editors save on every blur; skip the write when nothing actually changed */
export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
