import type { ActivityUser, BitbucketUser, PrStats, PullRequest, PullRequestActivity, RepoConfig, ReviewContextComment, ReviewContextCommit, ReviewContextFile, ReviewContextDiffstat, ReviewHistoryPullRequest, Session } from '../types'
export { classifyPr, getLifecycleStatus, getReviewDecision, getReviewerState, isFreshPullRequest } from './pullRequestReviewState'
const API = 'https://api.bitbucket.org/2.0'
const auth = (s: Session) => `Basic ${btoa(`${s.email}:${s.token}`)}`
async function request<T>(url: string, session: Session): Promise<T> { const response = await fetch(url, { headers: { Authorization: auth(session), Accept: 'application/json' } }); if (!response.ok) throw new Error(response.status === 401 ? 'Credenciales inválidas o expiradas.' : `Bitbucket respondió ${response.status}.`); return response.json() as Promise<T> }
export const verifyUser = (session: Session) => request<BitbucketUser>(`${API}/user`, session)
type Page<T> = { values: T[]; next?: string }
async function allPages<T>(url: string, session: Session, limit = 6) { const items: T[] = []; let next: string | undefined = url; for (let page = 0; next && page < limit; page++) { const result: Page<T> = await request<Page<T>>(next, session); items.push(...(result.values || [])); next = result.next } return items }
async function allPagesFully<T>(url: string, session: Session, limit = 100) {
  const items: T[] = []
  let next: string | undefined = url
  let page = 0
  while (next && page < limit) {
    const result: Page<T> = await request<Page<T>>(next, session)
    items.push(...(result.values || []))
    next = result.next
    page += 1
  }
  return { items, complete: !next }
}
const activityFields = 'values.pull_request.id,values.comment.id,values.comment.parent.id,values.comment.created_on,values.comment.updated_on,values.comment.deleted,values.comment.user.uuid,values.comment.user.display_name,values.approval.date,values.approval.user.uuid,values.approval.user.display_name,values.update.date,values.update.author.uuid,values.update.author.display_name,values.update.state,values.update.source.commit.hash,next'
const activityDate = (item: PullRequestActivity) => item.update?.date || item.comment?.updated_on || item.comment?.created_on || item.approval?.date
const activityTimestamp = (item: PullRequestActivity) => {
  const date = activityDate(item)
  return date ? new Date(date).getTime() : 0
}
const normalizedUserName = (name?: string) => name?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim()
const hasReviewHistorySignal = (pr: Omit<PullRequest, 'repo'>, session: Session) => (pr.participants || []).some((participant) => {
  if (participant.state === 'changes_requested') return true
  return Boolean(
    (session.uuid && participant.user?.uuid === session.uuid)
    || (session.displayName && normalizedUserName(participant.user?.display_name) === normalizedUserName(session.displayName)),
  )
})
export async function getPullRequests(repo: RepoConfig, session: Session) {
  const base = `${API}/repositories/${encodeURIComponent(repo.workspace)}/${encodeURIComponent(repo.repo)}/pullrequests`
  const states = ['OPEN', 'MERGED', 'DECLINED']
  const results = (await Promise.all(states.map((state) => allPages<Omit<PullRequest, 'repo'>>(`${base}?state=${state}&pagelen=50&fields=values.id,values.title,values.description,values.state,values.draft,values.queued,values.created_on,values.updated_on,values.author,values.source.branch,values.source.repository.full_name,values.source.repository.links.html,values.destination.branch,values.destination.repository.full_name,values.links.html,values.comment_count,values.participants,next`, session)))).flat()
  const activity = await allPages<PullRequestActivity>(`${base}/activity?pagelen=50&fields=${activityFields}`, session)
  const activityByPullRequest = new Map<number, PullRequestActivity[]>()
  activity.forEach((item) => {
    const id = item.pull_request?.id
    if (!id) return
    activityByPullRequest.set(id, [...(activityByPullRequest.get(id) || []), item])
  })

  const incompleteOpenPullRequests = results.filter((pr) => {
    if (pr.state !== 'OPEN' || !hasReviewHistorySignal(pr, session)) return false
    const currentActivity = activityByPullRequest.get(pr.id) || []
    const latestActivity = Math.max(0, ...currentActivity.map(activityTimestamp))
    const pullRequestUpdated = new Date(pr.updated_on).getTime()
    const hasUpdateAtLatestTimestamp = currentActivity.some((item) => item.update?.date && Math.abs(new Date(item.update.date).getTime() - pullRequestUpdated) < 10_000)
    return !currentActivity.length || pullRequestUpdated > latestActivity + 1_000 || !hasUpdateAtLatestTimestamp
  })
  const fallbackActivity = await Promise.all(incompleteOpenPullRequests.map((pr) => allPages<PullRequestActivity>(`${base}/${pr.id}/activity?pagelen=50&fields=${activityFields}`, session)))
  incompleteOpenPullRequests.forEach((pr, index) => activityByPullRequest.set(pr.id, fallbackActivity[index]))

  return results.map((pr) => ({ ...pr, activity: activityByPullRequest.get(pr.id) || [], repo }))
}
export async function getReviewHistorySnapshot(repo: RepoConfig, session: Session, knownPullRequests?: Record<string, Pick<ReviewHistoryPullRequest, 'updatedOn'>>) {
  const base = `${API}/repositories/${encodeURIComponent(repo.workspace)}/${encodeURIComponent(repo.repo)}/pullrequests`
  const states = ['OPEN', 'MERGED', 'DECLINED']
  const fields = 'values.id,values.title,values.description,values.state,values.draft,values.queued,values.created_on,values.updated_on,values.author,values.source.branch,values.source.repository.full_name,values.source.repository.links.html,values.destination.branch,values.destination.repository.full_name,values.links.html,values.comment_count,values.participants,next'
  const pullRequestPages = await Promise.all(states.map((state) => allPagesFully<Omit<PullRequest, 'repo'>>(`${base}?state=${state}&pagelen=50&fields=${fields}`, session)))
  const pullRequests = pullRequestPages.flatMap((page) => page.items).map((pr) => ({ ...pr, activity: [] as PullRequestActivity[], repo }))
  const changedPullRequests = knownPullRequests
    ? pullRequests.filter((pr) => knownPullRequests[String(pr.id)]?.updatedOn !== pr.updated_on)
    : pullRequests
  const activityByPullRequest = new Map<number, PullRequestActivity[]>()
  const activityComplete = knownPullRequests
    ? (await Promise.all(changedPullRequests.map((pr) => allPagesFully<PullRequestActivity>(`${base}/${pr.id}/activity?pagelen=50&fields=${activityFields}`, session)))).every((page, index) => {
      activityByPullRequest.set(changedPullRequests[index].id, page.items)
      return page.complete
    })
    : await allPagesFully<PullRequestActivity>(`${base}/activity?pagelen=50&fields=${activityFields}`, session).then((page) => {
      page.items.forEach((item) => {
        const id = item.pull_request?.id
        if (!id) return
        activityByPullRequest.set(id, [...(activityByPullRequest.get(id) || []), item])
      })
      return page.complete
    })
  return { prs: pullRequests.map((pr) => ({ ...pr, activity: activityByPullRequest.get(pr.id) || [] })), complete: pullRequestPages.every((page) => page.complete) && activityComplete }
}
export async function getStats(pr: PullRequest, session: Session): Promise<PrStats> { const base = `${API}/repositories/${encodeURIComponent(pr.repo.workspace)}/${encodeURIComponent(pr.repo.repo)}/pullrequests/${pr.id}`; const [commits, diff] = await Promise.all([allPages<unknown>(`${base}/commits?pagelen=50`, session), allPages<{ lines_added?: number; lines_removed?: number }>(`${base}/diffstat?pagelen=50`, session)]); return { commits: commits.length, files: diff.length, added: diff.reduce((sum, item) => sum + (item.lines_added || 0), 0), removed: diff.reduce((sum, item) => sum + (item.lines_removed || 0), 0) } }

