import type { PullRequest, RepoConfig, ReviewHistory, ReviewHistoryPullRequest, Session } from '../types'
import { localDate, type DateRange } from './dateRange'
import { sessionCacheKey } from './queryIdentity'
import { buildPullRequestHistory } from './reviewHistory'

export type SummaryMonth = DateRange & { month: string }
export type SummaryMonthSnapshot = {
  schemaVersion: 1
  range: SummaryMonth
  fetchedAt: number
  complete: boolean
  pullRequests: Record<string, ReviewHistoryPullRequest>
}

const parseDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

// Cache whole months so overlapping ranges and yearly views reuse the same reads.
export function summaryMonths(range: DateRange, now = new Date()): SummaryMonth[] {
  const today = localDate(now)
  const end = range.to < today ? range.to : today
  if (range.from > end) return []
  const cursor = parseDate(range.from)
  cursor.setDate(1)
  const months: SummaryMonth[] = []
  while (localDate(cursor) <= end) {
    const from = localDate(cursor)
    const last = localDate(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0))
    months.push({ month: from.slice(0, 7), from, to: last < today ? last : today })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months
}

export function summaryDateBounds(range: DateRange) {
  const end = parseDate(range.to)
  end.setDate(end.getDate() + 1)
  return { start: parseDate(range.from).toISOString(), endExclusive: end.toISOString() }
}

export function summaryAccount(session: Session) {
  return sessionCacheKey(session)
}

export function summaryScope(session: Session) {
  return [summaryAccount(session), Intl.DateTimeFormat().resolvedOptions().timeZone] as const
}

export const summaryRepositoryKey = (repo: RepoConfig) => `${repo.workspace}/${repo.repo}`
export const summaryMonthKey = (scope: readonly string[], repo: RepoConfig, month: SummaryMonth) =>
  ['summary-history-v1', ...scope, summaryRepositoryKey(repo), month.month, month.to] as const

const storageKey = (scope: readonly string[], repo: RepoConfig, month: SummaryMonth) =>
  `prcr:summary-history-v1:${JSON.stringify([...scope, summaryRepositoryKey(repo), month.month])}`

const validPullRequest = (value: unknown): value is ReviewHistoryPullRequest => {
  if (!value || typeof value !== 'object') return false
  const pr = value as Partial<ReviewHistoryPullRequest>
  return typeof pr.id === 'number' && ['OPEN', 'MERGED', 'DECLINED'].includes(pr.state || '')
    && typeof pr.createdAt === 'string' && typeof pr.updatedOn === 'string'
    && (pr.title === undefined || typeof pr.title === 'string') && (pr.url === undefined || typeof pr.url === 'string')
    && Array.isArray(pr.events) && pr.events.every((event) => event && typeof event.id === 'string'
      && typeof event.date === 'string' && Number.isFinite(Date.parse(event.date))
      && ['comment', 'approval', 'review', 'changes_requested'].includes(event.type)
      && (event.reviewerUuid === undefined || typeof event.reviewerUuid === 'string')
      && (event.reviewerName === undefined || typeof event.reviewerName === 'string'))
}

export function readSummaryMonth(scope: readonly string[], repo: RepoConfig, month: SummaryMonth): SummaryMonthSnapshot | undefined {
  try {
    const raw = localStorage.getItem(storageKey(scope, repo, month))
    if (!raw) return undefined
    const snapshot = JSON.parse(raw) as Partial<SummaryMonthSnapshot> | null
    if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.range?.month !== month.month
      || snapshot.range.from !== month.from || typeof snapshot.range.to !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.range.to) || snapshot.range.to.slice(0, 7) !== month.month
      || localDate(parseDate(snapshot.range.to)) !== snapshot.range.to || snapshot.range.to < month.from
      || typeof snapshot.complete !== 'boolean' || typeof snapshot.fetchedAt !== 'number'
      || !Number.isFinite(new Date(snapshot.fetchedAt).getTime())
      || !snapshot.pullRequests || typeof snapshot.pullRequests !== 'object'
      || !Object.values(snapshot.pullRequests).every(validPullRequest)) return undefined
    return snapshot as SummaryMonthSnapshot
  } catch { return undefined }
}

export function saveSummaryMonth(scope: readonly string[], repo: RepoConfig, snapshot: SummaryMonthSnapshot) {
  try {
    const previous = readSummaryMonth(scope, repo, snapshot.range)
    // An older in-flight read must not shrink newer stored coverage or replace fresher data.
    if (previous && (previous.range.to > snapshot.range.to || previous.fetchedAt > snapshot.fetchedAt)) return true
    localStorage.setItem(storageKey(scope, repo, snapshot.range), JSON.stringify(snapshot))
    return true
  } catch { return false }
}

export function buildSummaryMonth(prs: PullRequest[], range: SummaryMonth, complete: boolean, fetchedAt = Date.now()): SummaryMonthSnapshot {
  const { start, endExclusive } = summaryDateBounds(range)
  const from = Date.parse(start)
  const to = Date.parse(endExclusive)
  const pullRequests: SummaryMonthSnapshot['pullRequests'] = {}
  prs.forEach((pr) => {
    const history = buildPullRequestHistory(pr)
    history.events = history.events.filter((event) => Date.parse(event.date) >= from && Date.parse(event.date) < to)
    if (history.events.length) pullRequests[String(pr.id)] = history
  })
  return { schemaVersion: 1, range, fetchedAt, complete, pullRequests }
}

export function combineSummaryMonths(entries: { repo: RepoConfig; snapshot?: SummaryMonthSnapshot }[]): ReviewHistory {
  const history: ReviewHistory = { schemaVersion: 1, repositories: {} }
  entries.forEach(({ repo, snapshot }) => {
    const key = summaryRepositoryKey(repo)
    const previous = history.repositories[key]
    const pullRequests = { ...(previous?.pullRequests || {}) }
    Object.values(snapshot?.pullRequests || {}).forEach((pr) => {
      const old = pullRequests[String(pr.id)]
      const events = Array.from(new Map([...(old?.events || []), ...pr.events].map((event) => [event.id, event])).values())
      const metadata = old && old.updatedOn > pr.updatedOn ? old : pr
      pullRequests[String(pr.id)] = { ...metadata, events }
    })
    history.repositories[key] = {
      syncedAt: new Date(snapshot?.fetchedAt || 0).toISOString(),
      coverage: snapshot?.complete && (!previous || previous.coverage === 'complete') ? 'complete' : 'partial',
      pullRequests,
    }
  })
  return history
}

// Limit period jobs across repositories and views, including jobs finishing after navigation.
let activeSummaryJobs = 0
const waitingSummaryJobs: (() => void)[] = []
export async function runSummaryJob<T>(load: () => Promise<T>): Promise<T> {
  if (activeSummaryJobs >= 2) await new Promise<void>((resolve) => waitingSummaryJobs.push(resolve))
  else activeSummaryJobs += 1
  try { return await load() }
  finally {
    const next = waitingSummaryJobs.shift()
    if (next) next()
    else activeSummaryJobs -= 1
  }
}
