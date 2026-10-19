import type { ActivityUser, BitbucketUser, PrStats, PullRequest, PullRequestActivity, RepoConfig, ReviewContextComment, ReviewContextCommit, ReviewContextFile, ReviewContextDiffstat, ReviewHistoryPullRequest, Session } from '../types'
import { summaryDateBounds } from './summaryHistory'
import type { DateRange } from './dateRange'
export { classifyPr, getLifecycleStatus, getReviewDecision, getReviewerState, isFreshPullRequest } from './pullRequestReviewState'
const API = 'https://api.bitbucket.org/2.0'
const REQUEST_TIMEOUT_MS = 30_000
export const REPOSITORY_SYNC_TIMEOUT_MS = 90_000
export const BITBUCKET_REQUEST_CONCURRENCY = 6
const BITBUCKET_PAGE_SIZE = 50
let activeRequests = 0
const queuedRequestSlots: Array<() => void> = []

function acquireRequestSlot(signal: AbortSignal) {
  signal.throwIfAborted()
  if (activeRequests < BITBUCKET_REQUEST_CONCURRENCY) {
    activeRequests += 1
    return Promise.resolve()
  }
  return new Promise<void>((resolve, reject) => {
    const start = () => {
      signal.removeEventListener('abort', cancel)
      activeRequests += 1
      resolve()
    }
    const cancel = () => {
      const index = queuedRequestSlots.indexOf(start)
      if (index >= 0) queuedRequestSlots.splice(index, 1)
      reject(signal.reason)
    }
    queuedRequestSlots.push(start)
    signal.addEventListener('abort', cancel, { once: true })
  })
}

function releaseRequestSlot() {
  activeRequests -= 1
  queuedRequestSlots.shift()?.()
}

const auth = (s: Session) => `Basic ${btoa(`${s.email}:${s.token}`)}`
export class BitbucketRequestError extends Error {
  constructor(message: string, readonly operation: string, readonly status?: number) {
    super(`${operation}: ${message}`)
    this.name = 'BitbucketRequestError'
  }
}

function requestOperation(url: string) {
  const parsed = new URL(url)
  const activityId = parsed.pathname.match(/\/pullrequests\/(\d+)\/activity$/)?.[1]
  if (activityId) return `Actividad del PR #${activityId}`
  if (parsed.pathname.endsWith('/pullrequests')) {
    const labels: Record<string, string> = { OPEN: 'abiertos', MERGED: 'fusionados', DECLINED: 'rechazados' }
    return `Listado de PR ${labels[parsed.searchParams.get('state') || ''] || ''}`.trim()
  }
  return 'Consulta a Bitbucket'
}

function responseError(status: number) {
  if (status === 401) return 'Credenciales inválidas o expiradas.'
  if (status === 403) return 'El token no tiene permiso para consultar este recurso.'
  if (status === 404) return 'El repositorio o recurso no existe, o tu cuenta no tiene acceso.'
  if (status === 429) return 'Bitbucket limitó temporalmente las consultas (HTTP 429). Espera antes de reintentar.'
  if (status >= 500) return `Bitbucket no pudo atender la consulta (HTTP ${status}). Intenta más tarde.`
  return `Bitbucket rechazó la consulta (HTTP ${status}).`
}

