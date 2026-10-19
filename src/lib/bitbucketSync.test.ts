import { afterEach, describe, expect, it, vi } from 'vitest'
import { BITBUCKET_REQUEST_CONCURRENCY, getPullRequests, REPOSITORY_SYNC_TIMEOUT_MS, verifyUser } from './bitbucket'
import type { Session } from '../types'

const repo = { workspace: 'team', repo: 'app' }
const session: Session = { email: 'qa@example.com', token: 'test-token', uuid: '{qa}', expiresAt: 0 }
const response = (body: unknown) => ({ ok: true, json: async () => body })
const pr = (id: number, updatedOn = '2026-10-01T12:00:00Z') => ({
  id, title: `PR ${id}`, state: 'OPEN', created_on: '2026-09-01T12:00:00Z', updated_on: updatedOn,
  participants: [{ user: { uuid: session.uuid }, participated_on: '2026-09-30T12:00:00Z' }],
})

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('repository sync', () => {
  it('loads the requested state without traversing closed history', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = new URL(input)
      expect(url.searchParams.get('state')).toBe('OPEN')
      return response({ values: [] })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(getPullRequests(repo, session, { state: 'OPEN' })).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reuses unchanged activity and reloads changed PRs', async () => {
    let updated = false
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = new URL(input)
      if (url.pathname.endsWith('/pullrequests')) return response({ values: [pr(1), pr(2, updated ? '2026-10-02T12:00:00Z' : undefined)] })
      return response({ values: [{ approval: { date: '2026-09-30T12:00:00Z', user: { uuid: session.uuid } } }] })
    })
    vi.stubGlobal('fetch', fetchMock)
    const previousPullRequests = await getPullRequests(repo, session, { state: 'OPEN' })
    updated = true
    fetchMock.mockClear()
    const result = await getPullRequests(repo, session, { state: 'OPEN', previousPullRequests })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain('/2/activity')
    expect(result[0].activity).toEqual(previousPullRequests[0].activity)
  })

  it('bounds a full sync even when every page responds before its request timeout', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((input: string | URL, init: RequestInit) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(response({ values: [], next: String(input) })), 20_000)
      init.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(init.signal?.reason) }, { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)
    const loading = getPullRequests(repo, session, { state: 'OPEN' })
    const rejection = expect(loading).rejects.toThrow('La sincronización superó 90 segundos')
    await vi.advanceTimersByTimeAsync(REPOSITORY_SYNC_TIMEOUT_MS)
    await rejection
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels requests waiting for a slot and releases capacity for a later sync', async () => {
    const active = new Set<AbortSignal>()
    const fetchMock = vi.fn((_input: string | URL, init: RequestInit) => new Promise((_resolve, reject) => {
      const signal = init.signal!
      active.add(signal)
      signal.addEventListener('abort', () => { active.delete(signal); reject(signal.reason) }, { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const jobs = Array.from({ length: 9 }, () => getPullRequests(repo, session, { state: 'OPEN', signal: controller.signal }))
    const settled = Promise.allSettled(jobs)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(BITBUCKET_REQUEST_CONCURRENCY))
    controller.abort(new Error('Cancelled by test'))
    expect((await settled).every((result) => result.status === 'rejected')).toBe(true)
    expect(active.size).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(BITBUCKET_REQUEST_CONCURRENCY)
    vi.stubGlobal('fetch', vi.fn(async () => response({ uuid: session.uuid })))
    await expect(verifyUser(session)).resolves.toEqual({ uuid: session.uuid })
  })

  it('aborts sibling activity requests when one PR fails', async () => {
    let siblingAborted = false
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init: RequestInit) => {
      const url = new URL(input)
      if (url.pathname.endsWith('/pullrequests')) return response({ values: [pr(1), pr(2)] })
      if (url.pathname.endsWith('/1/activity')) return { ok: false, status: 403 }
      return new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => {
        siblingAborted = true
        reject(init.signal?.reason)
      }, { once: true }))
    }))
    await expect(getPullRequests(repo, session, { state: 'OPEN' })).rejects.toThrow('Actividad del PR #1: El token no tiene permiso')
    expect(siblingAborted).toBe(true)
  })

  it.each([
    [400, 'HTTP 400'], [401, 'Credenciales inválidas'], [403, 'no tiene permiso'],
    [404, 'no existe'], [429, 'limitó temporalmente'], [503, 'HTTP 503'],
  ])('explains HTTP %i failures with the operation that failed', async (status, message) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status })))
    await expect(getPullRequests(repo, session, { state: 'OPEN' })).rejects.toThrow(`Listado de PR abiertos:`)
    await expect(getPullRequests(repo, session, { state: 'OPEN' })).rejects.toThrow(message)
  })
})
