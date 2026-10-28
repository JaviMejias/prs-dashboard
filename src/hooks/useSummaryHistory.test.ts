import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { historicalImportQuery, summaryMonthQuery } from './useSummaryHistory'
import { historyYears } from '../lib/historyImport'
import { readSummaryMonth, summaryMonths, summaryScope } from '../lib/summaryHistory'
import type { RepoConfig, Session } from '../types'

const repo: RepoConfig = { workspace: 'team', repo: 'app' }
const session: Session = { email: 'qa@example.com', token: 'test', expiresAt: 0, uuid: '{qa}' }
const september = { month: '2026-09', from: '2026-09-01', to: '2026-09-30' }
const october = { month: '2026-10', from: '2026-10-01', to: '2026-10-08' }
const clients: QueryClient[] = []
const client = () => { const value = new QueryClient(); clients.push(value); return value }
const response = (body: unknown) => ({ ok: true, json: async () => body })
const serve = (input: string | URL) => {
  const url = new URL(input)
  if (url.searchParams.get('state') === 'OPEN') return response({ values: [{
    id: 1, title: 'Old PR updated later', state: 'OPEN', created_on: '2026-06-01T12:00:00Z', updated_on: '2026-10-05T12:00:00Z', participants: [],
  }] })
  if (url.pathname.endsWith('/1/activity')) return response({ values: [
    { comment: { id: 1, created_on: '2026-09-10T12:00:00Z', user: { uuid: '{qa}' } } },
    { approval: { date: '2026-10-03T12:00:00Z', user: { uuid: '{qa}' } } },
  ] })
  return response({ values: [] })
}
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
  fetchMock = vi.fn(async (input: string | URL) => serve(input))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { clients.splice(0).forEach((value) => value.clear()); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('yearly import query integration', () => {
  it('uses one query for all months and the annual view, without duplicate downloads', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 28, 12))
    const cache = client()
    const identity = { ...session, uuid: '{year-query}' }
    const month = historicalImportQuery(cache, repo, identity, historyYears(september)[0])
    const year = historicalImportQuery(cache, repo, identity, historyYears({ from: '2026-01-01', to: '2026-10-28' })[0])
    expect(month.queryKey).toEqual(year.queryKey)
    const first = cache.fetchQuery(month)
    const second = cache.fetchQuery(year)
    let settled = false
    void first.then(() => { settled = true })
    for (let index = 0; !settled && index < 25; index += 1) await vi.advanceTimersByTimeAsync(5_000)
    expect(settled).toBe(true)
    expect(await first).toMatchObject({ status: 'complete', through: '2026-10-28' })
    expect(await second).toMatchObject({ status: 'complete' })
    expect(fetchMock).toHaveBeenCalledTimes(4)
    await cache.fetchQuery(year)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('does not fetch a disabled historical comparison and isolates cache identities', async () => {
    const cache = client()
    const year = { year: 2026, from: '2026-01-01', to: '2026-10-28' }
    const options = historicalImportQuery(cache, repo, session, year, false)
    const observer = new QueryObserver(cache, options)
    const unsubscribe = observer.subscribe(() => {})
    await Promise.resolve()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(historicalImportQuery(cache, repo, { ...session, uuid: '{other}' }, year).queryKey).not.toEqual(options.queryKey)
    expect(historicalImportQuery(cache, { ...repo, repo: 'other' }, session, year).queryKey).not.toEqual(options.queryKey)
    expect(historicalImportQuery(cache, repo, session, { ...year, year: 2025 }).queryKey).not.toEqual(options.queryKey)
    unsubscribe()
  })
})