async function request<T>(url: string, session: Session, timeoutMs = REQUEST_TIMEOUT_MS, signal?: AbortSignal): Promise<T> {
  const operation = requestOperation(url)
  const controller = new AbortController()
  const cancel = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) cancel()
  const timer = setTimeout(() => controller.abort(new BitbucketRequestError('Bitbucket no respondió en 30 segundos. Revisa tu conexión e inténtalo nuevamente.', operation)), timeoutMs)
  let acquired = false
  try {
    await acquireRequestSlot(controller.signal)
    acquired = true
    controller.signal.throwIfAborted()
    const response = await fetch(url, { headers: { Authorization: auth(session), Accept: 'application/json' }, signal: controller.signal })
    if (!response.ok) throw new BitbucketRequestError(responseError(response.status), operation, response.status)
    return await response.json() as T
  } catch (reason) {
    if (controller.signal.aborted) throw controller.signal.reason
    if (reason instanceof BitbucketRequestError) throw reason
    throw new BitbucketRequestError('No se pudo recibir una respuesta válida. Revisa tu conexión o inténtalo más tarde.', operation)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
    if (acquired) releaseRequestSlot()
  }
}
export const verifyUser = (session: Session) => request<BitbucketUser>(`${API}/user`, session)
type Page<T> = { values: T[]; next?: string }
async function allPages<T>(url: string, session: Session, limit = 100, signal?: AbortSignal) {
  const result = await allPagesFully<T>(url, session, limit, undefined, signal)
  if (!result.complete) throw new BitbucketRequestError(`Bitbucket superó el límite de ${limit} páginas; los datos están incompletos.`, requestOperation(url))
  return result.items
}
async function allPagesFully<T>(url: string, session: Session, limit = 100, timeoutMs?: number, signal?: AbortSignal) {
  const items: T[] = []
  let next: string | undefined = url
  let page = 0
  while (next && page < limit) {
    const result: Page<T> = await request<Page<T>>(next, session, timeoutMs, signal)
    items.push(...(result.values || []))
    next = result.next
    page += 1
  }
  return { items, complete: !next }
}
const activityFields = 'values.pull_request.id,values.comment.id,values.comment.parent.id,values.comment.created_on,values.comment.updated_on,values.comment.deleted,values.comment.user.uuid,values.comment.user.display_name,values.approval.date,values.approval.user.uuid,values.approval.user.display_name,values.update.date,values.update.author.uuid,values.update.author.display_name,values.update.state,values.update.source.commit.hash,next'
const normalizedUserName = (name?: string) => name?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim()
const hasReviewHistorySignal = (pr: Omit<PullRequest, 'repo'>, session: Session) => (pr.participants || []).some((participant) => {
  if (participant.state === 'changes_requested') return true
  return Boolean(
    (session.uuid && participant.user?.uuid === session.uuid)
    || (session.displayName && normalizedUserName(participant.user?.display_name) === normalizedUserName(session.displayName)),
  )
})
type PullRequestLoadOptions = {
  state?: PullRequest['state']
  signal?: AbortSignal
  previousPullRequests?: PullRequest[]
  loadActivity?: (pr: PullRequest, load: () => Promise<PullRequestActivity[]>) => Promise<PullRequestActivity[]>
}

