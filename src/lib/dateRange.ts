export type DateRange = { from: string; to: string }

type Preset = 'month' | 'previous-month' | 'year' | 'previous-year'

export const localDate = (date: Date) => `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`

export const rangeFor = (preset: Preset): DateRange => {
  const now = new Date()
  if (preset === 'month') return { from: localDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: localDate(now) }
  if (preset === 'previous-month') return { from: localDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: localDate(new Date(now.getFullYear(), now.getMonth(), 0)) }
  if (preset === 'year') return { from: localDate(new Date(now.getFullYear(), 0, 1)), to: localDate(now) }
  return { from: localDate(new Date(now.getFullYear() - 1, 0, 1)), to: localDate(new Date(now.getFullYear() - 1, 11, 31)) }
}