type BitbucketCommit = { hash?: string; message?: string; author?: { raw?: string }; date?: string; links?: { html?: { href?: string } } }
type BitbucketDiffstat = { lines_added?: number; lines_removed?: number; status?: string; new?: { path?: string; type?: string }; old?: { path?: string; type?: string } }
type BitbucketComment = { id?: number; parent?: { id?: number }; content?: { raw?: string }; user?: ActivityUser; created_on?: string; updated_on?: string; deleted?: boolean; inline?: { to?: number; from?: number; path?: string }; links?: { html?: { href?: string } } }
export type ReviewContextDetails = { commits: ReviewContextCommit[]; changedFiles: ReviewContextFile[]; comments: ReviewContextComment[]; diffstat: ReviewContextDiffstat; activity: PullRequestActivity[]; unavailable: string[] }

const reviewContextFields = {
  commits: 'values.hash,values.message,values.author.raw,values.date,values.links.html.href,next',
  files: 'values.lines_added,values.lines_removed,values.status,values.new.path,values.new.type,values.old.path,values.old.type,next',
  comments: 'values.id,values.parent.id,values.content.raw,values.user.uuid,values.user.display_name,values.created_on,values.updated_on,values.deleted,values.inline,values.links.html.href,next',
  activity: 'values.pull_request.id,values.comment.id,values.comment.parent.id,values.comment.created_on,values.comment.updated_on,values.comment.deleted,values.comment.user.uuid,values.comment.user.display_name,values.approval.date,values.approval.user.uuid,values.approval.user.display_name,values.update.date,values.update.author.uuid,values.update.author.display_name,values.update.state,values.update.source.commit.hash,next',
} as const

