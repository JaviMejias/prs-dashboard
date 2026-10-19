import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { localDate, rangeFor, type DateRange } from '../lib/dateRange'
const parseDate = (value: string) => { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day) }
const monthLabel = (date: Date) => date.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
const fullDate = (date: Date) => date.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const shiftDate = (date: Date, days: number) => { const next = new Date(date); next.setDate(next.getDate() + days); return next }
const shiftMonth = (date: Date, months: number) => { const target = new Date(date.getFullYear(), date.getMonth() + months, 1); return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate())) }

export default function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (range: DateRange) => void }) {
  const [open, setOpen] = useState(false)
  const [field, setField] = useState<'from' | 'to'>('from')
  const [cursor, setCursor] = useState(() => parseDate(value.from))
  const [focusedDate, setFocusedDate] = useState(value.from)
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' })
  const triggerRefs = useRef<Record<'from' | 'to', HTMLButtonElement | null>>({ from: null, to: null })
  const calendarRef = useRef<HTMLDialogElement>(null)
  const days = useMemo(() => { const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1); const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7)); return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day }) }, [cursor])
  const close = useCallback((restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) requestAnimationFrame(() => triggerRefs.current[field]?.focus())
  }, [field])
  const selectDay = (day: Date) => {
    const selected = localDate(day)
    if (field === 'from') {
      onChange({ from: selected, to: selected > value.to ? selected : value.to })
      setField('to')
      setFocusedDate(selected)
      setCursor(new Date(day.getFullYear(), day.getMonth(), 1))
    } else {
      onChange(selected < value.from ? { from: selected, to: value.to } : { ...value, to: selected })
      close(true)
    }
  }
  const display = (value: string) => parseDate(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const anchor = triggerRefs.current[field]
      const popover = calendarRef.current
      if (!anchor || !popover) return
      const rect = anchor.getBoundingClientRect()
      const margin = 12
      const gap = 8
      const width = Math.min(280, window.innerWidth - margin * 2)
      const height = popover.offsetHeight
      const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin))
      const below = window.innerHeight - rect.bottom - gap - margin
      const above = rect.top - gap - margin
      const top = below >= height || below >= above ? rect.bottom + gap : Math.max(margin, rect.top - gap - Math.min(height, above))
      setPosition({ position: 'fixed', top, left, width, maxHeight: `calc(100dvh - ${margin * 2}px)`, visibility: 'visible' })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    window.visualViewport?.addEventListener('resize', place)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      window.visualViewport?.removeEventListener('resize', place)
    }
  }, [open, field, cursor])
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (calendarRef.current?.contains(target) || triggerRefs.current.from?.contains(target) || triggerRefs.current.to?.contains(target)) return
      close()
    }
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Node
      if (calendarRef.current?.contains(target) || triggerRefs.current.from?.contains(target) || triggerRefs.current.to?.contains(target)) return
      close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [close, open])
  useEffect(() => {
    if (open) calendarRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusedDate}"]`)?.focus()
  }, [open, focusedDate, cursor])
  const handleDayKeyDown = (event: KeyboardEvent<HTMLButtonElement>, day: Date) => {
    let next: Date | undefined
    if (event.key === 'ArrowLeft') next = shiftDate(day, -1)
    else if (event.key === 'ArrowRight') next = shiftDate(day, 1)
    else if (event.key === 'ArrowUp') next = shiftDate(day, -7)
    else if (event.key === 'ArrowDown') next = shiftDate(day, 7)
    else if (event.key === 'Home') next = shiftDate(day, -((day.getDay() + 6) % 7))
    else if (event.key === 'End') next = shiftDate(day, 6 - ((day.getDay() + 6) % 7))
    else if (event.key === 'PageUp' || event.key === 'PageDown') {
      const monthDelta = (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1)
      next = shiftMonth(day, monthDelta)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
      return
    } else return
    event.preventDefault()
    setFocusedDate(localDate(next))
    setCursor(new Date(next.getFullYear(), next.getMonth(), 1))
  }
  return <div className="date-range-picker" aria-label="Rango del resumen">
    <div className="date-range-presets">{([['month', 'Este mes'], ['previous-month', 'Mes anterior'], ['year', 'Este año'], ['previous-year', 'Año anterior']] as const).map(([preset, label]) => <button type="button" key={preset} onClick={() => { onChange(rangeFor(preset)); close() }}>{label}</button>)}</div>
    <div className="date-range-fields">
      {(['from', 'to'] as const).map((key) => <button type="button" ref={(node) => { triggerRefs.current[key] = node }} aria-haspopup="dialog" aria-expanded={open && field === key} aria-controls="summary-date-calendar" className={`date-field-button${field === key && open ? ' is-active' : ''}`} key={key} onClick={() => { setField(key); setCursor(parseDate(value[key])); setFocusedDate(value[key]); setOpen(true) }}><span>{key === 'from' ? 'Desde' : 'Hasta'}</span><strong><CalendarDays size={15} />{display(value[key])}</strong></button>)}
      <ChevronDown className="date-range-arrow" size={16} />
    </div>
    {open && createPortal(<dialog open id="summary-date-calendar" ref={calendarRef} className="date-calendar-popover" aria-label={`Seleccionar ${field === 'from' ? 'fecha de inicio' : 'fecha de fin'}`} style={position} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); close(true) } }}>
      <header><button type="button" className="icon-button" aria-label="Mes anterior" onClick={() => { const next = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1); setCursor(next); setFocusedDate(localDate(next)) }}><ChevronLeft size={16} /></button><strong>{monthLabel(cursor)}</strong><button type="button" className="icon-button" aria-label="Mes siguiente" onClick={() => { const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); setCursor(next); setFocusedDate(localDate(next)) }}><ChevronRight size={16} /></button></header>
      <div className="calendar-weekdays" aria-hidden="true">{['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-days" role="group" aria-label={monthLabel(cursor)}>{days.map((day) => { const iso = localDate(day); const selected = iso === value.from || iso === value.to; const between = iso > value.from && iso < value.to; return <button type="button" aria-label={fullDate(day)} aria-pressed={selected} tabIndex={iso === focusedDate ? 0 : -1} data-date={iso} key={iso} className={`${day.getMonth() !== cursor.getMonth() ? 'is-outside ' : ''}${selected ? 'is-selected ' : ''}${between ? 'is-between' : ''}`} onKeyDown={(event) => handleDayKeyDown(event, day)} onClick={() => selectDay(day)}>{day.getDate()}</button> })}</div>
      <small>Seleccionando: {field === 'from' ? 'inicio' : 'fin'} del período</small>
    </dialog>, document.body)}
  </div>
}
