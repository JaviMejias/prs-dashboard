import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ReviewConversationScope from './ReviewConversationScope'
import { buildReviewContext } from '../lib/reviewContext'
import type { ReviewContextComment } from '../types'

const comments: ReviewContextComment[] = [
  { id: 1, authorUuid: '{qa}', date: '2026-10-18T10:00:00Z', content: 'Earlier observation' },
  { id: 2, authorUuid: '{qa}', date: '2026-10-19T10:00:00Z', content: 'Latest observation' },
]
const contextWith = (values: ReviewContextComment[], unavailable: string[] = []) => buildReviewContext(
  { id: 1, title: 'Fixture', state: 'OPEN', created_on: '2026-10-18T00:00:00Z', updated_on: '2026-10-19T10:00:00Z', repo: { workspace: 'team', repo: 'app' } },
  { uuid: '{qa}', email: 'qa@example.com', token: 'unused', expiresAt: 0 },
  { comments: values, unavailable, activity: [], commits: [], changedFiles: [], diffstat: { files: 0, additions: 0, deletions: 0, totalChanges: 0 } },
)
const noop = () => undefined

describe('ReviewConversationScope', () => {
  it('explains the two uses without pretending a chat or comment count is known', () => {
    const html = renderToStaticMarkup(<ReviewConversationScope scope="recent" onChange={noop} context={null} />)
    for (const text of ['Últimos comentarios', 'Continuar este PR en el mismo chat', 'Todo el historial', 'Nuevo chat o recuperar antecedentes de este PR', 'siempre se revisa todo el diff']) expect(html).toContain(text)
    expect(html.match(/type="radio"/g)).toHaveLength(2)
    expect(html).not.toContain('No se recibieron comentarios')
  })

  it('does not offer identical choices for successfully loaded empty or single-round comments', () => {
    for (const context of [contextWith([]), contextWith(comments.slice(-1))]) {
      const html = renderToStaticMarkup(<ReviewConversationScope scope="all" onChange={noop} context={context} />)
      expect(html).not.toContain('type="radio"')
      expect(html).toContain('Conversaciones para la guía')
    }
  })

  it('keeps the native choice and failure warning when comments cannot be loaded', () => {
    const html = renderToStaticMarkup(<ReviewConversationScope scope="recent" onChange={noop} context={contextWith([], ['comments'])} disabled />)
    expect(html.match(/type="radio"/g)).toHaveLength(2)
    expect(html).toContain('No se pudieron cargar los comentarios')
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('No se recibieron comentarios de Bitbucket.')
  })

  it('offers a real choice with omission counts when the recent selection differs', () => {
    const html = renderToStaticMarkup(<ReviewConversationScope scope="recent" onChange={noop} context={contextWith(comments)} />)
    expect(html.match(/type="radio"/g)).toHaveLength(2)
    expect(html).toContain('1 de 2 comentarios incluidos')
    expect(html).toContain('Omitir no significa resolver')
  })
})
