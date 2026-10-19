import { afterEach, describe, expect, it, vi } from 'vitest'
import { getReviewContextDetails } from './bitbucket'
import type { PullRequest, Session } from '../types'

const session: Session = { email: 'qa@example.com', token: 'test-token', expiresAt: 0 }
const pr: PullRequest = { id: 12, title: 'Context', state: 'OPEN', created_on: '2026-10-01T00:00:00Z', updated_on: '2026-10-02T00:00:00Z', repo: { workspace: 'team', repo: 'app' } }
const response = (value: unknown) => ({ ok: true, json: async () => value })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('Bitbucket review context', () => {
  it('loads paginated conversations with identities, ancestry, location and links', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input)
      if (!url.pathname.endsWith('/comments')) return response({ values: [] })
      return url.searchParams.has('page')
        ? response({ values: [{ id: 2, parent: { id: 1 }, content: { raw: 'Added validation' }, user: { uuid: '{dev}', display_name: 'Developer' }, created_on: '2026-10-02T00:00:00Z', links: { html: { href: 'https://bitbucket.org/team/app/pull-requests/12#comment-2' } } }, { id: 3, deleted: true, content: { raw: 'Removed' } }] })
        : response({ values: [{ id: 1, content: { raw: 'Missing validation' }, user: { uuid: '{qa}', display_name: 'QA' }, inline: { path: 'app/order.rb', to: 21 } }], next: `${url.origin}${url.pathname}?page=2` })
    })
    vi.stubGlobal('fetch', fetchMock)
    const details = await getReviewContextDetails(pr, session)
    expect(details.comments).toHaveLength(2)
    expect(details.comments[0]).toMatchObject({ id: 1, authorUuid: '{qa}', path: 'app/order.rb', line: 21 })
    expect(details.comments[1]).toMatchObject({ parentId: 1, content: 'Added validation', url: expect.stringContaining('#comment-2') })
    expect(details.comments[1].createdAt).toBe('2026-10-02T00:00:00Z')
    expect(details.unavailable).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('keeps successful data and marks a failed comments request as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (new URL(input).pathname.endsWith('/comments')) return { ok: false, status: 429 }
      if (new URL(input).pathname.endsWith('/commits')) return response({ values: [{ hash: 'abc', message: 'Fix validation' }] })
      return response({ values: [] })
    }))
    const details = await getReviewContextDetails(pr, session)
    expect(details.unavailable).toEqual(['comments'])
    expect(details.commits[0].hash).toBe('abc')
  })

  it('bounds the whole context fetch, even when pagination keeps responding', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((input: string, init: RequestInit) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(response({ values: [], next: input })), 20_000)
      init.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(init.signal?.reason) }, { once: true })
    })))
    const loading = getReviewContextDetails(pr, session)
    await vi.advanceTimersByTimeAsync(90_000)
    expect((await loading).unavailable).toEqual(['commits', 'changed files', 'comments', 'activity'])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels in-flight context requests when the consumer leaves', async () => {
    let aborted = 0
    vi.stubGlobal('fetch', vi.fn((_input: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => { aborted++; reject(init.signal?.reason) }, { once: true })
    })))
    const controller = new AbortController()
    const loading = getReviewContextDetails(pr, session, controller.signal)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4))
    controller.abort()
    expect((await loading).unavailable).toContain('comments')
    expect(aborted).toBe(4)
  })
})
