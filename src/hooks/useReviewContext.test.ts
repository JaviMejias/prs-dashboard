import { onlineManager, QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reviewContextQuery } from './useReviewContext'
import type { PullRequest, Session } from '../types'

const session: Session = { email: 'qa@example.com', uuid: '{qa}', token: 'test-token', expiresAt: 0 }
const pr: PullRequest = { id: 12, title: 'Context', state: 'OPEN', created_on: '2026-10-01T00:00:00Z', updated_on: '2026-10-02T00:00:00Z', repo: { workspace: 'team', repo: 'app' } }
const clients: QueryClient[] = []
const subscriptions: Array<() => void> = []
const client = () => { const cache = new QueryClient(); clients.push(cache); return cache }
const response = () => ({ ok: true, json: async () => ({ values: [] }) })
afterEach(() => {
  subscriptions.splice(0).forEach((unsubscribe) => unsubscribe())
  clients.splice(0).forEach((cache) => cache.clear())
  onlineManager.setOnline(true)
  vi.unstubAllGlobals()
})

describe('on-demand review context', () => {
  it('does not load context for cards until requested and reuses it in the dialog', async () => {
    const fetchMock = vi.fn(async () => response())
    vi.stubGlobal('fetch', fetchMock)
    const cache = client()
    const observer = new QueryObserver(cache, reviewContextQuery(pr, session, false))
    subscriptions.push(observer.subscribe(() => {}))
    await Promise.resolve()
    expect(fetchMock).not.toHaveBeenCalled()
    await observer.refetch()
    expect(fetchMock).toHaveBeenCalledTimes(4)
    await cache.fetchQuery(reviewContextQuery(pr, session))
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('returns an explicit unavailable result offline instead of pausing forever', async () => {
    onlineManager.setOnline(false)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    const result = await client().fetchQuery(reviewContextQuery(pr, session))
    expect(result.unavailable).toContain('comments')
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('separates account, repository, PR and version cache identities', () => {
    const key = reviewContextQuery(pr, session).queryKey
    expect(reviewContextQuery(pr, { ...session, uuid: '{other}' }).queryKey).not.toEqual(key)
    expect(reviewContextQuery({ ...pr, id: 13 }, session).queryKey).not.toEqual(key)
    expect(reviewContextQuery({ ...pr, repo: { workspace: 'team', repo: 'other' } }, session).queryKey).not.toEqual(key)
    expect(reviewContextQuery({ ...pr, updated_on: '2026-10-03T00:00:00Z' }, session).queryKey).not.toEqual(key)
  })

  it('refetches comments on explicit retry even if the PR timestamp did not change', async () => {
    let failed = true
    const fetchMock = vi.fn(async (input: string) => new URL(input).pathname.endsWith('/comments') && failed ? { ok: false, status: 429 } : response())
    vi.stubGlobal('fetch', fetchMock)
    const observer = new QueryObserver(client(), reviewContextQuery(pr, session, false))
    subscriptions.push(observer.subscribe(() => {}))
    expect((await observer.refetch()).data?.unavailable).toContain('comments')
    failed = false
    expect((await observer.refetch()).data?.unavailable).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(8)
  })
})
