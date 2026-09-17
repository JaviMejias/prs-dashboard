import { useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { localDate, rangeFor, type DateRange } from '../lib/dateRange'
const parseDate = (value: string) => { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day) }
const monthLabel = (date: Date) => date.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })

export default function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (range: DateRange) => void }) {
  const [open, setOpen] = useState(false)
  const [field, setField] = useState<'from' | 'to'>('from')
  const [cursor, setCursor] = useState(() => parseDate(value.from))
  const days = useMemo(() => { const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1); const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7)); return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day }) }, [cursor])
  const selectDay = (day: Date) => { const selected = localDate(day); if (field === 'from') { onChange({ from: selected, to: selected > value.to ? selected : value.to }); setField('to') } else { onChange(selected < value.from ? { from: selected, to: value.to } : { ...value, to: selected }); setOpen(false) } }
  const display = (value: string) => parseDate(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
  return <div className="date-range-picker" aria-label="Rango del resumen">
    <div className="date-range-presets">{([['month', 'Este mes'], ['previous-month', 'Mes anterior'], ['year', 'Este año'], ['previous-year', 'Año anterior']] as const).map(([preset, label]) => <button type="button" key={preset} onClick={() => { onChange(rangeFor(preset)); setOpen(false) }}>{label}</button>)}</div>
    <div className="date-range-fields">
      {(['from', 'to'] as const).map((key) => <button type="button" className={`date-field-button${field === key && open ? ' is-active' : ''}`} key={key} onClick={() => { setField(key); setCursor(parseDate(value[key])); setOpen(true) }}><span>{key === 'from' ? 'Desde' : 'Hasta'}</span><strong><CalendarDays size={15} />{display(value[key])}</strong></button>)}
      <ChevronDown className="date-range-arrow" size={16} />
      {open && <div className="date-calendar-popover"><header><button type="button" className="icon-button" aria-label="Mes anterior" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft size={16} /></button><strong>{monthLabel(cursor)}</strong><button type="button" className="icon-button" aria-label="Mes siguiente" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight size={16} /></button></header><div className="calendar-weekdays">{['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-days">{days.map((day) => { const iso = localDate(day); const selected = iso === value.from || iso === value.to; const between = iso > value.from && iso < value.to; return <button type="button" key={iso} className={`${day.getMonth() !== cursor.getMonth() ? 'is-outside ' : ''}${selected ? 'is-selected ' : ''}${between ? 'is-between' : ''}`} onClick={() => selectDay(day)}>{day.getDate()}</button> })}</div><small>Seleccionando: {field === 'from' ? 'inicio' : 'fin'} del período</small></div>}
    </div>
  </div>
}
