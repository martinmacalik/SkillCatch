import { useCallback, useEffect, useRef, type TextareaHTMLAttributes } from 'react'

/**
 * A textarea that grows with its text (no inner scrollbar): after every change
 * the height is reset and set to scrollHeight, the height the content needs.
 */
export function AutoTextarea({ value, className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  const fit = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto' // shrink first, so deleting lines makes it smaller again
    el.style.height = `${el.scrollHeight}px`
  }, [])

  // value changed (typing, or a new value from outside) → refit; touches the DOM only, no state
  useEffect(fit, [value, fit])

  // width changed (window resize, a grid breakpoint) → lines wrap differently → refit
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let width = el.offsetWidth
    const ro = new ResizeObserver(() => {
      if (el.offsetWidth === width) return // our own height change also triggers it; ignore that
      width = el.offsetWidth
      fit()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit])

  return <textarea ref={ref} value={value} rows={1} className={`resize-none overflow-hidden ${className}`} {...rest} />
}
