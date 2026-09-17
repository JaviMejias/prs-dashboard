import { describe, expect, it, vi } from 'vitest'
import { getPullRequests, getReviewHistorySnapshot } from './bitbucket'
import type { RepoConfig, Session } from '../types'

const repo: RepoConfig = { workspace: 'kontroller_test', repo: 'kontroller_test' }
const session: Session = { email: 'javier@example.com', token: 'test-token', expiresAt: Date.now() + 60_000, uuid: '{javier}', displayName: 'Javier Mejías' }

const response = (body: unknown) => ({ ok: true, json: async () => body })
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

describe('getPullRequests activity fallback', () => {
  it('reloads the PR activity when the global feed is behind the PR update', async () => {
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
    expect(fetchMock).toHaveBeenCalledTimes(5)
    vi.unstubAllGlobals()
  })
})
