import type { ActivityUser, BitbucketUser, PrStats, PullRequest, PullRequestActivity, PullRequestQueueSnapshot, RepoConfig, ReviewContextComment, ReviewContextCommit, ReviewContextFile, ReviewContextDiffstat, ReviewHistoryPullRequest, Session } from '../types'
import { associateCommentCommits } from './reviewConversations'
export { classifyPr, getLifecycleStatus, getReviewDecision, getReviewerState, isFreshPullRequest } from './pullRequestReviewState'
const API = 'https://api.bitbucket.org/2.0'
const auth = (s: Session) => `Basic ${btoa(`${s.email}:${s.token}`)}`
export const BITBUCKET_REQUEST_TIMEOUT_MS = 25_000
async function request<T>(url: string, session: Session): Promise<T> {
  if (new URL(url).origin !== new URL(API).origin) throw new Error('Bitbucket devolvió una URL de paginación inesperada.')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), BITBUCKET_REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Authorization: auth(session), Accept: 'application/json' } })
    if (!response.ok) throw new Error(response.status === 401 ? 'Credenciales inválidas o expiradas. Vuelve a conectar tu cuenta.' : response.status === 403 ? 'Tu cuenta no tiene permiso para consultar estos datos.' : response.status === 429 ? 'Bitbucket limitó las consultas. Intenta nuevamente en unos minutos.' : `Bitbucket respondió ${response.status}.`)
    return await response.json() as T
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Bitbucket tardó demasiado en responder. Intenta nuevamente.')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
export const verifyUser = (session: Session) => request<BitbucketUser>(`${API}/user`, session)
type Page<T> = { values: T[]; next?: string }
async function allPagesFully<T>(url: string, session: Session, limit = 100) {
  const items: T[] = []
  const visited = new Set<string>()
  let next: string | undefined = url
  while (next && visited.size < limit) {
    if (visited.has(next)) return { items, complete: false }
    visited.add(next)
    try {
      const result: Page<T> = await request<Page<T>>(next, session)
      if (!Array.isArray(result.values)) throw new Error('Bitbucket devolvió una página sin resultados válidos.')
      items.push(...result.values)
      next = result.next
    } catch (error) {
      if (visited.size === 1) throw error
      return { items, complete: false }
    }
  }
  return { items, complete: !next }
}
async function allPages<T>(url: string, session: Session) {
  const result = await allPagesFully<T>(url, session)
  if (!result.complete) throw new Error('Bitbucket devolvió datos parciales. No se pueden calcular totales completos.')
  return result.items
}
const pullRequestFields = 'values.id,values.title,values.description,values.state,values.draft,values.queued,values.created_on,values.updated_on,values.author,values.source.branch,values.source.commit.hash,values.source.repository.full_name,values.source.repository.links.html,values.destination.branch,values.destination.commit.hash,values.destination.repository.full_name,values.links.html,values.comment_count,values.participants,next'
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
export async function getPullRequests(repo: RepoConfig, session: Session): Promise<PullRequestQueueSnapshot> {
  const base = `${API}/repositories/${encodeURIComponent(repo.workspace)}/${encodeURIComponent(repo.repo)}/pullrequests`
  const states = ['OPEN', 'MERGED', 'DECLINED']
  const pages = await Promise.allSettled(states.map((state) => allPagesFully<Omit<PullRequest, 'repo'>>(`${base}?state=${state}&pagelen=50&fields=${pullRequestFields}`, session)))
  // Without the open list, an empty queue would be misleading. Keep the previous snapshot on refetch errors.
  if (pages[0].status === 'rejected') throw pages[0].reason
  const warnings: string[] = []
  const stateLabels = ['abiertos', 'fusionados', 'rechazados']
  const results = pages.flatMap((page, index) => {
    if (page.status === 'rejected' || !page.value.complete) warnings.push(`La lista de PR ${stateLabels[index]} está incompleta.`)
    return page.status === 'fulfilled' ? page.value.items : []
  })
  const feed = await allPagesFully<PullRequestActivity>(`${base}/activity?pagelen=50&fields=${activityFields}`, session, 6).catch(() => ({ items: [] as PullRequestActivity[], complete: false }))
  const activityByPullRequest = new Map<number, PullRequestActivity[]>()
  const completeByPullRequest = new Map<number, boolean>()
  feed.items.forEach((item) => {
    const id = item.pull_request?.id
    if (!id) return
    activityByPullRequest.set(id, [...(activityByPullRequest.get(id) || []), item])
  })

  const incompleteOpenPullRequests = results.filter((pr) => {
    if (pr.state !== 'OPEN') return false
    if (!feed.complete) return true
    if (!hasReviewHistorySignal(pr, session)) return false
    const currentActivity = activityByPullRequest.get(pr.id) || []
    const latestActivity = Math.max(0, ...currentActivity.map(activityTimestamp))
    const pullRequestUpdated = new Date(pr.updated_on).getTime()
    const hasUpdateAtLatestTimestamp = currentActivity.some((item) => item.update?.date && Math.abs(new Date(item.update.date).getTime() - pullRequestUpdated) < 10_000)
    return !currentActivity.length || pullRequestUpdated > latestActivity + 1_000 || !hasUpdateAtLatestTimestamp
  })
  const fallbackActivity = await Promise.allSettled(incompleteOpenPullRequests.map((pr) => allPagesFully<PullRequestActivity>(`${base}/${pr.id}/activity?pagelen=50&fields=${activityFields}`, session)))
  incompleteOpenPullRequests.forEach((pr, index) => {
    const result = fallbackActivity[index]
    const complete = result.status === 'fulfilled' && result.value.complete
    if (result.status === 'fulfilled') activityByPullRequest.set(pr.id, result.value.items)
    completeByPullRequest.set(pr.id, complete)
    if (!complete) warnings.push(`PR #${pr.id}: no se pudo cargar toda la actividad.`)
  })

  return { prs: results.map((pr) => ({ ...pr, activity: activityByPullRequest.get(pr.id) || [], activityComplete: completeByPullRequest.get(pr.id) ?? feed.complete, repo })), complete: warnings.length === 0, warnings }
}
export async function getReviewHistorySnapshot(repo: RepoConfig, session: Session, knownPullRequests?: Record<string, Pick<ReviewHistoryPullRequest, 'updatedOn'>>) {
  const base = `${API}/repositories/${encodeURIComponent(repo.workspace)}/${encodeURIComponent(repo.repo)}/pullrequests`
  const states = ['OPEN', 'MERGED', 'DECLINED']
  const fields = pullRequestFields
  const pullRequestPages = await Promise.all(states.map((state) => allPagesFully<Omit<PullRequest, 'repo'>>(`${base}?state=${state}&pagelen=50&fields=${fields}`, session)))
  const pullRequests = pullRequestPages.flatMap((page) => page.items).map((pr) => ({ ...pr, activity: [] as PullRequestActivity[], repo }))
  const changedPullRequests = knownPullRequests
    ? pullRequests.filter((pr) => knownPullRequests[String(pr.id)]?.updatedOn !== pr.updated_on)
    : pullRequests
  const activityByPullRequest = new Map<number, PullRequestActivity[]>()
  let activityComplete = true
  if (knownPullRequests) {
    const pages = await Promise.allSettled(changedPullRequests.map((pr) => allPagesFully<PullRequestActivity>(`${base}/${pr.id}/activity?pagelen=50&fields=${activityFields}`, session)))
    pages.forEach((page, index) => {
      if (page.status === 'fulfilled') activityByPullRequest.set(changedPullRequests[index].id, page.value.items)
      if (page.status === 'rejected' || !page.value.complete) activityComplete = false
    })
  } else {
    activityComplete = await allPagesFully<PullRequestActivity>(`${base}/activity?pagelen=50&fields=${activityFields}`, session).then((page) => {
      page.items.forEach((item) => {
        const id = item.pull_request?.id
        if (!id) return
        activityByPullRequest.set(id, [...(activityByPullRequest.get(id) || []), item])
      })
      return page.complete
    })
  }
  return { prs: pullRequests.map((pr) => ({ ...pr, activity: activityByPullRequest.get(pr.id) || [] })), complete: pullRequestPages.every((page) => page.complete) && activityComplete }
}
export async function getStats(pr: PullRequest, session: Session): Promise<PrStats> { const base = `${API}/repositories/${encodeURIComponent(pr.repo.workspace)}/${encodeURIComponent(pr.repo.repo)}/pullrequests/${pr.id}`; const [commits, diff] = await Promise.all([allPages<unknown>(`${base}/commits?pagelen=50`, session), allPages<{ lines_added?: number; lines_removed?: number }>(`${base}/diffstat?pagelen=50`, session)]); return { commits: commits.length, files: diff.length, added: diff.reduce((sum, item) => sum + (item.lines_added || 0), 0), removed: diff.reduce((sum, item) => sum + (item.lines_removed || 0), 0) } }

