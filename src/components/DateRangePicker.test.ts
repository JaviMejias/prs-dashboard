import { describe, expect, it } from 'vitest'
import { rangeFor } from '../lib/dateRange'

describe('rangeFor', () => {
  it('returns a valid current month range', () => {
    const range = rangeFor('month')
    expect(range.from.endsWith('-01')).toBe(true)
    expect(range.from <= range.to).toBe(true)
  })

  it('returns the complete previous year', () => {
    const range = rangeFor('previous-year')
    expect(range.from.endsWith('-01-01')).toBe(true)
    expect(range.to.endsWith('-12-31')).toBe(true)
  })
})
