import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canChooseReviewConversationScope, reviewConversationSummary, selectReviewConversations } from './reviewConversations'
import { buildCodexPreparation, buildReviewContext, buildReviewContextJson, buildReviewContextMarkdown } from './reviewContext'
import { emptyProjectProfile } from './projectPreparation'
import type { ReviewContextComment } from '../types'

beforeEach(() => vi.stubGlobal('localStorage', { getItem: () => null }))
const comment = (id: number, date: string, overrides: Partial<ReviewContextComment> = {}): ReviewContextComment => ({ id, authorUuid: '{qa}', author: 'Javier Mejías', date, createdAt: date, content: `OBSERVATION-${id}`, ...overrides })
const rounds = [
  comment(1, '2026-10-13T19:29:00Z'), comment(2, '2026-10-15T12:47:00Z'),
  comment(3, '2026-10-19T14:59:00Z'), comment(4, '2026-10-19T17:45:00Z'),
  comment(5, '2026-10-19T19:05:00Z'), comment(6, '2026-10-19T19:29:00Z'),
]
const makeContext = (comments = rounds) => buildReviewContext({
  id: 12, title: 'Synthetic QA round', state: 'OPEN', created_on: '2026-10-01T00:00:00Z', updated_on: '2026-10-19T20:00:00Z',
  author: { uuid: '{dev}', display_name: 'Developer' },
  repo: { workspace: 'team', repo: 'app', profile: { ...emptyProjectProfile(), summary: 'PROJECT-PROFILE' } },
}, { uuid: '{qa}', displayName: 'Javier Mejías', email: 'qa@example.com', token: 'unused', expiresAt: 0 }, {
  commits: [], changedFiles: [], diffstat: { files: 0, additions: 0, deletions: 0, totalChanges: 0 }, comments, activity: [], unavailable: [],
})
const ids = (comments: ReviewContextComment[]) => comments.map((item) => item.id)

