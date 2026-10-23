import { onlineManager, QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pullRequestQueueQuery, refreshPullRequestQueue } from './usePullRequestQueue'
import { sessionCacheKey } from '../lib/queryIdentity'
import type { Session } from '../types'

const repo = { workspace: 'team', repo: 'app' }
const session: Session = { email: 'qa@example.com', token: 'private-test-token', uuid: '{qa}', expiresAt: 0 }
const clients: QueryClient[] = []
const subscriptions: Array<() => void> = []
const client = () => { const value = new QueryClient({ defaultOptions: { queries: { retry: 1 } } }); clients.push(value); return value }
const response = (values: unknown[]) => ({ ok: true, json: async () => ({ values }) })
const pr = { id: 1, title: 'Review me', state: 'OPEN', created_on: '2026-09-01T12:00:00Z', updated_on: '2026-10-01T12:00:00Z', participants: [] }

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => {
  subscriptions.splice(0).forEach((unsubscribe) => unsubscribe())
  clients.splice(0).forEach((value) => value.clear())
  onlineManager.setOnline(true)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('queue query recovery', () => {
  it('does not fetch closed lists until their query is enabled', async () => {
    const fetchMock = vi.fn(async () => response([]))
    vi.stubGlobal('fetch', fetchMock)
    const cache = client()
    const observer = new QueryObserver(cache, pullRequestQueueQuery(cache, session, repo, 'MERGED', false))
    subscriptions.push(observer.subscribe(() => {}))
    await Promise.resolve()
    expect(fetchMock).not.toHaveBeenCalled()
    observer.setOptions(pullRequestQueueQuery(cache, session, repo, 'MERGED'))
    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps an available repository when another fails and does not silently retry it', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => String(input).includes('/broken/') ? { ok: false, status: 429 } : response([pr]))
    vi.stubGlobal('fetch', fetchMock)
    const cache = client()
    const good = pullRequestQueueQuery(cache, session, repo, 'OPEN')
    const broken = pullRequestQueueQuery(cache, session, { ...repo, repo: 'broken' }, 'OPEN')
    const result = await Promise.allSettled([cache.fetchQuery(good), cache.fetchQuery(broken)])
    expect(result.map((item) => item.status)).toEqual(['fulfilled', 'rejected'])
    expect(cache.getQueryData(good.queryKey)).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const diagnostics = JSON.stringify(vi.mocked(console.warn).mock.calls)
    expect(diagnostics).toContain('team/broken')
    expect(diagnostics).toContain('429')
    expect(diagnostics).not.toContain(session.token)
    expect(diagnostics).not.toContain('Authorization')
  })

  it('keeps the previous queue on refresh failure and recovers on manual retry', async () => {
    const fetchMock = vi.fn(async () => response([pr]))
    vi.stubGlobal('fetch', fetchMock)
    const cache = client()
    const options = pullRequestQueueQuery(cache, session, repo, 'OPEN')
    const previous = await cache.fetchQuery(options)
    await cache.invalidateQueries({ queryKey: options.queryKey, refetchType: 'none' })
    fetchMock.mockRejectedValue(new Error('offline'))
    await expect(cache.fetchQuery(options)).rejects.toThrow('No se pudo recibir una respuesta válida')
    expect(cache.getQueryData(options.queryKey)).toEqual(previous)
    fetchMock.mockResolvedValue(response([{ ...pr, title: 'Updated' }]))
    await expect(cache.fetchQuery(options)).resolves.toMatchObject([{ title: 'Updated' }])
  })

  it('resumes an offline initial read when the connection returns', async () => {
    const fetchMock = vi.fn(async () => response([pr]))
    vi.stubGlobal('fetch', fetchMock)
    onlineManager.setOnline(false)
    const cache = client()
    cache.mount()
    const observer = new QueryObserver(cache, pullRequestQueueQuery(cache, session, repo, 'OPEN'))
    subscriptions.push(observer.subscribe(() => {}))
    expect(observer.getCurrentResult().fetchStatus).toBe('paused')
    expect(fetchMock).not.toHaveBeenCalled()
    onlineManager.setOnline(true)
    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    cache.unmount()
  })

  it('reuses completed activity after a later PR fails instead of restarting every history', async () => {
    let failing = true
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = new URL(input)
      if (url.pathname.endsWith('/pullrequests')) return response(Array.from({ length: 5 }, (_, index) => ({
        ...pr, id: index + 1, participants: [{ user: { uuid: session.uuid }, participated_on: pr.created_on }],
      })))
      if (url.pathname.endsWith('/5/activity') && failing) return { ok: false, status: 503 }
      return response([{ approval: { user: { uuid: session.uuid }, date: pr.created_on } }])
    })
    vi.stubGlobal('fetch', fetchMock)
    const cache = client()
    const options = pullRequestQueueQuery(cache, session, repo, 'OPEN')
    await expect(cache.fetchQuery(options)).rejects.toThrow('HTTP 503')
    failing = false
    fetchMock.mockClear()
    await expect(cache.fetchQuery(options)).resolves.toHaveLength(5)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain('/5/activity')
  })

  it('isolates cached activity by account and state', async () => {
    const fetchMock = vi.fn(async () => response([pr]))
    vi.stubGlobal('fetch', fetchMock)
    const cache = client()
    const first = pullRequestQueueQuery(cache, session, repo, 'OPEN')
    const other = pullRequestQueueQuery(cache, { ...session, uuid: '{other}' }, repo, 'OPEN')
    await cache.fetchQuery(first)
    await cache.fetchQuery(other)
    expect(other.queryKey).not.toEqual(first.queryKey)
    expect(pullRequestQueueQuery(cache, session, repo, 'MERGED').queryKey).not.toEqual(first.queryKey)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reloads activity on manual refresh even when the PR timestamp has not changed', async () => {
    let replied = false
    const fetchMock = vi.fn(async (input: string | URL) => {
      if (new URL(input).pathname.endsWith('/pullrequests')) return response([{
        ...pr, participants: [{ user: { uuid: session.uuid }, participated_on: pr.created_on }],
      }])
      return response(replied ? [{ comment: { id: 12, user: { uuid: '{author}' }, created_on: '2026-10-02T12:00:00Z' } }] : [])
    })
    vi.stubGlobal('fetch', fetchMock)
    const cache = client()
    const options = pullRequestQueueQuery(cache, session, repo, 'OPEN')
    const observer = new QueryObserver(cache, options)
    subscriptions.push(observer.subscribe(() => {}))
    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true))
    replied = true
    fetchMock.mockClear()
    await observer.refetch()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(observer.getCurrentResult().data?.[0].activity).toEqual([])
    fetchMock.mockClear()

    await refreshPullRequestQueue(cache, session, [repo])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(observer.getCurrentResult().data?.[0].activity).toMatchObject([{ comment: { id: 12 } }])
    fetchMock.mockClear()
    await observer.refetch()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('invalidates dependent details only for the refreshed account and repositories', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response([pr])))
    const cache = client()
    const account = sessionCacheKey(session)
    const keys = ['queue-activity-v1', 'stats', 'review-context'].map((prefix) => [prefix, account, repo.workspace, repo.repo, pr.id, pr.updated_on])
    const unrelated = [
      ['stats', '{other}', repo.workspace, repo.repo, pr.id, pr.updated_on],
      ['review-context', account, repo.workspace, 'other', pr.id, pr.updated_on],
      ['summary-activity-v1', account, repo.workspace, repo.repo, pr.id, pr.updated_on],
    ]
    for (const key of [...keys, ...unrelated]) cache.setQueryData(key, { retained: true })
    const closed = pullRequestQueueQuery(cache, session, repo, 'MERGED', false)
    cache.setQueryData(closed.queryKey, [])
    const observer = new QueryObserver(cache, pullRequestQueueQuery(cache, session, repo, 'OPEN'))
    subscriptions.push(observer.subscribe(() => {}))
    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true))
    vi.mocked(fetch).mockClear()

    await refreshPullRequestQueue(cache, session, [repo])

    for (const key of keys) {
      expect(cache.getQueryState(key)?.isInvalidated).toBe(true)
      expect(cache.getQueryData(key)).toEqual({ retained: true })
    }
    for (const key of unrelated) expect(cache.getQueryState(key)?.isInvalidated).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('state=OPEN')
  })

  it('preserves the visible queue when a forced refresh fails and recovers on retry', async () => {
    const fetchMock = vi.fn(async () => response([pr]))
    vi.stubGlobal('fetch', fetchMock)
    const cache = client()
    const options = pullRequestQueueQuery(cache, session, repo, 'OPEN')
    const observer = new QueryObserver(cache, options)
    subscriptions.push(observer.subscribe(() => {}))
    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true))
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 } as never)

    await refreshPullRequestQueue(cache, session, [repo])

    expect(observer.getCurrentResult().isError).toBe(true)
    expect(observer.getCurrentResult().data).toMatchObject([{ title: 'Review me' }])
    fetchMock.mockResolvedValue(response([{ ...pr, title: 'Updated remotely' }]))
    await refreshPullRequestQueue(cache, session, [repo])
    expect(observer.getCurrentResult().isSuccess).toBe(true)
    expect(observer.getCurrentResult().data).toMatchObject([{ title: 'Updated remotely' }])
  })

  it('refreshes active details but leaves closed details for their next use', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response([pr])))
    const cache = client()
    const prefix = [sessionCacheKey(session), repo.workspace, repo.repo, pr.id, pr.updated_on]
    const loadStats = vi.fn(async () => ({ commits: 2 }))
    const loadContext = vi.fn(async () => ({ comments: ['Author reply'] }))
    const statsKey = ['stats', ...prefix]
    const contextKey = ['review-context', ...prefix]
    cache.setQueryData(statsKey, { commits: 1 })
    cache.setQueryData(contextKey, { comments: [] })
    const queue = new QueryObserver(cache, pullRequestQueueQuery(cache, session, repo, 'OPEN'))
    const stats = new QueryObserver(cache, { queryKey: statsKey, queryFn: loadStats, staleTime: Infinity })
    const context = new QueryObserver(cache, { queryKey: contextKey, queryFn: loadContext, enabled: false, staleTime: 30_000 })
    subscriptions.push(queue.subscribe(() => {}), stats.subscribe(() => {}), context.subscribe(() => {}))
    await vi.waitFor(() => expect(queue.getCurrentResult().isSuccess).toBe(true))

    await refreshPullRequestQueue(cache, session, [repo])

    expect(loadStats).toHaveBeenCalledTimes(1)
    expect(stats.getCurrentResult().data).toEqual({ commits: 2 })
    expect(loadContext).not.toHaveBeenCalled()
    context.setOptions({ queryKey: contextKey, queryFn: loadContext, enabled: true, staleTime: 30_000 })
    await vi.waitFor(() => expect(context.getCurrentResult().data).toEqual({ comments: ['Author reply'] }))
    expect(loadContext).toHaveBeenCalledTimes(1)
  })
})
