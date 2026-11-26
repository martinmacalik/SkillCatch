import { useCallback, useRef, useState } from 'react'

// A dropdown that opens below its parent, or ABOVE it when there isn't room below.
// Decided once when it mounts (a ref callback runs before paint), from the room
// below the parent vs. the dropdown's max height — so it never jumps around later.
//
//   const [up, attach] = useDropUp(360)
//   <div ref={attach} className={up ? 'bottom-full mb-1' : 'top-full mt-1'}>
export function useDropUp(maxHeight: number, disabled = false) {
  const [up, setUp] = useState(false)
  const placed = useRef(false)
  const node = useRef<HTMLElement | null>(null)

  const attach = useCallback((el: HTMLElement | null) => {
    node.current = el
    const anchor = el?.parentElement
    if (disabled || !anchor || placed.current) return
    placed.current = true
    const { top, bottom } = anchor.getBoundingClientRect()
    const roomBelow = window.innerHeight - bottom
    if (roomBelow < maxHeight && top > roomBelow) setUp(true)
  }, [maxHeight, disabled])

  return [up, attach, node] as const
}
