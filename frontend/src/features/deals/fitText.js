import { useLayoutEffect } from 'react'

const MIN_PX = 12

/** The largest whole-pixel size from min up to max that `fits`; max itself when it already fits, min when nothing does. */
export function largestFit(fits, min, max) {
  if (fits(max)) return max
  let low = Math.ceil(min)
  let high = Math.floor(max)
  let best = min
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (fits(mid)) {
      best = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return best
}

/** Shrinks a one-line element's font until its whole text shows; below MIN_PX it wraps instead of cutting. */
export function useFitText(ref, text) {
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const fit = () => {
      element.style.fontSize = ''
      element.style.whiteSpace = ''
      const max = parseFloat(getComputedStyle(element).fontSize)
      const fits = (size) => {
        element.style.fontSize = `${size}px`
        return element.scrollWidth <= element.clientWidth
      }
      const size = largestFit(fits, MIN_PX, max)
      element.style.fontSize = size === max ? '' : `${size}px`
      if (!fits(size)) element.style.whiteSpace = 'normal'
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(element.parentElement || element)
    return () => observer.disconnect()
  }, [ref, text])
}
