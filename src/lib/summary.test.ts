import { describe, expect, it } from 'vitest'
import { previousDateRange, summaryMetricsForRange } from './summary'
import type { RepoConfig, ReviewHistory, Session } from '../types'

const repo: RepoConfig = { workspace: 'kontroller_test', repo: 'kontroller_test' }
const session: Session = { email: 'javier@example.com', token: 'secret', expiresAt: 0, uuid: '{javier}', displayName: 'Javier Mejías' }

describe('summary metrics', () => {
  it('builds the immediately previous range with the same number of days', () => {
    expect(previousDateRange({ from: '2026-09-01', to: '2026-09-15' })).toEqual({ from: '2026-08-17', to: '2026-08-31' })
  })

  it('counts unique pull requests and groups personal activity by repository', () => {
    const history: ReviewHistory = {
      schemaVersion: 1,
      repositories: {
        'kontroller_test/kontroller_test': {
          syncedAt: '2026-09-15T00:00:00Z',
          coverage: 'complete',
          pullRequests: {
            '10': {
              id: 10,
              state: 'OPEN',
              createdAt: '2026-09-01T00:00:00Z',
              updatedOn: '2026-09-15T00:00:00Z',
              title: 'Ajuste de nómina',
              events: [
                { id: 'comment-1', type: 'comment', date: '2026-09-04T10:00:00Z', reviewerUuid: '{javier}', reviewerName: 'Javier Mejías' },
                { id: 'approval-1', type: 'approval', date: '2026-09-05T10:00:00Z', reviewerUuid: '{javier}', reviewerName: 'Javier Mejías' },
              ],
            },
          },
        },
        'kontroller_test/providers_api': {
          syncedAt: '2026-09-15T00:00:00Z',
          coverage: 'complete',
          pullRequests: {
            '11': {
              id: 11,
              state: 'MERGED',
              createdAt: '2026-09-02T00:00:00Z',
              updatedOn: '2026-09-14T00:00:00Z',
              events: [{ id: 'review-1', type: 'review', date: '2026-09-06T10:00:00Z', reviewerUuid: '{javier}' }],
            },
          },
        },
      },
    }

    const metrics = summaryMetricsForRange(history, [repo, { ...repo, repo: 'providers_api' }], session, { from: '2026-09-01', to: '2026-09-15' })
    expect(metrics.reviewed).toBe(2)
    expect(metrics.comments).toBe(1)
    expect(metrics.approved).toBe(1)
    expect(metrics.repositories.map((item) => item.pullRequests)).toEqual([1, 1])
    expect(metrics.activity.reduce((total, item) => total + item.count, 0)).toBe(3)
  })
})
