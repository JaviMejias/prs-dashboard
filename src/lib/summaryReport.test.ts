import { describe, expect, it } from 'vitest'
import { summaryReport } from './summaryReport'
import type { ReviewHistory, Session } from '../types'

const session: Session = { email: 'qa@example.com', token: 'NEVER_EXPORT_THIS_TOKEN', uuid: '{qa}', displayName: 'QA', expiresAt: 0 }
const range = { from: '2026-01-01', to: '2026-10-28' }
const history: ReviewHistory = { schemaVersion: 1, repositories: { 'team/app': {
  syncedAt: '2026-10-28T12:00:00Z', coverage: 'complete', pullRequests: { '7': {
    id: 7, title: 'A | B\n<script>', state: 'MERGED', createdAt: '2025-01-01', updatedOn: '2026-10-01', url: 'https://bitbucket.org/team/app/pull-requests/7',
    events: [
      { id: 'comment:1', type: 'comment', date: '2026-02-01T12:00:00Z', reviewerUuid: '{qa}' },
      { id: 'approval', type: 'approval', date: '2026-03-01T12:00:00Z', reviewerUuid: '{qa}' },
      { id: 'other', type: 'comment', date: '2026-03-01T12:00:00Z', reviewerUuid: '{other}' },
    ],
  } },
} } }

describe('shareable summary report', () => {
  it('exports every matching event, coverage, totals and source without credentials', () => {
    const text = summaryReport(history, [{ workspace: 'team', repo: 'app' }], session, range, true)
    expect(text).toContain('| PR con actividad propia | 1 |')
    expect(text).toContain('| Comentarios | 1 |')
    expect(text).toContain('2026-02-01T12:00:00Z')
    expect(text).toContain('https://bitbucket.org/team/app/pull-requests/7')
    expect(text).toContain('A \\| B script')
    expect(text).toContain('Cobertura: Completa')
    expect(text).not.toContain(session.token)
    expect(text).not.toContain('<script>')
  })
  it('never presents incomplete data as a definitive report', () => {
    expect(summaryReport(history, [{ workspace: 'team', repo: 'app' }], session, range, false)).toContain('PARCIAL. No utilizar como total definitivo.')
  })
  it('exports more than the six events displayed in the timeline', () => {
    const full = structuredClone(history)
    full.repositories['team/app'].pullRequests['7'].events = Array.from({ length: 20 }, (_, index) => ({
      id: `comment:${index}`, type: 'comment', date: `2026-02-${String(index + 1).padStart(2, '0')}T12:00:00Z`, reviewerUuid: '{qa}', source: 'activity',
    }))
    const text = summaryReport(full, [{ workspace: 'team', repo: 'app' }], session, range, true)
    expect(text).toContain('| Comentarios | 20 |')
    expect(text.match(/\| Registro de actividad \|/g)).toHaveLength(20)
  })
  it('renders titles as text and excludes credential-bearing source URLs', () => {
    const unsafe = structuredClone(history)
    unsafe.repositories['team/app'].pullRequests['7'].title = '![image](https://untrusted.example/track)'
    unsafe.repositories['team/app'].pullRequests['7'].url = 'https://token@bitbucket.org/team/app/pull-requests/7'
    const text = summaryReport(unsafe, [{ workspace: 'team', repo: 'app' }], session, range, true)
    expect(text).not.toContain('![image]')
    expect(text).not.toContain('https://token@')
    expect(text).toContain('\\!\\[image\\]')
  })
})
