import { ChevronDown, Check } from 'lucide-react'

import { cn } from '@/lib/cn'
import { useCombobox } from '@/hooks/useCombobox'
import { ComboboxList } from './ComboboxList'

export interface SelectMenuOption<T extends string> {
  value: T
  label: string
}

interface SelectMenuProps<T extends string> {
  id?: string
  value: T | null
  onChange: (value: T | null) => void
  options: SelectMenuOption<T>[]
  /** Label of the "nothing selected" row (and of the button when empty). */
  emptyLabel: string
}

/**
 * Styled replacement for <select>: same dropdown as the comboboxes, without
 * typing. Arrows / Enter / Space / Escape work like a native select.
 */
export function SelectMenu<T extends string>({ id, value, onChange, options, emptyLabel }: SelectMenuProps<T>) {
  // row 0 = "nothing selected", then the real options
  const rows: (SelectMenuOption<T> | null)[] = [null, ...options]
  const selectedIndex = Math.max(0, rows.findIndex((r) => (r?.value ?? null) === value))
  const selected = rows[selectedIndex]

  const box = useCombobox(rows.length, (i) => onChange(rows[i]?.value ?? null))

  const openAtSelected = () => {
    box.setActive(selectedIndex)
    box.setOpen(true)
  }

  return (
    <div className="relative">
      <button
        id={id}
        type="button"
        className={cn('input flex cursor-pointer items-center pr-9 text-left', !selected && 'text-gray-400')}
        aria-haspopup="listbox"
        onClick={() => (box.open ? box.setOpen(false) : openAtSelected())}
        onBlur={() => box.setOpen(false)}
        {...box.inputProps}
        onKeyDown={(e) => {
          // Space picks while open (on a closed button it "clicks" and opens)
          if (e.key === ' ' && box.open) {
            e.preventDefault()
            box.pick(box.active)
            return
          }
          if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !box.open) {
            e.preventDefault()
            openAtSelected()
            return
          }
          box.inputProps.onKeyDown(e)
        }}
      >
        <span className="truncate">{selected?.label ?? emptyLabel}</span>
      </button>
      <ChevronDown
        className={cn(
          'pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-gray-400 transition-transform',
          box.open && 'rotate-180',
        )}
      />
      {box.open && (
        <ComboboxList
          listId={box.listId}
          optionId={box.optionId}
          active={box.active}
          onHover={box.setActive}
          onPick={box.pick}
          options={rows.map((r, i) => ({
            key: r?.value ?? '__empty',
            content: (
              <span className={cn('flex items-center justify-between gap-2', !r && 'text-gray-400')}>
                {r?.label ?? emptyLabel}
                {i === selectedIndex && <Check className="h-4 w-4 shrink-0 text-purple-700" />}
              </span>
            ),
          }))}
        />
      )}
    </div>
  )
}
