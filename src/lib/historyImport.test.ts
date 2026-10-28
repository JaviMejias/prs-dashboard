import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPullRequests } from './bitbucket'
import { historyImportKey, historyRepositoryScope, historyYears, importHistoryChunk } from './historyImport'
import { memoryHistoryStorage, type HistoryImportStorage } from './historyImportStorage'
import type { PullRequest, Session } from '../types'

const repo = { workspace: 'team', repo: 'app' }
const year = { year: 2026, from: '2026-01-01', to: '2026-10-28' }
const response = (values: unknown[], next?: string) => ({ ok: true, json: async () => ({ values, next }) })
const pr = (id = 1, updated = '2026-10-01T12:00:00Z'): Omit<PullRequest, 'repo'> => ({
  id, title: `PR ${id}`, state: 'OPEN', created_on: '2025-01-01T12:00:00Z', updated_on: updated, participants: [],
})
let session: Session
let sequence = 0
let storage: HistoryImportStorage
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 28, 12))
  session = { email: 'qa@example.com', token: 'fixture-only', uuid: `{case-${++sequence}}`, expiresAt: 0 }
  storage = memoryHistoryStorage(true)
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value) })
  fetchMock = vi.fn(async (input: string | URL) => {
    const url = new URL(input)
    if (url.searchParams.get('state') === 'OPEN') return response([pr()])
    return response([])
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

const chunk = (options: Parameters<typeof importHistoryChunk>[3] = { signal: new AbortController().signal }) =>
  importHistoryChunk(repo, session, year, { ...options, storage })
async function finish<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync()
  return promise
}

describe('resumable yearly history', () => {
  it('shares one yearly range between months and includes PRs created before January', async () => {
    expect(historyYears({ from: '2026-09-01', to: '2026-09-30' })).toEqual([year])
    expect(historyYears({ from: '2026-01-01', to: '2026-10-28' })).toEqual([year])
    const result = await finish(chunk())
    expect(result.status).toBe('complete')
    expect(result.processed).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    fetchMock.mock.calls.slice(0, 3).forEach(([input]) => {
      const query = new URL(input).searchParams.get('q')!
      expect(query).toContain('updated_on >= 2026-01-01')
      expect(query).not.toContain('created_on >=')
      expect(query).not.toMatch(/updated_on\s*</)
    })
    expect(await finish(chunk())).toMatchObject({ status: 'complete' })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('persists a listing cursor and resumes without requesting the first page again', async () => {
    const next = 'https://api.bitbucket.org/2.0/repositories/team/app/pullrequests?state=OPEN&page=2'
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = new URL(input)
      if (url.searchParams.get('page') === '2') return response([pr(2)])
      if (url.searchParams.get('state') === 'OPEN') return response([pr(1)], next)
      return response([])
    })
    const first = await finish(chunk({ signal: new AbortController().signal, maxPages: 1 }))
    expect(first).toMatchObject({ status: 'pending', total: 1 })
    const saved = await storage.read(historyRepositoryScope(repo, session), historyImportKey(repo, session, year.year))
    expect(saved.manifest?.next).toBe(next)
    fetchMock.mockClear()
    const result = await finish(chunk())
    expect(String(fetchMock.mock.calls[0][0])).toBe(next)
    expect(result).toMatchObject({ status: 'complete', processed: 2 })
  })

  it('persists activity pages, pauses on 429 and resumes at the missing page', async () => {
    const next = 'https://api.bitbucket.org/2.0/repositories/team/app/pullrequests/1/activity?page=2'
    let failing = true
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = new URL(input)
      if (url.searchParams.get('state') === 'OPEN') return response([pr()])
      if (url.searchParams.get('page') === '2') return failing ? { ok: false, status: 429, headers: new Headers({ 'Retry-After': '120' }) } : response([{ approval: { date: '2026-08-01T12:00:00Z', user: { uuid: session.uuid } } }])
      if (url.pathname.endsWith('/activity')) return response([{ comment: { id: 7, created_on: '2026-07-01T12:00:00Z', user: { uuid: session.uuid } } }], next)
      return response([])
    })
    const paused = await finish(chunk())
    expect(paused.status).toBe('paused')
    expect(paused.pullRequests['1'].events).toHaveLength(1)
    expect(paused.retryAt).toBeGreaterThan(Date.now())
    const before = fetchMock.mock.calls.length
    await finish(chunk({ signal: new AbortController().signal, mode: 'resume' }))
    expect(fetchMock).toHaveBeenCalledTimes(before)
    await expect(getPullRequests(repo, session, { state: 'OPEN' })).rejects.toThrow('HTTP 429')
    expect(fetchMock).toHaveBeenCalledTimes(before)
    failing = false
    await vi.advanceTimersByTimeAsync(120_000)
    fetchMock.mockClear()
    const complete = await finish(chunk({ signal: new AbortController().signal, mode: 'resume' }))
    expect(complete).toMatchObject({ status: 'complete', processed: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe(next)
    expect(complete.pullRequests['1'].events).toHaveLength(2)
  })

  it('does not send other repository requests after a CORS-like rejection', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const first = await finish(chunk())
    expect(first.status).toBe('paused')
    const second = await finish(importHistoryChunk({ ...repo, repo: 'other' }, session, year, { signal: new AbortController().signal, storage }))
    expect(second.status).toBe('paused')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not truncate a history with more than one hundred pages', async () => {
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = new URL(input)
      if (url.searchParams.get('state') === 'OPEN') return response([pr()])
      if (url.pathname.endsWith('/activity')) {
        const page = Number(url.searchParams.get('page') || 1)
        const next = page < 102 ? `${url.origin}${url.pathname}?page=${page + 1}` : undefined
        return response([{ comment: { id: page, created_on: '2026-07-01T12:00:00Z', user: { uuid: session.uuid } } }], next)
      }
      return response([])
    })
    let result = await finish(chunk())
    for (let index = 0; result.status === 'pending' && index < 12; index += 1) result = await finish(chunk())
    expect(result.status).toBe('complete')
    expect(result.pullRequests['1'].events).toHaveLength(102)
    expect(fetchMock).toHaveBeenCalledTimes(105)
  })

  it('reuses completed PRs on refresh and reloads changed or explicitly invalidated activity', async () => {
    await finish(chunk())
    fetchMock.mockClear()
    await finish(chunk({ signal: new AbortController().signal, mode: 'refresh' }))
    expect(fetchMock).toHaveBeenCalledTimes(3)
    fetchMock.mockClear()
    await finish(chunk({ signal: new AbortController().signal, mode: 'reload' }))
    expect(fetchMock).toHaveBeenCalledTimes(4)
    fetchMock.mockClear()
    fetchMock.mockImplementation(async (input: string | URL) => new URL(input).searchParams.get('state') === 'OPEN' ? response([pr(1, '2026-10-28T13:00:00Z')]) : response([]))
    await finish(chunk({ signal: new AbortController().signal, mode: 'refresh' }))
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('ends a time-bounded chunk without labelling it complete', async () => {
    fetchMock.mockImplementation((input: string | URL, init: RequestInit) => new Promise((resolve, reject) => {
      const url = new URL(input)
      const page = Number(url.searchParams.get('page') || 1)
      const timer = setTimeout(() => resolve(response([pr()], `https://api.bitbucket.org/2.0/repositories/team/app/pullrequests?state=OPEN&page=${page + 1}`)), 20_000)
      init.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(init.signal?.reason) }, { once: true })
    }))
    const result = await finish(chunk())
    expect(result.status).toBe('pending')
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('isolates stored data by account, repository and timezone scope', async () => {
    await finish(chunk())
    const other = { ...session, uuid: '{different-account}' }
    expect((await storage.read(historyRepositoryScope(repo, other), historyImportKey(repo, other, 2026))).records).toEqual([])
    expect(historyImportKey(repo, session, 2026)).not.toContain(session.token)
  })

  it('aborts navigation requests and preserves the last committed listing page', async () => {
    await finish(chunk({ signal: new AbortController().signal, maxPages: 1 }))
    fetchMock.mockImplementation((_input: string | URL, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })))
    const controller = new AbortController()
    const job = chunk({ signal: controller.signal })
    const rejected = expect(job).rejects.toThrow('navigation')
    await vi.advanceTimersByTimeAsync(5_000)
    controller.abort(new Error('navigation'))
    await rejected
    const saved = await storage.read(historyRepositoryScope(repo, session), historyImportKey(repo, session, year.year))
    expect(saved.manifest?.stateIndex).toBe(1)
    expect(saved.records).toHaveLength(1)
  })

  it('rejects pagination outside Bitbucket before sending credentials', async () => {
    fetchMock.mockResolvedValue(response([], 'https://untrusted.example/steal'))
    const result = await finish(chunk())
    expect(result.status).toBe('paused')
    expect(result.error).toContain('no pertenece')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports persistence loss without dropping the in-memory history', async () => {
    storage = memoryHistoryStorage(false)
    const result = await finish(chunk())
    expect(result).toMatchObject({ status: 'complete', persisted: false, processed: 1 })
  })

  it('does not certify a completed year when another import left one of its shared PRs incomplete', async () => {
    await finish(chunk())
    const saved = await storage.read(historyRepositoryScope(repo, session), historyImportKey(repo, session, year.year))
    const record = saved.records[0]
    await storage.write(saved.manifest!, [{ ...record, complete: false }])
    fetchMock.mockClear()
    const result = await finish(chunk())
    expect(result).toMatchObject({ status: 'complete', processed: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/1/activity')
  })

  it('detects multi-page pagination cycles without repeating completed requests', async () => {
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = new URL(input)
      const page = url.searchParams.get('page') || '1'
      return response([pr()], `https://api.bitbucket.org/2.0/repositories/team/app/pullrequests?state=OPEN&page=${page === '1' ? '2' : '1'}`)
    })
    const result = await finish(chunk())
    expect(result.status).toBe('paused')
    expect(result.error).toContain('repitió')
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3)
  })

  it('spaces historical requests while leaving all pages eligible for import', async () => {
    const starts: number[] = []
    fetchMock.mockImplementation(async (input: string | URL) => {
      starts.push(Date.now())
      return response(new URL(input).searchParams.get('state') === 'OPEN' ? [pr()] : [])
    })
    await finish(chunk())
    expect(starts).toHaveLength(4)
    starts.slice(1).forEach((time, index) => expect(time - starts[index]).toBeGreaterThanOrEqual(5_000))
  })
})