describe('summary query lifecycle', () => {
  it('reuses cached months without API calls on remount or a browser reload', async () => {
    const first = client()
    await first.fetchQuery(summaryMonthQuery(first, repo, session, september))
    expect(fetchMock).toHaveBeenCalledTimes(4)
    await first.fetchQuery(summaryMonthQuery(first, repo, session, september))
    const reload = client()
    await reload.fetchQuery(summaryMonthQuery(reload, repo, session, september))
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
  it('fetches only missing months and reuses unchanged PR activity across months', async () => {
    const cache = client()
    await cache.fetchQuery(summaryMonthQuery(cache, repo, session, september))
    const result = await cache.fetchQuery(summaryMonthQuery(cache, repo, session, october))
    expect(fetchMock).toHaveBeenCalledTimes(7)
    expect(result.pullRequests['1'].events).toHaveLength(1)
    expect(result.pullRequests['1'].events[0].type).toBe('approval')
  })
  it('yearly views reuse already queried months', async () => {
    const cache = client()
    await cache.fetchQuery(summaryMonthQuery(cache, repo, session, september))
    await cache.fetchQuery(summaryMonthQuery(cache, repo, session, october))
    const before = fetchMock.mock.calls.length
    const months = summaryMonths({ from: '2026-01-01', to: '2026-10-08' }, new Date(2026, 9, 8))
    await Promise.all(months.map((month) => cache.fetchQuery(summaryMonthQuery(cache, repo, session, month))))
    expect(fetchMock.mock.calls.length - before).toBe(8 * 3)
  })
  it('does not prefetch an unrequested comparison', async () => {
    const cache = client()
    const observer = new QueryObserver(cache, summaryMonthQuery(cache, repo, session, september, false))
    const unsubscribe = observer.subscribe(() => {})
    await Promise.resolve()
    expect(fetchMock).not.toHaveBeenCalled()
    unsubscribe()
  })
  it('persists an in-flight result after the view unsubscribes', async () => {
    let finish!: () => void
    const pending = new Promise<void>((resolve) => { finish = resolve })
    fetchMock.mockImplementation(async (input: string | URL) => { await pending; return serve(input) })
    const cache = client()
    const observer = new QueryObserver(cache, summaryMonthQuery(cache, repo, session, september))
    const unsubscribe = observer.subscribe(() => {})
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    unsubscribe()
    finish()
    await vi.waitFor(() => expect(readSummaryMonth(summaryScope(session), repo, september)?.complete).toBe(true))
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
  it('keeps the last snapshot when a manual refresh fails', async () => {
    const cache = client()
    const options = summaryMonthQuery(cache, repo, session, september)
    const saved = await cache.fetchQuery(options)
    fetchMock.mockRejectedValue(new Error('offline'))
    await cache.invalidateQueries({ queryKey: options.queryKey, refetchType: 'none' })
    await expect(cache.fetchQuery(options)).rejects.toThrow('No se pudo recibir una respuesta válida')
    expect(cache.getQueryData(options.queryKey)).toEqual(saved)
    expect(readSummaryMonth(summaryScope(session), repo, september)?.pullRequests).toEqual(saved.pullRequests)
  })
  it('keeps the previous snapshot but marks coverage partial when a list is capped', async () => {
    const cache = client()
    const options = summaryMonthQuery(cache, repo, session, september)
    const saved = await cache.fetchQuery(options)
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = new URL(input)
      if (url.searchParams.get('state') === 'OPEN') return response({ values: [], next: String(url) })
      return response({ values: [] })
    })
    await cache.invalidateQueries({ queryKey: options.queryKey, refetchType: 'none' })
    const result = await cache.fetchQuery(options)
    expect(result.complete).toBe(false)
    expect(result.pullRequests).toEqual(saved.pullRequests)
    expect(readSummaryMonth(summaryScope(session), repo, september)?.complete).toBe(false)
  })
  it('does not share persisted data or activity between accounts', async () => {
    const cache = client()
    await cache.fetchQuery(summaryMonthQuery(cache, repo, session, september))
    await cache.fetchQuery(summaryMonthQuery(cache, repo, { ...session, uuid: '{other}' }, september))
    expect(fetchMock).toHaveBeenCalledTimes(8)
  })
  it('extends current-month coverage after the local day changes', async () => {
    const cache = client()
    await cache.fetchQuery(summaryMonthQuery(cache, repo, session, october))
    const nextDay = { ...october, to: '2026-10-09' }
    await cache.fetchQuery(summaryMonthQuery(cache, repo, session, nextDay))
    expect(fetchMock).toHaveBeenCalledTimes(7)
    expect(readSummaryMonth(summaryScope(session), repo, nextDay)?.range.to).toBe('2026-10-09')
  })
  it('explicit reload invalidates the versioned activity cache', async () => {
    const cache = client()
    const options = summaryMonthQuery(cache, repo, session, september)
    await cache.fetchQuery(options)
    await cache.invalidateQueries({ queryKey: ['summary-activity-v1', ...summaryScope(session)], refetchType: 'none' })
    await cache.invalidateQueries({ queryKey: options.queryKey, refetchType: 'none' })
    await cache.fetchQuery(options)
    expect(fetchMock).toHaveBeenCalledTimes(8)
  })
})