const displayActivityUser = (user?: ActivityUser) => user?.display_name || undefined

export async function getReviewContextDetails(pr: PullRequest, session: Session): Promise<ReviewContextDetails> {
  const base = `${API}/repositories/${encodeURIComponent(pr.repo.workspace)}/${encodeURIComponent(pr.repo.repo)}/pullrequests/${pr.id}`
  const load = async <T>(url: string, label: string) => {
    try { return { value: await allPages<T>(url, session), error: undefined } }
    catch { return { value: [] as T[], error: label } }
  }
  const [commitsResult, filesResult, commentsResult, activityResult] = await Promise.all([
    load<BitbucketCommit>(`${base}/commits?pagelen=50&fields=${reviewContextFields.commits}`, 'commits'),
    load<BitbucketDiffstat>(`${base}/diffstat?pagelen=50&fields=${reviewContextFields.files}`, 'changed files'),
    load<BitbucketComment>(`${base}/comments?pagelen=50&fields=${reviewContextFields.comments}`, 'comments'),
    load<PullRequestActivity>(`${base}/activity?pagelen=50&fields=${reviewContextFields.activity}`, 'activity'),
  ])

  const comments = commentsResult.value.map((comment): ReviewContextComment => ({
    id: comment.id,
    parentId: comment.parent?.id,
    author: displayActivityUser(comment.user),
    date: comment.updated_on || comment.created_on,
    content: comment.content?.raw || '',
    path: comment.inline?.path,
    line: comment.inline?.to || comment.inline?.from,
    url: comment.links?.html?.href,
  })).filter((comment) => comment.content.length > 0)
  const files = filesResult.value.map((file): ReviewContextFile => ({
    path: file.new?.path || file.old?.path || 'Ruta desconocida',
    status: file.status,
    additions: file.lines_added,
    deletions: file.lines_removed,
    changeType: file.new?.type || file.old?.type,
  }))
  const commits = commitsResult.value.map((commit): ReviewContextCommit => ({
    hash: commit.hash || 'Hash desconocido',
    message: commit.message?.split('\n')[0] || 'Mensaje no disponible',
    author: commit.author?.raw,
    date: commit.date,
    url: commit.links?.html?.href,
  }))
  const unavailable = [commitsResult, filesResult, commentsResult, activityResult]
    .map((result) => result.error)
    .filter((label): label is string => Boolean(label))
  const additions = files.reduce((total, file) => total + (file.additions || 0), 0)
  const deletions = files.reduce((total, file) => total + (file.deletions || 0), 0)
  return { commits, changedFiles: files, comments, diffstat: { files: files.length, additions, deletions, totalChanges: additions + deletions }, activity: activityResult.value, unavailable }
}
