import { useEffect, useRef, useState } from 'react'

const numberFormatter = new Intl.NumberFormat('es-CL')

export default function AnimatedNumber({ value }: { value: number }) {
  const previousValue = useRef(0)
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    const start = previousValue.current
    const difference = value - start
    previousValue.current = value
    if (!difference) {
      setDisplayValue(value)
      return
    }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      setDisplayValue(value)
      return
    }
    const startedAt = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 480)
      const eased = 1 - ((1 - progress) ** 3)
      setDisplayValue(Math.round(start + difference * eased))
      if (progress < 1) frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [value])

  return <>{numberFormatter.format(displayValue)}</>
}
