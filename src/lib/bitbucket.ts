import type { ActivityUser, BitbucketUser, LifecycleStatus, Participant, PrStats, PullRequest, PullRequestActivity, RepoConfig, ReviewerState, Session, ReviewContextComment, ReviewContextCommit, ReviewContextFile, ReviewContextDiffstat } from '../types'
const API = 'https://api.bitbucket.org/2.0'
const auth = (s: Session) => `Basic ${btoa(`${s.email}:${s.token}`)}`
async function request<T>(url: string, session: Session): Promise<T> { const response = await fetch(url, { headers: { Authorization: auth(session), Accept: 'application/json' } }); if (!response.ok) throw new Error(response.status === 401 ? 'Credenciales inválidas o expiradas.' : `Bitbucket respondió ${response.status}.`); return response.json() as Promise<T> }
export const verifyUser = (session: Session) => request<BitbucketUser>(`${API}/user`, session)
type Page<T> = { values: T[]; next?: string }
async function allPages<T>(url: string, session: Session, limit = 6) { const items: T[] = []; let next: string | undefined = url; for (let page = 0; next && page < limit; page++) { const result: Page<T> = await request<Page<T>>(next, session); items.push(...(result.values || [])); next = result.next } return items }
export async function getPullRequests(repo: RepoConfig, session: Session) { const base = `${API}/repositories/${encodeURIComponent(repo.workspace)}/${encodeURIComponent(repo.repo)}/pullrequests`; const states = ['OPEN', 'MERGED', 'DECLINED']; const [results, activity] = await Promise.all([Promise.all(states.map((state) => allPages<Omit<PullRequest, 'repo'>>(`${base}?state=${state}&pagelen=50&fields=values.id,values.title,values.description,values.state,values.draft,values.queued,values.created_on,values.updated_on,values.author,values.source.branch,values.source.repository.full_name,values.source.repository.links.html,values.destination.branch,values.destination.repository.full_name,values.links.html,values.comment_count,values.participants,next`, session))), allPages<PullRequestActivity>(`${base}/activity?pagelen=50&fields=values.pull_request.id,values.comment.created_on,values.comment.updated_on,values.comment.deleted,values.comment.user.uuid,values.comment.user.display_name,values.approval.date,values.approval.user.uuid,values.approval.user.display_name,values.update.date,values.update.author.uuid,values.update.author.display_name,values.update.state,next`, session)]); const activityByPullRequest = new Map<number, PullRequestActivity[]>(); activity.forEach((item) => { const id = item.pull_request?.id; if (!id) return; activityByPullRequest.set(id, [...(activityByPullRequest.get(id) || []), item]) }); return results.flat().map((pr) => ({ ...pr, activity: activityByPullRequest.get(pr.id) || [], repo })) }
export const getLifecycleStatus = (pr: PullRequest): LifecycleStatus => { if (pr.state === 'MERGED') return 'MERGED'; if (pr.state === 'DECLINED') return 'DECLINED'; if (pr.queued) return 'QUEUED'; if (pr.draft) return 'DRAFT'; return 'OPEN' }
const normalizeName = (name?: string) => name?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim()
const matchesActivityUser = (user: ActivityUser | undefined, participant: Participant) => participant.user?.uuid ? user?.uuid === participant.user.uuid : normalizeName(user?.display_name) === normalizeName(participant.user?.display_name)
function latestReviewDate(pr: PullRequest, matchesUser: (user?: ActivityUser) => boolean) { const dates = [...(pr.participants || []).filter((participant) => matchesUser(participant.user)).map((participant) => participant.participated_on), ...(pr.activity || []).flatMap((item) => { if (item.comment && !item.comment.deleted && matchesUser(item.comment.user)) return [item.comment.updated_on || item.comment.created_on]; if (item.approval && matchesUser(item.approval.user)) return [item.approval.date]; return [] })].filter((date): date is string => Boolean(date)); return dates.sort((first, second) => new Date(second).getTime() - new Date(first).getTime())[0] }
const hasNewActivityAfter = (pr: PullRequest, reviewDate?: string, matchesUser?: (user?: ActivityUser) => boolean) => { if (!reviewDate) return false; const reviewTimestamp = new Date(reviewDate).getTime(); const updates = (pr.activity || []).filter((item) => item.update?.date); if (updates.length) return updates.some((item) => new Date(item.update!.date!).getTime() > reviewTimestamp && !matchesUser?.(item.update?.author)); const postReviewReviewActivity = (pr.activity || []).some((item) => { const date = item.comment?.updated_on || item.comment?.created_on || item.approval?.date; return Boolean(date && new Date(date).getTime() > reviewTimestamp && (item.comment || item.approval)) }); if (postReviewReviewActivity) return false; const latestReviewerActivity = matchesUser ? latestReviewDate(pr, matchesUser) : undefined; if (latestReviewerActivity && new Date(latestReviewerActivity).getTime() >= new Date(pr.updated_on).getTime()) return false; return new Date(pr.updated_on).getTime() > reviewTimestamp }
export function getReviewerState(pr: PullRequest, displayName: string, uuid?: string): ReviewerState | null { const matchesUser = (user?: ActivityUser) => Boolean((uuid && user?.uuid === uuid) || normalizeName(user?.display_name) === normalizeName(displayName)); const participant = pr.participants?.find((item) => matchesUser(item.user)); const reviewDate = latestReviewDate(pr, matchesUser); if (!reviewDate) return null; if (hasNewActivityAfter(pr, reviewDate, matchesUser)) return 'changes'; if (participant?.state === 'changes_requested') return 'waiting'; if (participant?.approved) return 'approved'; return 'reviewed' }
export const isFreshPullRequest = (pr: PullRequest) => { const hasParticipantReview = pr.participants?.some((participant) => Boolean(participant.participated_on || participant.approved || participant.state)); const hasReviewActivity = pr.activity?.some((item) => !item.comment?.deleted && Boolean(item.comment || item.approval)); return !hasParticipantReview && !hasReviewActivity }
export const classifyPr = (pr: PullRequest, myUuid?: string) => { if (pr.state === 'MERGED') return 'merged' as const; if (pr.state === 'DECLINED') return 'declined' as const; const waitingForDeveloper = pr.participants?.some((participant) => participant.state === 'changes_requested' && !hasNewActivityAfter(pr, latestReviewDate(pr, (user) => matchesActivityUser(user, participant)), (user) => matchesActivityUser(user, participant))); if (waitingForDeveloper) return 'waiting' as const; if (!myUuid) return 'unreviewed' as const; const participant: Participant | undefined = pr.participants?.find((item) => item.user?.uuid === myUuid); const matchesUser = (user?: ActivityUser) => user?.uuid === myUuid; const reviewDate = latestReviewDate(pr, matchesUser); if (!reviewDate) return 'unreviewed' as const; if (hasNewActivityAfter(pr, reviewDate, matchesUser)) return 'changes' as const; if (participant?.state === 'changes_requested') return 'waiting' as const; return 'current' as const }
export async function getStats(pr: PullRequest, session: Session): Promise<PrStats> { const base = `${API}/repositories/${encodeURIComponent(pr.repo.workspace)}/${encodeURIComponent(pr.repo.repo)}/pullrequests/${pr.id}`; const [commits, diff] = await Promise.all([allPages<unknown>(`${base}/commits?pagelen=50`, session), allPages<{ lines_added?: number; lines_removed?: number }>(`${base}/diffstat?pagelen=50`, session)]); return { commits: commits.length, files: diff.length, added: diff.reduce((sum, item) => sum + (item.lines_added || 0), 0), removed: diff.reduce((sum, item) => sum + (item.lines_removed || 0), 0) } }

