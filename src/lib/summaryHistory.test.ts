import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localDate } from './dateRange'
import {
  buildSummaryMonth, combineSummaryMonths, readSummaryMonth, runSummaryJob, saveSummaryMonth,
  summaryDateBounds, summaryMonthKey, summaryMonths, summaryScope,
} from './summaryHistory'
import { summaryMetricsForRange } from './summary'
import type { PullRequest, RepoConfig, Session } from '../types'

const repo: RepoConfig = { workspace: 'team', repo: 'app' }
const session: Session = { email: 'qa@example.com', token: 'never-persist-me', expiresAt: 0, uuid: '{qa}', displayName: 'QA' }
const month = { month: '2026-09', from: '2026-09-01', to: '2026-09-30' }
const pr: PullRequest = {
  id: 1, title: 'Existing PR', state: 'OPEN', created_on: '2026-06-01T12:00:00Z', updated_on: '2026-10-05T12:00:00Z', repo,
  activity: [{ comment: { id: 1, created_on: '2026-09-10T12:00:00Z', user: { uuid: '{qa}' } } }],
}
let storage: Map<string, string>
beforeEach(() => {
  storage = new Map()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
})
afterEach(() => vi.unstubAllGlobals())

describe('summary monthly coverage', () => {
  it('loads only the current month and clips its coverage to today', () => {
    expect(summaryMonths({ from: '2026-10-01', to: '2026-10-08' }, new Date(2026, 9, 8))).toEqual([
      { month: '2026-10', from: '2026-10-01', to: '2026-10-08' },
    ])
  })
  it('uses the same monthly units for custom, month and yearly ranges', () => {
    const now = new Date(2026, 9, 8)
    const year = summaryMonths({ from: '2026-01-01', to: '2026-10-08' }, now)
    const custom = summaryMonths({ from: '2026-09-12', to: '2026-10-02' }, now)
    expect(year).toHaveLength(10)
    expect(custom).toEqual(year.slice(-2))
    expect(summaryMonths({ from: '2025-01-01', to: '2025-12-31' }, now)).toHaveLength(12)
  })
  it('does not load future-only or reversed ranges', () => {
    const now = new Date(2026, 9, 8)
    expect(summaryMonths({ from: '2026-11-01', to: '2026-12-31' }, now)).toEqual([])
    expect(summaryMonths({ from: '2026-09-30', to: '2026-09-01' }, now)).toEqual([])
  })
  it('covers leap days and a year boundary', () => {
    expect(summaryMonths({ from: '2024-02-15', to: '2024-02-20' }, new Date(2026, 9, 8))[0].to).toBe('2024-02-29')
    expect(summaryMonths({ from: '2025-12-31', to: '2026-01-01' }, new Date(2026, 9, 8)).map((item) => item.month)).toEqual(['2025-12', '2026-01'])
  })
  it('uses local midnight and an exclusive next-day boundary, including DST', () => {
    const bounds = summaryDateBounds({ from: '2026-09-01', to: '2026-09-30' })
    expect(new Date(bounds.start)).toEqual(new Date(2026, 8, 1))
    expect(new Date(bounds.endExclusive)).toEqual(new Date(2026, 9, 1))
  })
})

describe('summary monthly snapshots', () => {
  it('keeps historical reviews on PRs created earlier and updated later', () => {
    const snapshot = buildSummaryMonth([pr], month, true)
    expect(snapshot.pullRequests['1'].events).toHaveLength(1)
    expect(snapshot.pullRequests['1'].updatedOn).toBe(pr.updated_on)
  })
  it('stores events only inside the local month and ignores invalid dates', () => {
    const before = new Date(2026, 8, 1).getTime() - 1
    const end = new Date(2026, 9, 1).getTime()
    const snapshot = buildSummaryMonth([{ ...pr, activity: [
      ...pr.activity!,
      { approval: { date: new Date(before).toISOString(), user: { uuid: '{qa}' } } },
      { approval: { date: new Date(end).toISOString(), user: { uuid: '{qa}' } } },
      { approval: { date: 'invalid', user: { uuid: '{qa}' } } },
    ] }], month, true)
    expect(snapshot.pullRequests['1'].events).toHaveLength(1)
  })
  it('retains complete empty coverage instead of treating no events as missing data', () => {
    const snapshot = buildSummaryMonth([], month, true)
    expect(combineSummaryMonths([{ repo, snapshot }]).repositories['team/app'].coverage).toBe('complete')
  })
  it('combines months without counting the same PR or event twice', () => {
    const first = buildSummaryMonth([pr], month, true)
    const second = buildSummaryMonth([{ ...pr, activity: [{ approval: { date: '2026-10-03T12:00:00Z', user: { uuid: '{qa}' } } }] }], { month: '2026-10', from: '2026-10-01', to: '2026-10-08' }, true)
    const history = combineSummaryMonths([{ repo, snapshot: first }, { repo, snapshot: second }, { repo, snapshot: first }])
    const metrics = summaryMetricsForRange(history, [repo], session, { from: '2026-01-01', to: '2026-10-08' })
    expect(metrics.reviewed).toBe(1)
    expect(metrics.comments).toBe(1)
    expect(metrics.approved).toBe(1)
  })
  it('marks a repository partial when any required month is missing or capped', () => {
    const snapshot = buildSummaryMonth([pr], month, true)
    expect(combineSummaryMonths([{ repo, snapshot }, { repo }]).repositories['team/app'].coverage).toBe('partial')
    expect(combineSummaryMonths([{ repo, snapshot: { ...snapshot, complete: false } }]).repositories['team/app'].coverage).toBe('partial')
  })
  it('uses the same local calendar for cached events and daily chart totals', () => {
    const date = new Date(2026, 8, 10, 23, 59).toISOString()
    const snapshot = buildSummaryMonth([{ ...pr, activity: [{ comment: { created_on: date, user: { uuid: '{qa}' } } }] }], month, true)
    const range = { from: localDate(new Date(date)), to: localDate(new Date(date)) }
    const metrics = summaryMetricsForRange(combineSummaryMonths([{ repo, snapshot }]), [repo], session, range)
    expect(metrics.comments).toBe(1)
    expect(metrics.activity[0].count).toBe(1)
  })
  it('does not count a different UUID with the same display name', () => {
    const snapshot = buildSummaryMonth([{ ...pr, activity: [{ approval: { date: '2026-09-10T12:00:00Z', user: { uuid: '{other}', display_name: 'QA' } } }] }], month, true)
    expect(summaryMetricsForRange(combineSummaryMonths([{ repo, snapshot }]), [repo], session, month).reviewed).toBe(0)
  })
})

