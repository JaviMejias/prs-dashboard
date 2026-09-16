import type { RepoConfig, ReviewHistory, ReviewHistoryEvent, ReviewHistoryPullRequest, Session } from '../types'

export type SummaryDateRange = { from: string; to: string }
export type SummaryEvent = { event: ReviewHistoryEvent; pullRequest: ReviewHistoryPullRequest; repositoryKey: string }
export type SummaryRepository = { repositoryKey: string; label: string; pullRequests: number }
export type SummaryActivityPoint = { label: string; count: number; from: string; to: string }
export type SummaryMetrics = {
  reviewed: number
  comments: number
  approved: number
  changes: number
  events: SummaryEvent[]
  repositories: SummaryRepository[]
  activity: SummaryActivityPoint[]
}

const repositoryKey = (repo: RepoConfig) => `${repo.workspace}/${repo.repo}`

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()

const matchesReviewer = (event: ReviewHistoryEvent, session: Session) => Boolean(
  (session.uuid && event.reviewerUuid === session.uuid)
  || (event.reviewerName && normalize(event.reviewerName) === normalize(session.displayName || session.email)),
)

const inRange = (date: string | undefined, range: SummaryDateRange) => Boolean(
  date && date.slice(0, 10) >= range.from && date.slice(0, 10) <= range.to,
)

const localDate = (date: Date) => `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`
const parseDate = (value: string) => { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day) }
const dayDifference = (from: string, to: string) => Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000)

export function previousDateRange(range: SummaryDateRange): SummaryDateRange {
  const days = dayDifference(range.from, range.to) + 1
  const previousTo = parseDate(range.from)
  previousTo.setDate(previousTo.getDate() - 1)
  const previousFrom = new Date(previousTo)
  previousFrom.setDate(previousFrom.getDate() - days + 1)
  return { from: localDate(previousFrom), to: localDate(previousTo) }
}

function activitySeries(events: SummaryEvent[], range: SummaryDateRange): SummaryActivityPoint[] {
  const totalDays = dayDifference(range.from, range.to) + 1
  const bucketCount = Math.min(7, Math.max(1, totalDays))
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const fromDate = parseDate(range.from)
    fromDate.setDate(fromDate.getDate() + Math.floor(index * totalDays / bucketCount))
    const toDate = parseDate(range.from)
    toDate.setDate(toDate.getDate() + Math.floor((index + 1) * totalDays / bucketCount) - 1)
    return { from: localDate(fromDate), to: localDate(toDate), count: 0 }
  })

  events.forEach(({ event }) => {
    const offset = dayDifference(range.from, event.date.slice(0, 10))
    if (offset < 0 || offset >= totalDays) return
    const index = Math.min(bucketCount - 1, Math.floor(offset * bucketCount / totalDays))
    buckets[index].count += 1
  })

  return buckets.map((bucket) => ({
    ...bucket,
    label: parseDate(bucket.from).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }),
  }))
}

export function summaryMetricsForRange(history: ReviewHistory, repos: RepoConfig[], session: Session, range: SummaryDateRange): SummaryMetrics {
  const configuredKeys = new Set(repos.map(repositoryKey))
  const events: SummaryEvent[] = []
  const repositoryPullRequests = new Map<string, Set<number>>()

  Object.entries(history.repositories)
    .filter(([key]) => configuredKeys.has(key))
    .forEach(([key, repository]) => Object.values(repository.pullRequests).forEach((pullRequest) => {
      pullRequest.events
        .filter((event) => inRange(event.date, range) && matchesReviewer(event, session))
        .forEach((event) => {
          events.push({ event, pullRequest, repositoryKey: key })
          const pullRequests = repositoryPullRequests.get(key) || new Set<number>()
          pullRequests.add(pullRequest.id)
          repositoryPullRequests.set(key, pullRequests)
        })
    }))

  const repositories = Array.from(repositoryPullRequests.entries())
    .map(([key, pullRequests]) => ({ repositoryKey: key, label: key.split('/').at(-1) || key, pullRequests: pullRequests.size }))
    .sort((first, second) => second.pullRequests - first.pullRequests)

  return {
    reviewed: new Set(events.map(({ pullRequest, repositoryKey: key }) => `${key}#${pullRequest.id}`)).size,
    comments: events.filter(({ event }) => event.type === 'comment').length,
    approved: new Set(events.filter(({ event }) => event.type === 'approval').map(({ pullRequest, repositoryKey: key }) => `${key}#${pullRequest.id}`)).size,
    changes: new Set(events.filter(({ event }) => event.type === 'changes_requested').map(({ pullRequest, repositoryKey: key }) => `${key}#${pullRequest.id}`)).size,
    events: events.sort((first, second) => new Date(second.event.date).getTime() - new Date(first.event.date).getTime()),
    repositories,
    activity: activitySeries(events, range),
  }
}
