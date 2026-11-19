import { useState } from 'react'

import { useCombobox } from '@/hooks/useCombobox'
import { ACADEMIC_TITLE_MAX_LENGTH } from '@/types/teaching'
import { ComboboxList } from './ComboboxList'
import { searchKey } from '@/lib/searchKey'

interface TitleInputProps {
  id?: string
  value: string
  onChange: (value: string) => void
  suggestions: readonly string[]
  placeholder?: string
}

/**
 * Free-text academic title with a styled suggestion list (not <datalist>,
 * which can't be styled). Anything may be typed, nothing is validated.
 */
export function TitleInput({ id, value, onChange, suggestions, placeholder }: TitleInputProps) {
  const [typing, setTyping] = useState(false)

  // while typing, filter; right after focus show every common title
  const q = typing ? searchKey(value).trim() : ''
  const matches = suggestions.filter((s) => !q || (searchKey(s).startsWith(q) && searchKey(s) !== q))

  const box = useCombobox(matches.length, (i) => {
    onChange(matches[i])
    setTyping(false)
  })

  return (
    <div className="relative">
      <input
        id={id}
        className="input"
        placeholder={placeholder}
        maxLength={ACADEMIC_TITLE_MAX_LENGTH}
        value={value}
        onFocus={() => box.setOpen(true)}
        onBlur={() => {
          box.setOpen(false)
          setTyping(false)
        }}
        onChange={(e) => {
          onChange(e.target.value)
          setTyping(true)
          box.openFresh()
        }}
        {...box.inputProps}
      />
      {box.open && matches.length > 0 && (
        <ComboboxList
          listId={box.listId}
          optionId={box.optionId}
          active={box.active}
          onHover={box.setActive}
          onPick={box.pick}
          options={matches.map((s) => ({ key: s, content: s }))}
        />
      )}
    </div>
  )
}
