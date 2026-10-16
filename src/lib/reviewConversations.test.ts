import { describe, expect, it } from 'vitest'
import { associateCommentCommits, groupReviewConversations } from './reviewConversations'
import type { ReviewContextComment } from '../types'

const at = (hour: number) => `2026-10-16T${String(hour).padStart(2, '0')}:00:00Z`
const comment = (id: number, parentId?: number): ReviewContextComment => ({ id, parentId, content: `Comment ${id}`, createdAt: at(id) })

describe('review conversations', () => {
  it('keeps interleaved replies with their original observation, including nested replies', () => {
    const threads = groupReviewConversations([comment(4, 1), comment(2), comment(5, 4), comment(1), comment(3, 2)])
    expect(threads.map((thread) => thread.comments.map((item) => item.id))).toEqual([[1, 4, 5], [2, 3]])
    expect(threads.every((thread) => !thread.incomplete)).toBe(true)
  })

  it('keeps replies with a deleted parent and marks missing parents explicitly', () => {
    const threads = groupReviewConversations([{ ...comment(1), deleted: true, content: '[Comentario eliminado]' }, comment(2, 1), comment(3, 99)])
    expect(threads[0].comments[0].deleted).toBe(true)
    expect(threads[1]).toMatchObject({ rootId: 99, incomplete: true })
  })

  it('terminates cycles without losing comments', () => {
    const threads = groupReviewConversations([comment(1, 2), comment(2, 3), comment(3, 2)])
    expect(threads).toHaveLength(1)
    expect(threads[0].incomplete).toBe(true)
    expect(threads[0].comments).toHaveLength(3)
  })

  it('preserves comments without IDs as separate conversations', () => {
    expect(groupReviewConversations([{ content: 'First' }, { content: 'Second' }])).toHaveLength(2)
  })

  it('uses original creation time for an inferred commit, not the edit time', () => {
    const [result] = associateCommentCommits([{ ...comment(1), createdAt: at(11), updatedAt: at(15), date: at(15) }], [
      { update: { date: at(10), source: { commit: { hash: 'before-comment' } } } },
      { update: { date: at(14), source: { commit: { hash: 'after-comment' } } } },
    ], true)
    expect(result.commitReference).toMatchObject({ hash: 'before-comment', confidence: 'inferred', activityDate: at(10) })
  })

  it('does not invent a comment commit with incomplete, undated or ambiguous history', () => {
    const activity = [{ update: { date: at(10), source: { commit: { hash: 'a' } } } }]
    expect(associateCommentCommits([{ ...comment(1), createdAt: at(11) }], activity, false)[0].commitReference).toBeUndefined()
    expect(associateCommentCommits([{ content: 'No creation date', date: at(11) }], activity, true)[0].commitReference).toBeUndefined()
    expect(associateCommentCommits([{ ...comment(1), createdAt: at(11) }], [...activity, { update: { date: at(10), source: { commit: { hash: 'b' } } } }], true)[0].commitReference).toBeUndefined()
  })
})