type BitbucketCommit = { hash?: string; message?: string; author?: { raw?: string }; date?: string; links?: { html?: { href?: string } } }
type BitbucketDiffstat = { lines_added?: number; lines_removed?: number; status?: string; new?: { path?: string; type?: string }; old?: { path?: string; type?: string } }
type BitbucketComment = { id?: number; parent?: { id?: number }; content?: { raw?: string }; user?: ActivityUser; created_on?: string; updated_on?: string; deleted?: boolean; pending?: boolean; resolution?: { created_on?: string }; inline?: { to?: number; from?: number; path?: string }; links?: { html?: { href?: string }; code?: { href?: string } } }
export type ReviewContextDetails = { commits: ReviewContextCommit[]; changedFiles: ReviewContextFile[]; comments: ReviewContextComment[]; diffstat: ReviewContextDiffstat; activity: PullRequestActivity[]; activityComplete: boolean; unavailable: string[] }

const reviewContextFields = {
  commits: 'values.hash,values.message,values.author.raw,values.date,values.links.html.href,next',
  files: 'values.lines_added,values.lines_removed,values.status,values.new.path,values.new.type,values.old.path,values.old.type,next',
  comments: 'values.id,values.parent.id,values.content.raw,values.user.uuid,values.user.display_name,values.created_on,values.updated_on,values.deleted,values.pending,values.resolution,values.inline,values.links.html.href,values.links.code.href,next',
  activity: 'values.pull_request.id,values.comment.id,values.comment.parent.id,values.comment.created_on,values.comment.updated_on,values.comment.deleted,values.comment.user.uuid,values.comment.user.display_name,values.approval.date,values.approval.user.uuid,values.approval.user.display_name,values.update.date,values.update.author.uuid,values.update.author.display_name,values.update.state,values.update.source.commit.hash,next',
} as const

