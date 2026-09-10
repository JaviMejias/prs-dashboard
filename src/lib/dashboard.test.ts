import { afterEach, describe, expect, it, vi } from 'vitest'
import { matchesReviewFilter, pullRequestKey, requiresReview } from './dashboard'
import type { PullRequest } from '../types'

const reviewerUuid = '{reviewer}'

function buildPullRequest(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: 42,
    title: 'Improve review queue',
    state: 'OPEN',
    created_on: '2026-09-08T10:00:00Z',
    updated_on: '2026-09-08T12:00:00Z',
    repo: { workspace: 'kontroller', repo: 'dashboard' },
    ...overrides,
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('requiresReview', () => {
  it('uses the same actionable rule as the attention filter', () => {
    const pullRequest = buildPullRequest()

    expect(requiresReview(pullRequest, reviewerUuid)).toBe(true)
    expect(matchesReviewFilter(pullRequest, 'ATTENTION', reviewerUuid)).toBe(true)
  })

  it('excludes waiting, draft, queued and closed pull requests', () => {
    const waiting = buildPullRequest({
      participants: [{
        user: { uuid: reviewerUuid },
        state: 'changes_requested',
        participated_on: '2026-09-08T13:00:00Z',
      }],
    })

    expect(requiresReview(waiting, reviewerUuid)).toBe(false)
    expect(requiresReview(buildPullRequest({ draft: true }), reviewerUuid)).toBe(false)
    expect(requiresReview(buildPullRequest({ queued: true }), reviewerUuid)).toBe(false)
    expect(requiresReview(buildPullRequest({ state: 'MERGED' }), reviewerUuid)).toBe(false)
    expect(requiresReview(buildPullRequest({ state: 'DECLINED' }), reviewerUuid)).toBe(false)
  })

  it('excludes pull requests stored as no-review rules', () => {
    const pullRequest = buildPullRequest()
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ authors: [], pullRequests: [pullRequestKey(pullRequest)] }),
    })

    expect(requiresReview(pullRequest, reviewerUuid)).toBe(false)
    expect(matchesReviewFilter(pullRequest, 'ATTENTION', reviewerUuid)).toBe(false)
  })
})
