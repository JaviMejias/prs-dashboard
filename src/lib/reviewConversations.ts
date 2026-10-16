import type { PullRequestActivity, ReviewContextComment, ReviewContextThread } from '../types'

const timestamp = (value?: string) => value ? new Date(value).getTime() : NaN
const compareComments = (a: ReviewContextComment, b: ReviewContextComment) => (timestamp(a.createdAt || a.date) - timestamp(b.createdAt || b.date) || 0) || (a.id || 0) - (b.id || 0)

export function associateCommentCommits(comments: ReviewContextComment[], activity: PullRequestActivity[], complete: boolean): ReviewContextComment[] {
  const updates = activity.flatMap((item) => item.update?.date && item.update.source?.commit?.hash ? [{ date: item.update.date, hash: item.update.source.commit.hash }] : [])
    .sort((a, b) => timestamp(a.date) - timestamp(b.date))
  return comments.map((comment) => {
    if (!complete || !comment.createdAt) return comment
    const preceding = updates.filter((update) => timestamp(update.date) <= timestamp(comment.createdAt))
    const latest = preceding[preceding.length - 1]
    if (!latest || preceding.some((update) => timestamp(update.date) === timestamp(latest.date) && update.hash !== latest.hash)) return comment
    return { ...comment, commitReference: { hash: latest.hash, confidence: 'inferred', activityDate: latest.date } }
  })
}

export function groupReviewConversations(comments: ReviewContextComment[]): ReviewContextThread[] {
  const byId = new Map(comments.filter((comment) => comment.id !== undefined).map((comment) => [comment.id!, comment]))
  const threads = new Map<string, ReviewContextThread>()
  comments.forEach((comment, index) => {
    let current = comment
    const visited = new Map<number, number>()
    const path: number[] = []
    let rootId = current.id
    let incomplete = false
    while (current.parentId !== undefined) {
      if (current.id !== undefined) {
        const cycleStart = visited.get(current.id)
        if (cycleStart !== undefined) {
          rootId = Math.min(...path.slice(cycleStart))
          incomplete = true
          break
        }
        visited.set(current.id, path.length)
        path.push(current.id)
      }
      rootId = current.parentId
      const parent = byId.get(current.parentId)
      if (!parent) { incomplete = true; break }
      current = parent
    }
    const key = rootId !== undefined ? `id:${rootId}` : `anonymous:${index}`
    const thread = threads.get(key) || { rootId, incomplete, comments: [] }
    thread.incomplete ||= incomplete
    thread.comments.push(comment)
    threads.set(key, thread)
  })
  return [...threads.values()].map((thread) => ({ ...thread, comments: thread.comments.sort(compareComments) }))
    .sort((a, b) => compareComments(a.comments[0], b.comments[0]))
}