const displayActivityUser = (user?: ActivityUser) => user?.display_name || undefined

export async function getReviewContextDetails(pr: PullRequest, session: Session): Promise<ReviewContextDetails> {
  const base = `${API}/repositories/${encodeURIComponent(pr.repo.workspace)}/${encodeURIComponent(pr.repo.repo)}/pullrequests/${pr.id}`
  const load = async <T>(url: string, label: string) => {
    try {
      const result = await allPagesFully<T>(url, session)
      return { value: result.items, complete: result.complete, error: result.complete ? undefined : `${label} (carga parcial)` }
    } catch { return { value: [] as T[], complete: false, error: label } }
  }
  const [commitsResult, filesResult, commentsResult, activityResult] = await Promise.all([
    load<BitbucketCommit>(`${base}/commits?pagelen=50&fields=${reviewContextFields.commits}`, 'commits'),
    load<BitbucketDiffstat>(`${base}/diffstat?pagelen=50&fields=${reviewContextFields.files}`, 'changed files'),
    load<BitbucketComment>(`${base}/comments?pagelen=50&fields=${reviewContextFields.comments}`, 'comments'),
    load<PullRequestActivity>(`${base}/activity?pagelen=50&fields=${reviewContextFields.activity}`, 'activity'),
  ])

  const comments = commentsResult.value.filter((comment) => !comment.pending).map((comment): ReviewContextComment => ({
    id: comment.id,
    parentId: comment.parent?.id,
    author: displayActivityUser(comment.user),
    authorUuid: comment.user?.uuid,
    date: comment.updated_on || comment.created_on,
    createdAt: comment.created_on,
    updatedAt: comment.updated_on,
    content: comment.deleted ? '[Comentario eliminado]' : comment.content?.raw || '',
    deleted: comment.deleted,
    resolved: Boolean(comment.resolution),
    path: comment.inline?.path,
    line: comment.inline?.to ?? comment.inline?.from,
    side: typeof comment.inline?.to === 'number' ? 'source' : typeof comment.inline?.from === 'number' ? 'destination' : undefined,
    url: comment.links?.html?.href,
    codeUrl: comment.links?.code?.href,
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
  return { commits, changedFiles: files, comments: associateCommentCommits(comments, activityResult.value, activityResult.complete), diffstat: { files: files.length, additions, deletions, totalChanges: additions + deletions }, activity: activityResult.value, activityComplete: activityResult.complete, unavailable }
}
