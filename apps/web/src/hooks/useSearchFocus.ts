import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Arriving from the global search with state { focus: '<element id>' }:
 * scroll that element into view and flash it, so it's clear what was found.
 */
export function useSearchFocus(ready = true) {
  const location = useLocation()
  const focus = (location.state as { focus?: string } | null)?.focus

  useEffect(() => {
    if (!focus || !ready) return
    // after the page has rendered its sections
    const t = setTimeout(() => {
      const el = document.getElementById(focus)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      el.classList.remove('search-flash')
      void el.offsetWidth // restart the animation when the same target is picked again
      el.classList.add('search-flash')
    }, 60)
    return () => clearTimeout(t)
  }, [focus, ready, location.key])
}