describe('summary storage boundaries', () => {
  it('isolates account, repository and timezone without storing credentials', () => {
    const scope = summaryScope(session)
    const snapshot = buildSummaryMonth([pr], month, true)
    expect(saveSummaryMonth(scope, repo, snapshot)).toBe(true)
    expect(readSummaryMonth(scope, repo, month)).toEqual(snapshot)
    expect(readSummaryMonth(summaryScope({ ...session, uuid: '{other}' }), repo, month)).toBeUndefined()
    expect(readSummaryMonth(scope, { ...repo, repo: 'other' }, month)).toBeUndefined()
    expect(readSummaryMonth([scope[0], 'Other/Timezone'], repo, month)).toBeUndefined()
    expect(JSON.stringify([...storage])).not.toContain(session.token)
    expect(summaryMonthKey(scope, repo, month)).not.toContain(session.token)
  })
  it('replaces its month rather than accumulating removed events', () => {
    const scope = summaryScope(session)
    saveSummaryMonth(scope, repo, buildSummaryMonth([pr], month, true))
    saveSummaryMonth(scope, repo, buildSummaryMonth([], month, true))
    expect(readSummaryMonth(scope, repo, month)?.pullRequests).toEqual({})
    expect(storage.size).toBe(1)
  })
  it('ignores malformed or incompatible cached snapshots', () => {
    const scope = summaryScope(session)
    saveSummaryMonth(scope, repo, buildSummaryMonth([pr], month, true))
    const key = [...storage.keys()][0]
    for (const value of ['{broken', 'null', JSON.stringify({ schemaVersion: 1 }), JSON.stringify({ ...buildSummaryMonth([pr], month, true), pullRequests: { bad: { id: 2, events: null } } })]) {
      storage.set(key, value)
      expect(readSummaryMonth(scope, repo, month)).toBeUndefined()
    }
  })
  it('reports storage failure without throwing away in-memory data', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('quota') } })
    expect(readSummaryMonth(summaryScope(session), repo, month)).toBeUndefined()
    expect(saveSummaryMonth(summaryScope(session), repo, buildSummaryMonth([pr], month, true))).toBe(false)
  })
  it('does not let an older in-flight day overwrite newer coverage', () => {
    const scope = summaryScope(session)
    const newer = { month: '2026-10', from: '2026-10-01', to: '2026-10-09' }
    saveSummaryMonth(scope, repo, buildSummaryMonth([], newer, true))
    saveSummaryMonth(scope, repo, buildSummaryMonth([], { ...newer, to: '2026-10-08' }, true))
    expect(readSummaryMonth(scope, repo, newer)?.range.to).toBe('2026-10-09')
  })
  it('does not let an older in-flight read replace a fresher snapshot for the same day', () => {
    const scope = summaryScope(session)
    const fresh = buildSummaryMonth([], month, true, 2_000)
    const stale = buildSummaryMonth([pr], month, false, 1_000)
    saveSummaryMonth(scope, repo, fresh)
    expect(saveSummaryMonth(scope, repo, stale)).toBe(true)
    expect(readSummaryMonth(scope, repo, month)).toEqual(fresh)
  })
  it('limits concurrent period jobs to two and releases failed jobs', async () => {
    let active = 0
    let peak = 0
    const results = await Promise.allSettled(Array.from({ length: 6 }, (_, index) => runSummaryJob(async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active -= 1
      if (index === 2) throw new Error('failed')
      return index
    })))
    expect(peak).toBe(2)
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(5)
    expect(await runSummaryJob(async () => 'released')).toBe('released')
  })
})
