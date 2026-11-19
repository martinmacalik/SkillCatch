import { useEffect, useId, useState, type KeyboardEvent } from 'react'

/**
 * Keyboard + ARIA logic shared by every combobox (country, institution, titles).
 * The caller owns the input value and the option list; this hook owns
 * "is the list open" and "which option is highlighted".
 */
export function useCombobox(optionCount: number, onPick: (index: number) => void) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [rawActive, setActive] = useState(0)

  // clamp during render, so a shorter result list never points past its end
  const active = optionCount === 0 ? -1 : Math.min(rawActive, optionCount - 1)
  const optionId = (index: number) => `${listId}-opt-${index}`

  // keep the highlighted option visible while arrowing through a long list
  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${listId}-opt-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, listId])

  const pick = (index: number) => {
    onPick(index)
    setOpen(false)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!open) setOpen(true)
        else setActive(optionCount === 0 ? 0 : (active + 1) % optionCount)
        break
      case 'ArrowUp':
        e.preventDefault()
        if (!open) setOpen(true)
        else setActive(optionCount === 0 ? 0 : (active - 1 + optionCount) % optionCount)
        break
      case 'Enter':
        if (open && active >= 0) {
          e.preventDefault()
          pick(active)
        }
        break
      case 'Escape':
        if (open) {
          e.preventDefault()
          setOpen(false)
        }
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  /** Props for the <input> (or the <button> of a select). */
  const inputProps = {
    role: 'combobox' as const,
    'aria-expanded': open,
    'aria-controls': listId,
    'aria-autocomplete': 'list' as const,
    'aria-activedescendant': open && active >= 0 ? optionId(active) : undefined,
    autoComplete: 'off',
    onKeyDown,
  }

  return {
    open,
    /** Opens the list and highlights the first option (call on typing). */
    openFresh: () => {
      setOpen(true)
      setActive(0)
    },
    setOpen,
    active,
    setActive,
    pick,
    listId,
    optionId,
    inputProps,
  }
}