describe('Review conversation selection', () => {
  it('offers the choice while data is unknown or unavailable, but not for successfully loaded empty comments', () => {
    expect(canChooseReviewConversationScope(null)).toBe(true)
    expect(canChooseReviewConversationScope({ ...makeContext([]), unavailable: ['comments'] })).toBe(true)
    expect(canChooseReviewConversationScope(makeContext([]))).toBe(false)
    expect(canChooseReviewConversationScope(makeContext())).toBe(true)
  })

  it('hides equivalent selections and generates identical guides for a single round', () => {
    const context = makeContext(rounds.slice(-1))
    expect(canChooseReviewConversationScope(context)).toBe(false)
    expect(reviewConversationSummary(context, 'recent')).toEqual(reviewConversationSummary(context, 'all'))
    expect(buildCodexPreparation(context, { commentScope: 'recent' })).toBe(buildCodexPreparation(context, { commentScope: 'all' }))
    expect(reviewConversationSummary(context).join('\n')).toContain('1 de 1 comentarios incluidos')
  })

  it('hides equivalent selections when a complete active thread includes every comment', () => {
    const context = makeContext([rounds[0], rounds[5], comment(7, '2026-10-19T19:30:00Z', { parentId: 1, authorUuid: '{dev}' })])
    expect(canChooseReviewConversationScope(context)).toBe(false)
    expect(selectReviewConversations(context).omittedCount).toBe(0)
    expect(buildCodexPreparation(context, { commentScope: 'recent' })).toBe(buildCodexPreparation(context, { commentScope: 'all' }))
  })

  it('retains the fallback warning without offering identical history choices', () => {
    const context = { ...makeContext(), reviewer: undefined }
    expect(canChooseReviewConversationScope(context)).toBe(false)
    expect(reviewConversationSummary(context, 'recent')).toEqual(reviewConversationSummary(context, 'all'))
    expect(reviewConversationSummary(context).join('\n')).toContain('No se pudo delimitar una ronda')
  })

  it('reduces the empty conversation section to one honest sentence in both guides', () => {
    const context = makeContext([])
    for (const scope of ['recent', 'all'] as const) {
      expect(reviewConversationSummary(context, scope)).toEqual(['No se recibieron comentarios de Bitbucket.'])
      const section = buildCodexPreparation(context, { commentScope: scope }).split('## Conversaciones de Bitbucket\n')[1].split('\n\n## Entrega')[0]
      expect(section).toBe('No se recibieron comentarios de Bitbucket.')
    }
    expect(buildCodexPreparation(context, { commentScope: 'recent' })).toBe(buildCodexPreparation(context, { commentScope: 'all' }))
    const failed = { ...context, unavailable: ['comments'] }
    expect(reviewConversationSummary(failed).join('\n')).toContain('No se pudieron cargar')
    expect(buildCodexPreparation(failed)).not.toContain('No se recibieron comentarios de Bitbucket.')
  })

  it('selects the latest of six rounds without assuming the five omitted rounds are resolved', () => {
    const context = makeContext()
    const selected = selectReviewConversations(context)
    expect(ids(selected.comments)).toEqual([6])
    expect(selected.omittedCount).toBe(5)
    expect(reviewConversationSummary(context).join('\n')).toContain('Omitir no significa resolver')
    expect(ids(selectReviewConversations(context, 'all').comments)).toEqual([1, 2, 3, 4, 5, 6])
    expect(context.comments).toHaveLength(6)
  })

  it('groups nearby observations relative to the latest, not a chaining window or entire day', () => {
    const context = makeContext([comment(1, '2026-10-19T19:20:00Z'), comment(2, '2026-10-19T19:24:00Z'), comment(3, '2026-10-19T19:29:00Z')])
    expect(ids(selectReviewConversations(context).comments)).toEqual([2, 3])
  })

  it('retains an old original, nested and sibling replies when the author replies again', () => {
    const context = makeContext([...rounds,
      comment(7, '2026-10-15T13:00:00Z', { parentId: 1, authorUuid: '{dev}' }),
      comment(8, '2026-10-19T19:30:00Z', { parentId: 7, authorUuid: '{dev}' }),
      comment(9, '2026-10-15T14:00:00Z', { parentId: 1, authorUuid: '{other}' }),
    ])
    const result = selectReviewConversations(context)
    expect(ids(result.comments)).toEqual([1, 6, 7, 8, 9])
    expect(reviewConversationSummary(context).join('\n')).toContain('2 respuestas vinculadas')
    const prompt = buildCodexPreparation(context)
    for (const item of result.comments) expect(prompt.split(item.content)).toHaveLength(2)
    expect(prompt).toContain('respuesta a #7')
  })

  it('keeps undated comments and orphans conservatively and terminates on cyclic threads', () => {
    const context = makeContext([...rounds,
      comment(7, '', { authorUuid: '{other}', parentId: 1 }),
      comment(8, '2026-10-10T00:00:00Z', { authorUuid: '{other}', parentId: 999 }),
      comment(9, '', { parentId: 10, authorUuid: '{other}' }),
      comment(10, '2026-10-10T00:00:00Z', { parentId: 9, authorUuid: '{other}' }),
    ])
    expect(ids(selectReviewConversations(context).comments)).toEqual([1, 6, 7, 8, 9, 10])
  })

  it.each([undefined, { uuid: '{unknown}' }])('falls back to full history without a reliable reviewer anchor: %j', (reviewer) => {
    const context = { ...makeContext(), reviewer }
    expect(selectReviewConversations(context)).toMatchObject({ fallback: true, omittedCount: 0 })
    expect(reviewConversationSummary(context).join('\n')).toContain('se incluye todo el historial')
  })

  it.each(['', 'invalid'])('falls back to full history when an own root creation date is missing: %s', (date) => {
    const context = makeContext([...rounds, comment(7, date)])
    expect(selectReviewConversations(context)).toMatchObject({ fallback: true, omittedCount: 0 })
  })

  it('does not mistake an edit to an old comment for the latest review round', () => {
    const context = makeContext([{ ...rounds[0], date: '2026-10-19T21:00:00Z' }, ...rounds.slice(1)])
    const selected = selectReviewConversations(context)
    expect(selected.roundStart).toBe(Date.parse(rounds[5].createdAt!))
    expect(ids(selected.comments)).toEqual([1, 6])
  })

  it('prioritizes UUIDs over matching names and supports older name-only identities', () => {
    const context = makeContext([...rounds, comment(7, '2026-10-19T23:00:00Z', { authorUuid: '{impostor}' })])
    expect(selectReviewConversations(context).roundStart).toBe(Date.parse(rounds[5].date!))
    const legacy = { ...makeContext(), reviewer: { name: 'javier mejias' } }
    expect(ids(selectReviewConversations(legacy).comments)).toEqual([6])
  })

  it('distinguishes no received author replies from missing comments or author identity', () => {
    const context = makeContext()
    expect(reviewConversationSummary(context).join('\n')).toContain('0 incluidas de 0 recibidas')
    expect(reviewConversationSummary(context).join('\n')).toContain('no prueba que el autor no haya respondido')
    expect(reviewConversationSummary({ ...context, unavailable: ['comments'] }).join('\n')).not.toContain('0 recibidas')
    expect(reviewConversationSummary({ ...context, pullRequest: { ...context.pullRequest, author: undefined } }).join('\n')).toContain('Identidad del autor no disponible')
  })

  it('keeps full project content independent of conversation scope and technical exports intact', () => {
    const context = makeContext()
    for (const mode of ['compact', 'full'] as const) {
      const recent = buildCodexPreparation(context, { mode })
      expect(recent).not.toContain('OBSERVATION-1')
      expect(recent.split('OBSERVATION-6')).toHaveLength(2)
      expect(recent.includes('PROJECT-PROFILE')).toBe(mode === 'full')
      const fullHistory = buildCodexPreparation(context, { mode, commentScope: 'all' })
      for (const item of rounds) expect(fullHistory.split(item.content)).toHaveLength(2)
    }
    for (const item of rounds) {
      expect(buildReviewContextJson(context)).toContain(item.content)
      expect(buildReviewContextMarkdown(context)).toContain(item.content)
    }
  })

  it.each([undefined, '', '  \n\t', '\u200c\u200d\u200b\ufeff\u2060\n'])('recognizes visually empty descriptions in both text exports: %j', (description) => {
    const context = makeContext([])
    context.pullRequest.description = description
    expect(buildCodexPreparation(context)).toContain('> Sin descripción en Bitbucket.')
    expect(buildReviewContextMarkdown(context)).toContain('> Sin descripción en Bitbucket.')
  })

  it('preserves meaningful Unicode description text, including emoji joiners', () => {
    const context = makeContext([])
    context.pullRequest.description = '  Revisar 👩‍💻 العربية\u200c  '
    expect(buildCodexPreparation(context)).toContain('> Revisar 👩‍💻 العربية\u200c')
  })

  it('keeps legacy rulepack content in the full project guide without duplicating comments', () => {
    const context = makeContext()
    context.rulepacks = [{ id: 'legacy', name: 'Legacy', version: '1', description: '', source: 'git', reviewRules: 'review.md', reviewRulesContent: 'LEGACY-RULE-CONTENT', testingContent: 'TESTING-CONTENT', referenceContents: [{ path: 'reference.md', content: 'REFERENCE-CONTENT' }] }]
    const prompt = buildCodexPreparation(context, { mode: 'full' })
    for (const value of ['LEGACY-RULE-CONTENT', 'TESTING-CONTENT', 'REFERENCE-CONTENT', 'OBSERVATION-6']) expect(prompt.split(value)).toHaveLength(2)
    expect(prompt).not.toContain('OBSERVATION-1')
  })

  it('uses captured project preferences rather than a later global edit in a full guide', () => {
    const context = makeContext()
    context.repository.personalPreferences = { instructions: 'CAPTURED-PREFERENCES' }
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ schemaVersion: 1, repositories: [], customRules: [], personalPreferences: { instructions: 'LATER-EDIT' } }) })
    const prompt = buildCodexPreparation(context, { mode: 'full' })
    expect(prompt).toContain('CAPTURED-PREFERENCES')
    expect(prompt).not.toContain('LATER-EDIT')
  })
})
