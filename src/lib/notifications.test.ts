import { describe, expect, it } from 'vitest'
import {
  createPullRequestNotice,
  getActionableNoticeKind,
  getObservedRepositories,
  noticeReferencesPullRequest,
  repositorySnapshotKey,
} from './notifications'
import type { NotificationSnapshotEntry, PullRequest } from '../types'

const current: NotificationSnapshotEntry = {
  updatedOn: '2026-09-09T12:00:00Z',
  needsReview: true,
}

function buildPullRequest(): PullRequest {
  return {
    id: 14833,
    title: 'KON-1721: Feature/measure unit 3 chile',
    state: 'OPEN',
    created_on: '2026-09-09T10:00:00Z',
    updated_on: current.updatedOn,
    author: { display_name: 'Carlo Osores Salgado' },
    source: {
      repository: {
        links: { html: { href: 'https://bitbucket.org/kontroller_test/carlo-kontroller_test' } },
      },
    },
    links: { html: { href: 'https://bitbucket.org/kontroller_test/kontroller_test/pull-requests/14833' } },
    repo: { workspace: 'kontroller_test', repo: 'kontroller_test' },
  }
}

describe('getActionableNoticeKind', () => {
  it('does not notify while creating the initial repository baseline', () => {
    expect(getActionableNoticeKind(undefined, current, false)).toBeNull()
  })

  it('notifies when a new pull request appears after the baseline', () => {
    expect(getActionableNoticeKind(undefined, current, true)).toBe('new-pr')
  })

  it('notifies when review becomes necessary after a newer update', () => {
    expect(getActionableNoticeKind({ updatedOn: '2026-09-09T11:00:00Z', needsReview: false }, current, true)).toBe('review-required')
  })

  it('does not repeat notifications while the pull request is already pending', () => {
    expect(getActionableNoticeKind({ updatedOn: '2026-09-09T11:00:00Z', needsReview: true }, current, true)).toBeNull()
  })

  it('does not notify for routine updates that do not require review', () => {
    expect(getActionableNoticeKind(
      { updatedOn: '2026-09-09T11:00:00Z', needsReview: false },
      { ...current, needsReview: false },
      true,
    )).toBeNull()
  })

  it('migrates the previous timestamp-only snapshot safely', () => {
    expect(getActionableNoticeKind('2026-09-09T11:00:00Z', current, true)).toBe('review-required')
  })
})

describe('notification snapshot repositories', () => {
  it('recognizes current markers and legacy pull request keys', () => {
    const repositories = getObservedRepositories({
      '@repo:kontroller_test/providers_api': { updatedOn: current.updatedOn, needsReview: false },
      'kontroller_test/kontroller_test#14833': current.updatedOn,
    })

    expect(repositories).toEqual(new Set([
      'kontroller_test/providers_api',
      'kontroller_test/kontroller_test',
    ]))
    expect(repositorySnapshotKey({ workspace: 'kontroller_test', repo: 'providers_api' })).toBe('@repo:kontroller_test/providers_api')
  })
})

describe('createPullRequestNotice', () => {
  it('creates a structured message with actor and pull request destinations', () => {
    expect(createPullRequestNotice(buildPullRequest(), 'review-required', 123)).toMatchObject({
      actorName: 'Carlo Osores Salgado',
      actorUrl: 'https://bitbucket.org/kontroller_test/carlo-kontroller_test',
      action: 'actualizó',
      pullRequestTitle: 'KON-1721: Feature/measure unit 3 chile',
      pullRequestUrl: 'https://bitbucket.org/kontroller_test/kontroller_test/pull-requests/14833',
      repositoryName: 'kontroller_test',
      pullRequestId: 14833,
      pullRequestKey: 'kontroller_test/kontroller_test#14833',
      createdAt: 123,
      read: false,
    })
  })

  it('locates both current and legacy notices safely', () => {
    const pr = buildPullRequest()
    const currentNotice = createPullRequestNotice(pr, 'new-pr')
    const legacyNotice = { ...currentNotice, pullRequestKey: undefined }

    expect(noticeReferencesPullRequest(currentNotice, pr)).toBe(true)
    expect(noticeReferencesPullRequest(legacyNotice, pr)).toBe(true)
    expect(noticeReferencesPullRequest({ ...legacyNotice, pullRequestId: 99 }, pr)).toBe(true)
    expect(noticeReferencesPullRequest({ ...legacyNotice, pullRequestUrl: undefined, pullRequestId: 99 }, pr)).toBe(false)
  })
})
