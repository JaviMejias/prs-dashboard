import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPullRequests, getReviewHistoryForRange, getReviewHistorySnapshot } from './bitbucket'
import type { RepoConfig, Session } from '../types'

const repo: RepoConfig = { workspace: 'kontroller_test', repo: 'kontroller_test' }
const session: Session = { email: 'javier@example.com', token: 'test-token', expiresAt: Date.now() + 60_000, uuid: '{javier}', displayName: 'Javier Mejías' }

const response = (body: unknown) => ({ ok: true, json: async () => body })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
const pullRequest = (id: number, updatedOn: string) => ({
  id,
  title: `PR ${id}`,
  state: 'OPEN',
  created_on: '2026-09-01T10:00:00Z',
  updated_on: updatedOn,
  participants: [],
})

describe('getReviewHistorySnapshot', () => {
  it('loads only changed PR activity when a complete history already exists', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('state=OPEN')) return response({ values: [pullRequest(1, '2026-09-15T17:00:00Z'), pullRequest(2, '2026-09-01T10:00:00Z')] })
      if (url.includes('state=MERGED') || url.includes('state=DECLINED')) return response({ values: [] })
      if (url.includes('/pullrequests/1/activity')) return response({ values: [{ pull_request: { id: 1 }, comment: { created_on: '2026-09-15T17:00:00Z', user: { uuid: '{javier}' } } }] })
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await getReviewHistorySnapshot(repo, session, {
      '1': { updatedOn: '2026-09-01T10:00:00Z' },
      '2': { updatedOn: '2026-09-01T10:00:00Z' },
    })

    expect(result.complete).toBe(true)
    expect(result.prs[0].activity).toHaveLength(1)
    expect(result.prs[1].activity).toHaveLength(0)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    vi.unstubAllGlobals()
  })
})

describe('getReviewHistoryForRange', () => {
  it('filters PR candidates without excluding historical reviews updated in a later month', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = new URL(input)
      if (url.searchParams.get('state') === 'OPEN') return response({ values: [{ ...pullRequest(1, '2026-10-05T12:00:00Z'), created_on: '2026-06-01T12:00:00Z' }] })
      if (url.pathname.endsWith('/1/activity')) return response({ values: [{ comment: { created_on: '2026-09-15T12:00:00Z', user: { uuid: '{javier}' } } }] })
      return response({ values: [] })
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await getReviewHistoryForRange(repo, session, { from: '2026-09-01', to: '2026-09-30' })
    const listCalls = fetchMock.mock.calls.map(([input]) => new URL(input)).filter((url) => url.searchParams.has('state'))
    expect(listCalls).toHaveLength(3)
    listCalls.forEach((url) => {
      const q = url.searchParams.get('q')!
      expect(q).toBe(`updated_on >= ${new Date(2026, 8, 1).toISOString()} AND created_on < ${new Date(2026, 9, 1).toISOString()}`)
      expect(q).not.toMatch(/updated_on\s*</)
    })
    expect(result.complete).toBe(true)
    expect(result.prs[0].activity).toHaveLength(1)
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/pullrequests/activity'))).toBe(false)
  })
  it('keeps later PR activity even when an earlier PR reaches the pagination cap', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = new URL(input)
      if (url.searchParams.get('state') === 'OPEN') return response({ values: [pullRequest(1, '2026-10-01T12:00:00Z'), pullRequest(2, '2026-10-01T12:00:00Z')] })
      if (url.pathname.endsWith('/1/activity')) return response({ values: [], next: String(url) })
      if (url.pathname.endsWith('/2/activity')) return response({ values: [{ approval: { date: '2026-09-10T12:00:00Z', user: { uuid: '{javier}' } } }] })
      return response({ values: [] })
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await getReviewHistoryForRange(repo, session, { from: '2026-09-01', to: '2026-09-30' })
    expect(result.complete).toBe(false)
    expect(result.prs[1].activity).toHaveLength(1)
  })
  it('limits concurrent per-PR activity requests to four', async () => {
    let active = 0
    let peak = 0
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = new URL(input)
      if (url.searchParams.get('state') === 'OPEN') return response({ values: Array.from({ length: 9 }, (_, index) => pullRequest(index + 1, '2026-10-01T12:00:00Z')) })
      if (url.pathname.endsWith('/activity')) {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 1))
        active -= 1
      }
      return response({ values: [] })
    }))
    const result = await getReviewHistoryForRange(repo, session, { from: '2026-09-01', to: '2026-09-30' })
    expect(result.prs).toHaveLength(9)
    expect(peak).toBe(4)
  })
  it('aborts hung requests after thirty seconds instead of leaving the view busy indefinitely', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_input: string | URL, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('timed out')))
    })))
    const result = getReviewHistoryForRange(repo, session, { from: '2026-09-01', to: '2026-09-30' })
    const rejected = expect(result).rejects.toThrow('Bitbucket no respondió en 30 segundos')
    await vi.advanceTimersByTimeAsync(30_000)
    await rejected
  })
})

describe('getPullRequests activity loading', () => {
  it('loads activity only for open PRs with a review-history signal', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('state=OPEN')) return response({ values: [{ ...pullRequest(1, '2026-09-17T00:00:00Z'), participants: [{ user: { uuid: '{javier}' }, participated_on: '2026-09-16T12:00:00Z' }] }] })
      if (url.includes('state=MERGED') || url.includes('state=DECLINED')) return response({ values: [] })
      if (url.includes('/pullrequests/activity?')) return response({ values: [{ pull_request: { id: 1 }, comment: { created_on: '2026-09-16T12:00:00Z', user: { uuid: '{javier}' } } }] })
      if (url.includes('/pullrequests/1/activity')) return response({ values: [{ pull_request: { id: 1 }, update: { date: '2026-09-17T00:00:00Z', author: { uuid: '{juan}' }, source: { commit: { hash: 'abcdef123456' } } } }] })
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await getPullRequests(repo, session)

    expect(result[0]?.activity[0]?.update?.source?.commit?.hash).toBe('abcdef123456')
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/pullrequests?')).every(([input]) => new URL(input).searchParams.get('pagelen') === '50')).toBe(true)
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/pullrequests/activity?'))).toBe(false)
    vi.unstubAllGlobals()
  })

  it('limits concurrent per-PR activity requests to four', async () => {
    let active = 0
    let peak = 0
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = new URL(input)
      if (url.searchParams.get('state') === 'OPEN') return response({ values: Array.from({ length: 9 }, (_, index) => ({
        ...pullRequest(index + 1, '2026-09-17T00:00:00Z'),
        participants: [{ user: { uuid: '{javier}' }, participated_on: '2026-09-16T12:00:00Z' }],
      })) })
      if (url.pathname.match(/\/pullrequests\/\d+\/activity$/)) {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 1))
        active -= 1
      }
      return response({ values: [] })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await getPullRequests(repo, session)

    expect(result).toHaveLength(9)
    expect(peak).toBe(4)
    vi.unstubAllGlobals()
  })
})
