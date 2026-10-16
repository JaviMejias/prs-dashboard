import { afterEach, describe, expect, it, vi } from 'vitest'
import { BITBUCKET_REQUEST_TIMEOUT_MS, getPullRequests, getReviewContextDetails, getReviewHistorySnapshot, getStats, verifyUser } from './bitbucket'
import { getHandoffMessage, getReviewLabel, requiresReview } from './dashboard'
import { getReviewDecision } from './pullRequestReviewState'
import { buildReviewContext } from './reviewContext'
import type { PullRequest, Session } from '../types'

const api = 'https://api.bitbucket.org/2.0/repositories/team/app/pullrequests'
const repo = { workspace: 'team', repo: 'app' }
const session: Session = { email: 'qa@example.com', token: 'fixture', uuid: 'qa', expiresAt: 0 }
const response = (values: unknown[], next?: string) => ({ ok: true, json: async () => ({ values, next }) })
const pr = (id = 1): PullRequest => ({ id, title: `PR ${id}`, state: 'OPEN', created_on: '2026-09-01T10:00:00Z', updated_on: '2026-09-02T10:00:00Z', repo })
const mockFetch = (handler: (url: string) => unknown) => {
  const mock = vi.fn(async (url: string | URL) => handler(String(url)))
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('queue coverage', () => {
  it('loads the seventh page of PRs instead of silently stopping at 300', async () => {
    mockFetch((url) => {
      if (!url.includes('state=OPEN')) return response([])
      const page = Number(new URL(url).searchParams.get('page') || 1)
      return response(Array.from({ length: 50 }, (_, index) => pr((page - 1) * 50 + index + 1)), page < 7 ? `${api}?state=OPEN&page=${page + 1}` : undefined)
    })
    const result = await getPullRequests(repo, session)
    expect(result.prs).toHaveLength(350)
    expect(result.complete).toBe(true)
  })

  it('retains successful PRs when another individual activity request fails', async () => {
    mockFetch((url) => {
      if (url.includes('state=OPEN')) return response([pr(1), pr(2)])
      if (url.includes('/pullrequests/activity')) throw new Error('Feed unavailable')
      if (url.includes('/1/activity')) throw new Error('PR unavailable')
      if (url.includes('/2/activity')) return response([{ pull_request: { id: 2 }, comment: { created_on: '2026-09-02T10:00:00Z', user: { uuid: 'dev' } } }])
      return response([])
    })
    const result = await getPullRequests(repo, session)
    expect(result.prs).toHaveLength(2)
    expect(result.prs[0].activityComplete).toBe(false)
    expect(result.prs[1].activityComplete).toBe(true)
    expect(result.prs[1].activity).toHaveLength(1)
    expect(result.complete).toBe(false)
    expect(result.warnings.join(' ')).toContain('PR #1')
  })

  it('preserves the open list when a closed-state list fails', async () => {
    mockFetch((url) => {
      if (url.includes('state=OPEN')) return response([pr()])
      if (url.includes('state=MERGED')) throw new Error('Unavailable')
      return response([])
    })
    const result = await getPullRequests(repo, session)
    expect(result.prs).toHaveLength(1)
    expect(result.complete).toBe(false)
    expect(result.warnings.join(' ')).toContain('fusionados')
  })

  it('rejects a missing open list so a refetch can retain its previous snapshot', async () => {
    mockFetch((url) => {
      if (url.includes('state=OPEN')) throw new Error('Open list unavailable')
      return response([])
    })
    await expect(getPullRequests(repo, session)).rejects.toThrow('Open list unavailable')
  })

  it('marks a failed later page as partial and preserves the first page', async () => {
    mockFetch((url) => {
      if (url.includes('page=2')) throw new Error('Second page failed')
      if (url.includes('state=OPEN')) return response([pr()], `${api}?state=OPEN&page=2`)
      return response([])
    })
    const result = await getPullRequests(repo, session)
    expect(result.prs).toHaveLength(1)
    expect(result.complete).toBe(false)
    expect(result.warnings.join(' ')).toContain('abiertos')
  })

  it('stops a pagination cycle and reports incomplete coverage', async () => {
    const fetch = mockFetch((url) => url.includes('state=OPEN') ? response([pr()], `${api}?state=OPEN`) : response([]))
    const result = await getPullRequests(repo, session)
    expect(result.complete).toBe(false)
    expect(fetch.mock.calls.length).toBeLessThan(10)
  })

  it('bounds a never-ending sequence of unique pages and marks the result partial', async () => {
    mockFetch((url) => {
      if (!url.includes('state=OPEN')) return response([])
      const page = Number(new URL(url).searchParams.get('page') || 1)
      return response([pr(page)], `${api}?state=OPEN&page=${page + 1}`)
    })
    const result = await getPullRequests(repo, session)
    expect(result.prs).toHaveLength(100)
    expect(result.complete).toBe(false)
  })

  it('uses individual activity when the global feed exceeds its page budget', async () => {
    mockFetch((url) => {
      if (url.includes('state=OPEN')) return response([pr()])
      if (url.includes('/pullrequests/activity')) {
        const page = Number(new URL(url).searchParams.get('page') || 1)
        return response([], `${api}/activity?page=${page + 1}`)
      }
      if (url.includes('/1/activity')) return response([{ comment: { user: { uuid: 'qa' }, created_on: pr().updated_on } }])
      return response([])
    })
    const result = await getPullRequests(repo, session)
    expect(result.complete).toBe(true)
    expect(result.prs[0].activityComplete).toBe(true)
    expect(result.prs[0].activity).toHaveLength(1)
  })
})

describe('history, context and technical totals', () => {
  it('merges later successful activity after the first PR returns partial data', async () => {
    mockFetch((url) => {
      if (url.includes('state=OPEN')) return response([pr(1), pr(2)])
      if (url.includes('/1/activity')) return response([{ comment: { id: 1 } }], `${api}/1/activity`)
      if (url.includes('/2/activity')) return response([{ comment: { id: 2 } }])
      return response([])
    })
    const result = await getReviewHistorySnapshot(repo, session, {})
    expect(result.complete).toBe(false)
    expect(result.prs[0].activity[0].comment?.id).toBe(1)
    expect(result.prs[1].activity[0].comment?.id).toBe(2)
  })

  it('counts all seven pages of technical totals', async () => {
    mockFetch((url) => {
      if (url.includes('/diffstat')) return response([])
      const page = Number(new URL(url).searchParams.get('page') || 1)
      return response(Array(50).fill({}), page < 7 ? `${api}/1/commits?page=${page + 1}` : undefined)
    })
    expect((await getStats(pr(), session)).commits).toBe(350)
  })

  it('does not display complete totals or send credentials to an unexpected next-page origin', async () => {
    const fetch = mockFetch((url) => url.includes('/commits') ? response([{}], 'https://unexpected.example/page') : response([]))
    await expect(getStats(pr(), session)).rejects.toThrow('datos parciales')
    expect(fetch.mock.calls.every(([url]) => String(url).startsWith('https://api.bitbucket.org/'))).toBe(true)
  })

  it('exports available context pages with an explicit partial warning', async () => {
    mockFetch((url) => url.includes('/commits') ? response([{ hash: 'one', message: 'Loaded commit' }], `${api}/1/commits`) : response([]))
    const result = await getReviewContextDetails(pr(), session)
    expect(result.commits[0].hash).toBe('one')
    expect(result.unavailable).toContain('commits (carga parcial)')
  })

  it('uses fresh context activity instead of the older queue decision', () => {
    const old = { ...pr(), activityComplete: false }
    const context = buildReviewContext(old, session, { commits: [], changedFiles: [], comments: [], diffstat: { files: 0, additions: 0, deletions: 0, totalChanges: 0 }, activity: [{ comment: { user: { uuid: 'qa' }, created_on: old.updated_on } }], activityComplete: true, unavailable: [] })
    expect(context.reviewState.status).toBe('current')
  })
})

describe('uncertain evidence and recovery', () => {
  it('keeps incomplete PRs in attention without calling the activity new code', () => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    const value = { ...pr(), activityComplete: false }
    const decision = getReviewDecision(value, session.uuid)
    expect(requiresReview(value, session.uuid)).toBe(true)
    expect(getReviewLabel(value, decision.status, decision)).toBe('Verificar actividad')
    expect(getHandoffMessage(value, decision.status, decision).label).toBe('Actividad por verificar')
  })

  it('aborts a stalled request after 25 seconds with a recoverable error', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('Aborted')))
    })))
    const assertion = expect(verifyUser(session)).rejects.toThrow('tardó demasiado')
    await vi.advanceTimersByTimeAsync(BITBUCKET_REQUEST_TIMEOUT_MS)
    await assertion
  })
})