export async function getPullRequests(repo: RepoConfig, session: Session, options: PullRequestLoadOptions = {}) {
  const base = `${API}/repositories/${encodeURIComponent(repo.workspace)}/${encodeURIComponent(repo.repo)}/pullrequests`
  const controller = new AbortController()
  const cancel = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', cancel, { once: true })
  if (options.signal?.aborted) cancel()
  const timer = setTimeout(() => controller.abort(new BitbucketRequestError('La sincronización superó 90 segundos. Conservamos la última información disponible; puedes reintentar.', 'Sincronización del repositorio')), REPOSITORY_SYNC_TIMEOUT_MS)
  try {
    const states = options.state ? [options.state] : ['OPEN', 'MERGED', 'DECLINED']
    const results = (await Promise.all(states.map((state) => allPages<Omit<PullRequest, 'repo'>>(`${base}?state=${state}&pagelen=${BITBUCKET_PAGE_SIZE}&fields=values.id,values.title,values.description,values.state,values.draft,values.queued,values.created_on,values.updated_on,values.author,values.source.branch,values.source.repository.full_name,values.source.repository.links.html,values.destination.branch,values.destination.repository.full_name,values.links.html,values.comment_count,values.participants,next`, session, 100, controller.signal)))).flat()
    const previousById = new Map((options.previousPullRequests || []).map((pr) => [pr.id, pr]))
    const activityByPullRequest = new Map<number, PullRequestActivity[]>()
    const pullRequestsWithReviewHistory = results.filter((pr) => {
      if (pr.state !== 'OPEN' || !hasReviewHistorySignal(pr, session)) return false
      const previous = previousById.get(pr.id)
      if (previous?.updated_on === pr.updated_on && previous.activity) {
        activityByPullRequest.set(pr.id, previous.activity)
        return false
      }
      return true
    })
    // The repository-wide feed has no date filter and can require thousands of events.
    // Load history only for open PRs whose participant data indicates a review matters.
    const activityBatchSize = 4
    for (let index = 0; index < pullRequestsWithReviewHistory.length; index += activityBatchSize) {
      const batch = pullRequestsWithReviewHistory.slice(index, index + activityBatchSize)
      const activities = await Promise.all(batch.map((pr) => {
        const load = () => allPages<PullRequestActivity>(`${base}/${pr.id}/activity?pagelen=${BITBUCKET_PAGE_SIZE}&fields=${activityFields}`, session, 100, controller.signal)
        return options.loadActivity ? options.loadActivity({ ...pr, repo }, load) : load()
      }))
      batch.forEach((pr, position) => activityByPullRequest.set(pr.id, activities[position]))
    }

    return results.map((pr) => ({ ...pr, activity: activityByPullRequest.get(pr.id) || [], repo }))
  } catch (reason) {
    controller.abort(reason)
    throw reason
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', cancel)
  }
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
    ? await Promise.all(changedPullRequests.map((pr) => allPagesFully<PullRequestActivity>(`${base}/${pr.id}/activity?pagelen=50&fields=${activityFields}`, session))).then((pages) => {
      pages.forEach((page, index) => activityByPullRequest.set(changedPullRequests[index].id, page.items))
      return pages.every((page) => page.complete)
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

export type SummaryActivityPage = { items: PullRequestActivity[]; complete: boolean }
export type SummaryActivityLoader = (pr: PullRequest, load: () => Promise<SummaryActivityPage>) => Promise<SummaryActivityPage>

export async function getReviewHistoryForRange(repo: RepoConfig, session: Session, range: DateRange, loadActivity: SummaryActivityLoader = (_pr, load) => load()) {
  const base = `${API}/repositories/${encodeURIComponent(repo.workspace)}/${encodeURIComponent(repo.repo)}/pullrequests`
  const { start, endExclusive } = summaryDateBounds(range)
  // A review can precede a later PR update. Never cap updated_on at the period end.
  const q = `updated_on >= ${start} AND created_on < ${endExclusive}`
  const fields = 'values.id,values.title,values.state,values.created_on,values.updated_on,values.links.html,values.participants,next'
  const pages = await Promise.all(['OPEN', 'MERGED', 'DECLINED'].map((state) => {
    const params = new URLSearchParams({ state, q, pagelen: '50', fields })
    return allPagesFully<Omit<PullRequest, 'repo'>>(`${base}?${params}`, session, 100, 30_000)
  }))
  const prs = Array.from(new Map(pages.flatMap((page) => page.items).map((pr) => [pr.id, { ...pr, repo }])).values())
  const result: PullRequest[] = []
  let complete = pages.every((page) => page.complete)
  // Activity has no documented date-range filter. Bound concurrency, not the event dates.
  for (let index = 0; index < prs.length; index += 4) {
    const batch = prs.slice(index, index + 4)
    const activities = await Promise.all(batch.map((pr) => loadActivity(pr,
      () => allPagesFully<PullRequestActivity>(`${base}/${pr.id}/activity?pagelen=50&fields=${activityFields}`, session, 100, 30_000))))
    batch.forEach((pr, position) => {
      result.push({ ...pr, activity: activities[position].items })
      if (!activities[position].complete) complete = false
    })
  }
  return { prs: result, complete }
}
export async function getStats(pr: PullRequest, session: Session, signal?: AbortSignal): Promise<PrStats> { const base = `${API}/repositories/${encodeURIComponent(pr.repo.workspace)}/${encodeURIComponent(pr.repo.repo)}/pullrequests/${pr.id}`; const [commits, diff] = await Promise.all([allPages<unknown>(`${base}/commits?pagelen=50`, session, 100, signal), allPages<{ lines_added?: number; lines_removed?: number }>(`${base}/diffstat?pagelen=50`, session, 100, signal)]); return { commits: commits.length, files: diff.length, added: diff.reduce((sum, item) => sum + (item.lines_added || 0), 0), removed: diff.reduce((sum, item) => sum + (item.lines_removed || 0), 0) } }

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

export async function getReviewContextDetails(pr: PullRequest, session: Session, signal?: AbortSignal): Promise<ReviewContextDetails> {
  const controller = new AbortController()
  const cancel = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) cancel()
  const timer = setTimeout(() => controller.abort(), 90_000)
  try {
    const base = `${API}/repositories/${encodeURIComponent(pr.repo.workspace)}/${encodeURIComponent(pr.repo.repo)}/pullrequests/${pr.id}`
    const load = async <T>(url: string, label: string) => {
      try { return { value: await allPages<T>(url, session, 100, controller.signal), error: undefined } }
      catch { return { value: [] as T[], error: label } }
    }
    const [commitsResult, filesResult, commentsResult, activityResult] = await Promise.all([
      load<BitbucketCommit>(`${base}/commits?pagelen=50&fields=${reviewContextFields.commits}`, 'commits'),
      load<BitbucketDiffstat>(`${base}/diffstat?pagelen=50&fields=${reviewContextFields.files}`, 'changed files'),
      load<BitbucketComment>(`${base}/comments?pagelen=50&fields=${reviewContextFields.comments}`, 'comments'),
      load<PullRequestActivity>(`${base}/activity?pagelen=50&fields=${reviewContextFields.activity}`, 'activity'),
    ])

    const comments = commentsResult.value.filter((comment) => !comment.deleted).map((comment): ReviewContextComment => ({
      id: comment.id,
      parentId: comment.parent?.id,
      authorUuid: comment.user?.uuid,
      author: displayActivityUser(comment.user),
      date: comment.updated_on || comment.created_on,
      createdAt: comment.created_on,
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
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}
