import { describe, expect, it } from 'vitest'
import { buildPullRequestHistory, historyCoverage, historyPullRequests, mergeReviewHistory } from './reviewHistory'
import type { PullRequest, ReviewHistory } from '../types'

const pullRequest = (overrides: Partial<PullRequest> = {}): PullRequest => ({
  id: 15120,
  title: 'Reporte costo remuneraciones',
  state: 'OPEN',
  created_on: '2026-09-15T03:28:39Z',
  updated_on: '2026-09-15T16:36:33Z',
  repo: { workspace: 'kontroller_test', repo: 'kontroller_test' },
  ...overrides,
})

describe('review history', () => {
  it('stores review comments and deduplicates participant activity', () => {
    const history = buildPullRequestHistory(pullRequest({
      participants: [{ user: { uuid: '{javier}', display_name: 'Javier Mejías' }, participated_on: '2026-09-15T14:58:45Z' }],
      activity: [
        { pull_request: { id: 15120 }, comment: { created_on: '2026-09-15T14:58:45Z', user: { uuid: '{javier}', display_name: 'Javier Mejías' } } },
        { pull_request: { id: 15120 }, comment: { created_on: '2026-09-15T14:58:45Z', user: { uuid: '{javier}', display_name: 'Javier Mejías' } } },
      ],
    }))

    expect(history.events).toHaveLength(2)
    expect(history.events.map((event) => event.type)).toEqual(['comment', 'review'])
  })

  it('keeps existing PR events when a later sync has no activity details', () => {
    const previousPullRequest = pullRequest({ id: 7, repo: { workspace: 'w', repo: 'r' }, activity: [{ pull_request: { id: 7 }, comment: { created_on: '2026-09-01T10:00:00Z', user: { uuid: '{javier}' } } }] })
    const previous: ReviewHistory = { schemaVersion: 1, repositories: { 'w/r': { syncedAt: '2026-09-01T00:00:00Z', coverage: 'partial', pullRequests: { '7': buildPullRequestHistory(previousPullRequest) } } } }
    const next = mergeReviewHistory(previous, [pullRequest({ id: 7, repo: { workspace: 'w', repo: 'r' }, updated_on: '2026-09-15T17:00:00Z' })], '2026-09-15T17:00:00Z')

    expect(next.repositories['w/r'].pullRequests['7'].events).toHaveLength(1)
    expect(next.repositories['w/r'].pullRequests['7'].updatedOn).toBe('2026-09-15T17:00:00Z')
  })

  it('appends newly discovered events without losing earlier activity', () => {
    const previousPullRequest = pullRequest({
      id: 7,
      repo: { workspace: 'w', repo: 'r' },
      activity: [{ pull_request: { id: 7 }, comment: { created_on: '2026-09-01T10:00:00Z', user: { uuid: '{javier}' } } }],
    })
    const previous: ReviewHistory = { schemaVersion: 1, repositories: { 'w/r': { syncedAt: '2026-09-01T00:00:00Z', coverage: 'partial', pullRequests: { '7': buildPullRequestHistory(previousPullRequest) } } } }
    const next = mergeReviewHistory(previous, [pullRequest({
      id: 7,
      repo: { workspace: 'w', repo: 'r' },
      activity: [{ pull_request: { id: 7 }, approval: { date: '2026-09-15T17:00:00Z', user: { uuid: '{javier}' } } }],
    })], '2026-09-15T17:00:00Z')

    expect(next.repositories['w/r'].pullRequests['7'].events.map((event) => event.type)).toEqual(['comment', 'approval'])
  })

  it('keeps existing PRs while merging the records seen in a sync', () => {
    const previous: ReviewHistory = { schemaVersion: 1, repositories: { 'w/r': { syncedAt: '2026-09-01T00:00:00Z', coverage: 'partial', pullRequests: { '7': buildPullRequestHistory(pullRequest({ id: 7, repo: { workspace: 'w', repo: 'r' } })) } } } }
    const next = mergeReviewHistory(previous, [pullRequest()], '2026-09-15T17:00:00Z')

    expect(Object.keys(next.repositories['w/r'].pullRequests)).toEqual(['7'])
    expect(Object.keys(next.repositories['kontroller_test/kontroller_test'].pullRequests)).toEqual(['15120'])
    expect(historyPullRequests(next)).toHaveLength(2)
    expect(historyCoverage(next)).toBe('partial')
  })
})
