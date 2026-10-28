import { BitbucketRequestError, getHistoryPage, historyActivityUrl, historyListUrl } from './bitbucket'
import { bitbucketHold } from './bitbucketTraffic'
import { localDate, type DateRange } from './dateRange'
import { historyImportStorage, type HistoryImportStorage, type HistoryManifest, type HistoryRecord } from './historyImportStorage'
import { buildPullRequestHistory } from './reviewHistory'
import { summaryScope } from './summaryHistory'
import type { PullRequest, PullRequestActivity, RepoConfig, ReviewHistoryPullRequest, Session } from '../types'

export type HistoryYear = DateRange & { year: number }
export type HistoryImportSnapshot = {
  status: 'pending' | 'paused' | 'complete'
  phase: HistoryManifest['phase']
  pullRequests: Record<string, ReviewHistoryPullRequest>
  processed: number
  total: number
  pages: number
  persisted: boolean
  error?: string
  retryAt?: number
  updatedAt: number
  through: string
}
export type HistoryImportMode = 'refresh' | 'reload' | 'resume'
const states: PullRequest['state'][] = ['OPEN', 'MERGED', 'DECLINED']
let importTail: Promise<unknown> = Promise.resolve()

export function historyYears(range: DateRange, now = new Date()): HistoryYear[] {
  const today = localDate(now)
  const end = range.to < today ? range.to : today
  if (range.from > end) return []
  return Array.from({ length: Number(end.slice(0, 4)) - Number(range.from.slice(0, 4)) + 1 }, (_, index) => {
    const year = Number(range.from.slice(0, 4)) + index
    return { year, from: `${year}-01-01`, to: `${year}-12-31` < today ? `${year}-12-31` : today }
  })
}

export const historyRepositoryScope = (repo: RepoConfig, session: Session) => JSON.stringify([...summaryScope(session), repo.workspace, repo.repo])
export const historyImportKey = (repo: RepoConfig, session: Session, year: number) => `${historyRepositoryScope(repo, session)}:${year}`
const recordKey = (scope: string, id: number) => `${scope}:${id}`
const isFinished = (record: HistoryRecord | undefined, manifest: HistoryManifest) => Boolean(record?.complete
  && record.version === record.pr.updated_on && (!manifest.force || record.readStartedAt >= manifest.startedAt))

function validPullRequest(pr: Omit<PullRequest, 'repo'>) {
  return pr && Number.isSafeInteger(pr.id) && pr.id > 0 && typeof pr.title === 'string' && states.includes(pr.state)
    && Number.isFinite(Date.parse(pr.created_on)) && Number.isFinite(Date.parse(pr.updated_on))
    && (pr.participants === undefined || Array.isArray(pr.participants))
}

function mergePartial(previous: ReviewHistoryPullRequest | undefined, next: ReviewHistoryPullRequest) {
  return { ...next, events: [...new Map([...(previous?.events || []), ...next.events].map((event) => [event.id, event])).values()] }
}

