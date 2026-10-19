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
  it('keeps personal participation and commit evidence while waiting for the developer', () => {
    const pr = buildPullRequest([
      { update: { date: '2026-09-16T11:00:00Z', author, source: { commit: { hash: 'baseline' } } } },
      myReview,
    ])
    expect(getReviewDecision(pr, reviewer.uuid, reviewer.display_name)).toMatchObject({
      status: 'waiting', reason: 'waiting_for_developer', confidence: 'confirmed', reviewDate,
      reviewedCommit: 'baseline', latestCommit: 'baseline',
    })
  })

  it('preserves a participation date from the participant when activity is missing', () => {
    const pr = { ...buildPullRequest([]), updated_on: reviewDate }
    expect(getReviewDecision(pr, reviewer.uuid, reviewer.display_name)).toMatchObject({ status: 'waiting', reviewDate })
  })

  it('keeps the current user date, not the blocking reviewer date, when another reviewer is waiting', () => {
    const ownDate = '2026-09-16T14:00:00Z'
    const pr = buildPullRequest([{ approval: { date: ownDate, user: { uuid: '{other}', display_name: 'Other QA' } } }])
    const result = getReviewDecision(pr, '{other}', 'Other QA')
    expect(result).toMatchObject({ status: 'waiting', reviewDate: ownDate })
    expect(result.reviewDate).not.toBe(reviewDate)
  })

  it.each([[undefined, undefined], ['{unknown}', 'Unknown QA']])('does not borrow a waiting reviewer date without personal evidence (%s)', (uuid, name) => {
    const result = getReviewDecision({ ...buildPullRequest([]), updated_on: reviewDate }, uuid, name)
    expect(result.status).toBe('waiting')
    expect(result.reviewDate).toBeUndefined()
    expect(result.reviewedCommit).toBeUndefined()
  })

  it('detects a developer commit even without an older commit baseline', () => {
    const pr = buildPullRequest([
      myReview,
      {
        pull_request: { id: 14913 },
        update: { date: '2026-09-17T00:00:00Z', author, source: { commit: { hash: 'abcdef123456' } } },
      },
    ])

    expect(getReviewDecision(pr, reviewer.uuid, reviewer.display_name)).toMatchObject({
      status: 'changes',
      reason: 'developer_activity_after_review',
      latestDeveloperActivity: 'commit',
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
})