type BitbucketCommit = { hash?: string; message?: string; author?: { raw?: string }; date?: string; links?: { html?: { href?: string } } }
type BitbucketDiffstat = { lines_added?: number; lines_removed?: number; status?: string; new?: { path?: string; type?: string }; old?: { path?: string; type?: string } }
type BitbucketComment = { content?: { raw?: string }; user?: ActivityUser; created_on?: string; updated_on?: string; inline?: { to?: number; from?: number; path?: string }; links?: { html?: { href?: string } } }
export type ReviewContextDetails = { commits: ReviewContextCommit[]; changedFiles: ReviewContextFile[]; comments: ReviewContextComment[]; diffstat: ReviewContextDiffstat; activity: PullRequestActivity[]; unavailable: string[] }

const reviewContextFields = {
  commits: 'values.hash,values.message,values.author.raw,values.date,values.links.html.href,next',
  files: 'values.lines_added,values.lines_removed,values.status,values.new.path,values.new.type,values.old.path,values.old.type,next',
  comments: 'values.content.raw,values.user.uuid,values.user.display_name,values.created_on,values.updated_on,values.inline,values.links.html.href,next',
  activity: 'values.pull_request.id,values.comment.created_on,values.comment.updated_on,values.comment.deleted,values.comment.user.uuid,values.comment.user.display_name,values.approval.date,values.approval.user.uuid,values.approval.user.display_name,values.update.date,values.update.author.uuid,values.update.author.display_name,values.update.state,next',
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