export function importHistoryChunk(repo: RepoConfig, session: Session, year: HistoryYear, options: {
  signal: AbortSignal
  mode?: HistoryImportMode
  storage?: HistoryImportStorage
  maxPages?: number
  onProgress?: (snapshot: HistoryImportSnapshot) => void
}): Promise<HistoryImportSnapshot> {
  const storage = options.storage || historyImportStorage
  const scope = historyRepositoryScope(repo, session)
  const key = historyImportKey(repo, session, year.year)
  const load = async () => {
    options.signal.throwIfAborted()
    const saved = await storage.read(scope, key)
    let manifest = saved.manifest
    const records = new Map(saved.records.filter((record) => record.scope === scope && record.key === recordKey(scope, record.pr.id)).map((record) => [record.pr.id, record]))
    const reset = !manifest || manifest.scope !== scope || manifest.year !== year.year || manifest.to < year.to
      || (manifest.phase === 'complete' && (options.mode === 'refresh' || Date.now() - manifest.updatedAt >= 600_000 && year.year === new Date().getFullYear()))
      || options.mode === 'reload'
      || manifest.ids.some((id) => !records.has(id))
    if (reset) manifest = {
      key, scope, year: year.year, from: year.from, to: year.to, phase: 'listing', stateIndex: 0,
      ids: [], force: options.mode === 'reload', startedAt: Date.now(), updatedAt: Date.now(),
    }
    const current = manifest!
    if (current.phase === 'complete' && current.ids.some((id) => !isFinished(records.get(id), current))) current.phase = 'activity'
    const listingVisited = new Set(current.visited || [])
    const activityVisited = new Map<number, Set<string>>()
    let pages = 0
    const snapshot = (): HistoryImportSnapshot => ({
      status: current.error ? 'paused' : current.phase === 'complete' ? 'complete' : 'pending',
      phase: current.phase,
      pullRequests: Object.fromEntries([...records.values()].filter((record) => record.history).map((record) => [record.pr.id, record.history!])),
      processed: current.ids.filter((id) => isFinished(records.get(id), current)).length,
      total: current.ids.length, pages, persisted: storage.persistent, error: current.error, retryAt: current.retryAt, updatedAt: current.updatedAt, through: current.to,
    })
    if (options.mode === 'resume' || options.mode === 'refresh' || options.mode === 'reload') { current.error = undefined; current.retryAt = undefined }
    const hold = bitbucketHold(session)
    if (hold) { current.error = hold.message; current.retryAt = hold.until }
    options.onProgress?.(snapshot())
    if (current.error || current.phase === 'complete') return snapshot()
    const controller = new AbortController()
    const cancel = () => controller.abort(options.signal.reason)
    options.signal.addEventListener('abort', cancel, { once: true })
    if (options.signal.aborted) cancel()
    const budget = new Error('History chunk budget elapsed')
    const timer = setTimeout(() => controller.abort(budget), 90_000)
    const commit = async (rows: HistoryRecord[] = []) => {
      current.updatedAt = Date.now()
      await storage.write(current, rows)
      options.onProgress?.(snapshot())
    }
    try {
      await commit()
      while (pages < (options.maxPages ?? 10) && current.phase !== 'complete') {
        controller.signal.throwIfAborted()
        if (current.phase === 'listing') {
          const url = current.next || historyListUrl(repo, current, states[current.stateIndex])
          if (listingVisited.has(url)) throw new BitbucketRequestError('Bitbucket repitió una página del listado; puedes recargar el histórico.', 'Importación histórica')
          const page = await getHistoryPage<Omit<PullRequest, 'repo'>>(url, repo, session, controller.signal)
          if (page.next === url) throw new BitbucketRequestError('Bitbucket repitió la misma página; conservamos el avance.', 'Importación histórica')
          if (!page.items.every(validPullRequest)) throw new BitbucketRequestError('El listado contiene un PR inválido; no se marcará completo.', 'Importación histórica')
          const rows = page.items.map((raw) => {
            const pr: PullRequest = { id: raw.id, title: raw.title, state: raw.state, created_on: raw.created_on, updated_on: raw.updated_on, participants: raw.participants, links: raw.links, repo: { workspace: repo.workspace, repo: repo.repo } }
            const previous = records.get(pr.id)
            const record: HistoryRecord = previous ? { ...previous, pr, history: previous.history ? mergePartial(previous.history, buildPullRequestHistory(pr)) : undefined } : { key: recordKey(scope, pr.id), scope, pr, activity: [], version: '', complete: false, readStartedAt: 0 }
            records.set(pr.id, record)
            return record
          })
          current.ids = [...new Set([...current.ids, ...rows.map((record) => record.pr.id)])]
          current.next = page.next
          listingVisited.add(url)
          if (!page.next) { current.stateIndex += 1; listingVisited.clear() }
          current.visited = [...listingVisited]
          if (current.stateIndex === states.length) current.phase = 'activity'
          pages += 1
          await commit(rows)
        } else {
          const pending = current.ids.find((id) => !isFinished(records.get(id), current))
          if (pending === undefined) { current.phase = 'complete'; await commit(); break }
          let record = records.get(pending)!
          if (record.version !== record.pr.updated_on || current.force && record.readStartedAt < current.startedAt) {
            record = { ...record, version: record.pr.updated_on, activity: [], next: undefined, visited: [], complete: false, readStartedAt: Date.now() }
            activityVisited.delete(pending)
          }
          const url = record.next || historyActivityUrl(repo, pending)
          const visited = activityVisited.get(pending) || new Set(record.visited || [])
          activityVisited.set(pending, visited)
          if (visited.has(url)) throw new BitbucketRequestError('Bitbucket repitió una página de actividad; puedes recargar el histórico.', 'Importación histórica')
          const page = await getHistoryPage<PullRequestActivity>(url, repo, session, controller.signal)
          if (page.next === url) throw new BitbucketRequestError('Bitbucket repitió la página de actividad; conservamos el avance.', 'Importación histórica')
          const activity = [...record.activity, ...page.items]
          const next = buildPullRequestHistory({ ...record.pr, activity })
          visited.add(url)
          record = { ...record, activity: page.next ? activity : [], visited: page.next ? [...visited] : [], next: page.next, complete: !page.next, history: page.next ? mergePartial(record.history, next) : next }
          records.set(pending, record)
          pages += 1
          if (current.ids.every((id) => isFinished(records.get(id), current))) current.phase = 'complete'
          await commit([record])
        }
      }
    } catch (reason) {
      if (options.signal.aborted) throw options.signal.reason
      if (controller.signal.reason !== budget) {
        current.error = reason instanceof BitbucketRequestError ? reason.message : 'No se pudo importar la página. Conservamos el avance para reintentar.'
        current.retryAt = bitbucketHold(session)?.until
        await commit()
      }
    } finally {
      clearTimeout(timer)
      options.signal.removeEventListener('abort', cancel)
    }
    return snapshot()
  }
  const locked = async (): Promise<HistoryImportSnapshot> => typeof navigator !== 'undefined' && navigator.locks
    ? await navigator.locks.request(`prcr:history-import:${scope}`, { signal: options.signal }, load)
    : load()
  const result = importTail.then(locked, locked)
  importTail = result.catch(() => {})
  return result
}
