import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApplicableRulesMarkdown, buildCodexPreparation, buildRepositoryCodexConfiguration, buildReviewContext, buildReviewContextJson, buildReviewContextMarkdown } from './reviewContext'
import { getAvailableRules } from './rulepacks'
import type { PullRequest, Session } from '../types'

const session: Session = { email: 'javier@example.com', token: 'not-used', expiresAt: Date.now(), uuid: '{me}', displayName: 'Javier Mejías' }
const pr: PullRequest = {
  id: 12,
  title: 'Add review context',
  state: 'OPEN',
  created_on: '2026-09-14T10:00:00Z',
  updated_on: '2026-09-14T12:00:00Z',
  author: { uuid: '{author}', display_name: 'Carlo Osores Salgado' },
  source: { branch: { name: 'feature/context' }, repository: { full_name: 'kontroller_test/carlo-kontroller_test', links: { html: { href: 'https://bitbucket.org/kontroller_test/carlo-kontroller_test' } } } },
  destination: { branch: { name: 'peru' }, repository: { full_name: 'kontroller_test/kontroller_test', links: { html: { href: 'https://bitbucket.org/kontroller_test/kontroller_test' } } } },
  links: { html: { href: 'https://bitbucket.org/kontroller_test/kontroller_test/pull-requests/12' } },
  repo: { workspace: 'kontroller_test', repo: 'kontroller_test' },
}

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() })
})

describe('ReviewContext', () => {
  it('builds a derived context with review state and detail data', () => {
    const context = buildReviewContext(pr, session, {
      commits: [{ hash: 'abcdef123456789', message: 'Add context', author: 'Carlo', date: '2026-09-14T11:00:00Z' }],
      changedFiles: [{ path: 'src/lib/reviewContext.ts', status: 'modified', additions: 40, deletions: 2 }],
      diffstat: { files: 1, additions: 40, deletions: 2, totalChanges: 42 },
      comments: [{ author: 'Javier', date: '2026-09-14T11:30:00Z', content: 'Please add tests.', path: 'src/lib/reviewContext.ts', line: 10 }],
      activity: [{ pull_request: { id: 12 }, update: { date: '2026-09-14T12:00:00Z', author: { display_name: 'Carlo' }, state: 'OPEN' } }],
      unavailable: [],
    })

    expect(context.schemaVersion).toBe(2)
    expect(context.pullRequest.sourceBranch).toBe('feature/context')
    expect(context.reviewState.isNew).toBe(true)
    expect(context.commits[0].hash).toBe('abcdef123456789')
    expect(context.diffstat.totalChanges).toBe(42)
    expect(context.comments[0].content).toBe('Please add tests.')
    expect(context.activity[context.activity.length - 1]?.type).toBe('updated')
  })

  it('generates readable Markdown and valid JSON without secrets', () => {
    const context = buildReviewContext(pr, session, { commits: [], changedFiles: [], diffstat: { files: 0, additions: 0, deletions: 0, totalChanges: 0 }, comments: [], activity: [], unavailable: ['commits'] })
    const markdown = buildReviewContextMarkdown(context)
    const json = buildReviewContextJson(context)

    expect(markdown).toContain('# Pull Request')
    expect(markdown).toContain('## Review state')
    expect(markdown).toContain('No fue posible obtener commits')
    expect(json).toContain('"schemaVersion": 2')
    expect(json).not.toContain(session.token)
  })

  it('pairs replies to my comments after my latest review and tells Codex to verify them', () => {
    const reviewedPr = {
      ...pr,
      updated_on: '2026-09-14T12:30:00Z',
      activity: [
        { pull_request: { id: 12 }, comment: { id: 10, created_on: '2026-09-14T11:30:00Z', user: { uuid: '{me}' } } },
        { pull_request: { id: 12 }, comment: { id: 11, parent: { id: 10 }, created_on: '2026-09-14T12:30:00Z', user: { uuid: '{author}' } } },
      ],
    }
    const context = buildReviewContext(reviewedPr, session, {
      commits: [],
      changedFiles: [],
      diffstat: { files: 0, additions: 0, deletions: 0, totalChanges: 0 },
      comments: [
        { id: 10, authorUuid: '{me}', author: 'Javier Mejías', date: '2026-09-14T11:30:00Z', content: 'Please add validation.' },
        { id: 11, parentId: 10, authorUuid: '{author}', author: 'Carlo Osores Salgado', date: '2026-09-14T12:30:00Z', content: 'Added the validation.' },
        { id: 12, parentId: 10, authorUuid: '{author}', author: 'Carlo Osores Salgado', date: '2026-09-14T11:20:00Z', content: 'Older reply.' },
        { id: 13, authorUuid: '{other}', author: 'Another reviewer', date: '2026-09-14T11:00:00Z', content: 'A separate comment.' },
        { id: 14, parentId: 13, authorUuid: '{author}', author: 'Carlo Osores Salgado', date: '2026-09-14T12:40:00Z', content: 'Unrelated reply.' },
      ],
      activity: reviewedPr.activity || [],
      unavailable: [],
    })
    const markdown = buildReviewContextMarkdown(context)
    const prompt = buildCodexPreparation(context)
    const pendingReplySection = markdown.split('## Respuestas a tus comentarios posteriores a la última revisión registrada')[1]?.split('## Relevant activity')[0] || ''

    expect(context.reviewState.reviewDate).toBe('2026-09-14T11:30:00Z')
    expect(context.pendingCommentReplies).toHaveLength(1)
    expect(pendingReplySection).toContain('Please add validation.')
    expect(pendingReplySection).toContain('Added the validation.')
    expect(pendingReplySection).not.toContain('Older reply.')
    expect(pendingReplySection).not.toContain('Unrelated reply.')
    expect(prompt).toContain('compara cada respuesta con el comentario original')
  })

  it('includes applicable rules and prepares a readable Codex prompt', () => {
    const rule = getAvailableRules()[0]
    const context = buildReviewContext(pr, session, { commits: [], changedFiles: [], diffstat: { files: 0, additions: 0, deletions: 0, totalChanges: 0 }, comments: [], activity: [], unavailable: [] }, [], [rule])
    expect(context.rules[0].reference).toBe(rule.reference)
    expect(buildApplicableRulesMarkdown(context)).toContain(rule.name)
    expect(buildCodexPreparation(context)).toContain('# Instrucciones para Codex')
    expect(buildCodexPreparation(context)).toContain('# Pull Request')
  })

  it('generates a self-contained repository configuration with full rule content', () => {
    const rule = getAvailableRules()[0]
    const repository = { workspace: 'kontroller_test', repo: 'kontroller_test', technologies: [{ id: 'ruby', name: 'Ruby', version: '2.4.3', kind: 'language' as const }] }
    const configuration = buildRepositoryCodexConfiguration(repository, [{ ...rule, reference: rule.reference }])
    expect(configuration).toContain('# Configuración de revisión para Codex')
    expect(configuration).toContain('Ruby 2.4.3')
    expect(configuration).toContain(rule.reference)
    expect(configuration).toContain(rule.content)
    expect(configuration).toContain('Trata cada regla como una instrucción explícita')
  })
})
