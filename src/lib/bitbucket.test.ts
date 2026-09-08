import { describe, expect, it } from 'vitest'
import { classifyPr, getLifecycleStatus, getReviewerState, isFreshPullRequest } from './bitbucket'
import type { PullRequest } from '../types'

const myUuid = '{reviewer}'

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

describe('classifyPr', () => {
  it('requires review when the user has not participated', () => {
    expect(classifyPr(buildPullRequest(), myUuid)).toBe('unreviewed')
  })

  it('requires another review when activity is newer than the user participation', () => {
    const pullRequest = buildPullRequest({
      participants: [{ user: { uuid: myUuid }, approved: true, participated_on: '2026-09-08T11:00:00Z' }],
    })

    expect(classifyPr(pullRequest, myUuid)).toBe('changes')
  })

  it('waits for the developer when the user requested changes last', () => {
    const pullRequest = buildPullRequest({
      participants: [{ user: { uuid: myUuid }, state: 'changes_requested', participated_on: '2026-09-08T13:00:00Z' }],
    })

    expect(classifyPr(pullRequest, myUuid)).toBe('waiting')
  })

  it('marks the pull request as reviewed when the user participated last', () => {
    const pullRequest = buildPullRequest({
      participants: [{ user: { uuid: myUuid }, participated_on: '2026-09-08T13:00:00Z' }],
    })

    expect(classifyPr(pullRequest, myUuid)).toBe('current')
  })

  it('marks the pull request as reviewed when the user commented after the last developer update', () => {
    const pullRequest = buildPullRequest({
      activity: [{ pull_request: { id: 42 }, comment: { created_on: '2026-09-08T12:01:00Z', user: { uuid: myUuid } } }],
    })

    expect(classifyPr(pullRequest, myUuid)).toBe('current')
  })

  it('requires another review when the developer updated after the user comment', () => {
    const pullRequest = buildPullRequest({
      updated_on: '2026-09-08T12:02:00Z',
      activity: [{ pull_request: { id: 42 }, comment: { created_on: '2026-09-08T12:01:00Z', user: { uuid: myUuid } } }],
    })

    expect(classifyPr(pullRequest, myUuid)).toBe('changes')
  })

  it('does not mark a PR as changed when the latest activity is my comment', () => {
    const pullRequest = buildPullRequest({
      updated_on: '2026-09-08T13:02:00Z',
      activity: [
        { pull_request: { id: 42 }, update: { date: '2026-09-08T12:00:00Z', author: { uuid: '{developer}' } } },
        { pull_request: { id: 42 }, comment: { created_on: '2026-09-08T13:01:00Z', user: { uuid: myUuid } } },
      ],
    })

    expect(classifyPr(pullRequest, myUuid)).toBe('current')
  })

  it('marks a PR as changed when a developer update follows my comment', () => {
    const pullRequest = buildPullRequest({
      updated_on: '2026-09-08T13:02:00Z',
      activity: [
        { pull_request: { id: 42 }, comment: { created_on: '2026-09-08T12:01:00Z', user: { uuid: myUuid } } },
        { pull_request: { id: 42 }, update: { date: '2026-09-08T13:02:00Z', author: { uuid: '{developer}' } } },
      ],
    })

    expect(classifyPr(pullRequest, myUuid)).toBe('changes')
  })

  it('waits for the developer when another reviewer requested changes last', () => {
    const pullRequest = buildPullRequest({
      participants: [{ user: { display_name: 'Diego Gustavo Cuevas Montes' }, state: 'changes_requested', participated_on: '2026-09-08T13:00:00Z' }],
    })

    expect(classifyPr(pullRequest, myUuid)).toBe('waiting')
  })
})

describe('getLifecycleStatus', () => {
  it('prioritizes merged and declined over queue flags', () => {
    expect(getLifecycleStatus(buildPullRequest({ state: 'MERGED', queued: true }))).toBe('MERGED')
    expect(getLifecycleStatus(buildPullRequest({ state: 'DECLINED', draft: true }))).toBe('DECLINED')
  })

  it('maps queued and draft open pull requests separately', () => {
    expect(getLifecycleStatus(buildPullRequest({ queued: true, draft: true }))).toBe('QUEUED')
    expect(getLifecycleStatus(buildPullRequest({ draft: true }))).toBe('DRAFT')
    expect(getLifecycleStatus(buildPullRequest())).toBe('OPEN')
  })
})

describe('getReviewerState', () => {
  it('matches reviewer names regardless of accents and casing', () => {
    const pullRequest = buildPullRequest({
      participants: [{ user: { display_name: 'IVAN REYES' }, approved: true, participated_on: '2026-09-08T13:00:00Z' }],
    })

    expect(getReviewerState(pullRequest, 'Iván Reyes')).toBe('approved')
  })

  it('shows when activity happened after a reviewer participated', () => {
    const pullRequest = buildPullRequest({
      participants: [{ user: { display_name: 'Diego Gustavo Cuevas Montes' }, approved: true, participated_on: '2026-09-08T11:00:00Z' }],
    })

    expect(getReviewerState(pullRequest, 'Diego Gustavo Cuevas Montes')).toBe('changes')
  })

  it('matches the reviewer by UUID when the display name differs', () => {
    const pullRequest = buildPullRequest({
      updated_on: '2026-09-08T10:30:00Z',
      activity: [{ pull_request: { id: 42 }, comment: { created_on: '2026-09-08T11:00:00Z', user: { uuid: myUuid, display_name: 'Javier M.' } } }],
    })

    expect(getReviewerState(pullRequest, 'Javier Mejía', myUuid)).toBe('reviewed')
  })
})

describe('isFreshPullRequest', () => {
  it('identifies a pull request without review activity', () => {
    expect(isFreshPullRequest(buildPullRequest())).toBe(true)
  })

  it('does not call a pull request new after a review comment', () => {
    const pullRequest = buildPullRequest({
      activity: [{ pull_request: { id: 42 }, comment: { created_on: '2026-09-08T11:00:00Z', user: { uuid: myUuid } } }],
    })

    expect(isFreshPullRequest(pullRequest)).toBe(false)
  })
})
