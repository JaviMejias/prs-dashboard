import { describe, expect, it } from 'vitest'
import { getReviewDecision } from './pullRequestReviewState'
import type { PullRequest, PullRequestActivity } from '../types'

const reviewer = { uuid: '{javier}', display_name: 'Javier Mejías' }
const author = { uuid: '{juan}', display_name: 'Juan carlos mestanza Lopez' }
const reviewDate = '2026-09-16T12:00:00Z'

function buildPullRequest(activity: PullRequestActivity[]): PullRequest {
  return {
    id: 14913,
    title: 'Documentos de venta',
    state: 'OPEN',
    created_on: '2026-09-16T10:00:00Z',
    updated_on: '2026-09-17T12:00:00Z',
    author,
    participants: [{ user: reviewer, state: 'changes_requested', participated_on: reviewDate }],
    activity,
    repo: { workspace: 'kontroller_test', repo: 'kontroller_test' },
  }
}

const myReview = { pull_request: { id: 14913 }, comment: { created_on: reviewDate, user: reviewer } }

describe('getReviewDecision', () => {
  it('keeps the PR pending without claiming a new commit when the baseline is missing', () => {
    const pr = buildPullRequest([
      myReview,
      {
        pull_request: { id: 14913 },
        update: { date: '2026-09-17T00:00:00Z', author, source: { commit: { hash: 'abcdef123456' } } },
      },
    ])

    expect(getReviewDecision(pr, reviewer.uuid, reviewer.display_name)).toMatchObject({
      status: 'changes',
      reason: 'updated_after_review',
      confidence: 'unknown',
    })
  })

  it('returns the PR to QA when the developer replies without committing', () => {
    const pr = buildPullRequest([
      myReview,
      {
        pull_request: { id: 14913 },
        comment: { created_on: '2026-09-17T01:00:00Z', user: author },
      },
    ])

    expect(getReviewDecision(pr, reviewer.uuid, reviewer.display_name)).toMatchObject({
      status: 'changes',
      reason: 'developer_activity_after_review',
      latestDeveloperActivity: 'comment',
    })
  })

  it('preserves that both commits and comments happened after the review', () => {
    const pr = buildPullRequest([
      { update: { date: '2026-09-16T10:00:00Z', author, source: { commit: { hash: 'baseline' } } } },
      myReview,
      {
        pull_request: { id: 14913 },
        update: { date: '2026-09-17T00:00:00Z', author, source: { commit: { hash: 'abcdef123456' } } },
      },
      {
        pull_request: { id: 14913 },
        comment: { created_on: '2026-09-17T01:00:00Z', user: author },
      },
    ])

    expect(getReviewDecision(pr, reviewer.uuid, reviewer.display_name).latestDeveloperActivity).toBe('commit_and_comment')
  })

  it('does not flag the author editing metadata on the same commit as new code', () => {
    const pr = buildPullRequest([
      { update: { date: '2026-09-16T10:00:00Z', author, source: { commit: { hash: 'same' } } } },
      myReview,
      { update: { date: '2026-09-17T12:00:00Z', author, source: { commit: { hash: 'same' } } } },
    ])
    pr.participants = [{ user: reviewer, approved: true, participated_on: reviewDate }]
    expect(getReviewDecision(pr, reviewer.uuid)).toMatchObject({ status: 'current', reason: 'same_commit_after_review', confidence: 'confirmed' })
  })

  it('keeps an approved PR in attention when activity could not be loaded', () => {
    const pr = { ...buildPullRequest([myReview]), activityComplete: false, updated_on: reviewDate }
    expect(getReviewDecision(pr, reviewer.uuid)).toMatchObject({ status: 'changes', reason: 'activity_incomplete', confidence: 'unknown' })
  })

  it('does not confirm the same commit when a later update omits its hash', () => {
    const pr = buildPullRequest([
      { update: { date: '2026-09-16T10:00:00Z', source: { commit: { hash: 'baseline' } } } },
      myReview,
      { update: { date: '2026-09-17T12:00:00Z', author } },
    ])
    expect(getReviewDecision(pr, reviewer.uuid)).toMatchObject({ status: 'changes', confidence: 'unknown' })
  })

  it('does not hide a PR as waiting when the change request has no date', () => {
    const pr = buildPullRequest([])
    pr.participants = [{ user: reviewer, state: 'changes_requested' }]
    expect(getReviewDecision(pr, reviewer.uuid).status).toBe('unreviewed')
  })
})
