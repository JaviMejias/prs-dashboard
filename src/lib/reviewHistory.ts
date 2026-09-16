import type { PullRequest, PullRequestActivity, RepoConfig, ReviewHistory, ReviewHistoryEvent, ReviewHistoryPullRequest } from '../types'

const repositoryKey = (pr: PullRequest) => `${pr.repo.workspace}/${pr.repo.repo}`
const configRepositoryKey = (repo: RepoConfig) => `${repo.workspace}/${repo.repo}`
const eventDate = (item: PullRequestActivity) => item.comment?.updated_on || item.comment?.created_on || item.approval?.date
const eventUser = (item: PullRequestActivity) => item.comment?.user || item.approval?.user
const eventId = (type: ReviewHistoryEvent['type'], date: string, user?: { uuid?: string; display_name?: string }) => [type, date, user?.uuid || user?.display_name || 'unknown'].join('|')

function toReviewEvent(item: PullRequestActivity): ReviewHistoryEvent | undefined {
  if (item.comment && !item.comment.deleted) {
    const date = eventDate(item)
    if (!date) return undefined
    const user = eventUser(item)
    return { id: eventId('comment', date, user), date, type: 'comment', reviewerUuid: user?.uuid, reviewerName: user?.display_name }
  }
  if (item.approval) {
    const date = eventDate(item)
    if (!date) return undefined
    const user = eventUser(item)
    return { id: eventId('approval', date, user), date, type: 'approval', reviewerUuid: user?.uuid, reviewerName: user?.display_name }
  }
  return undefined
}

function participantEvents(pr: PullRequest) {
  return (pr.participants || []).flatMap((participant) => {
    if (!participant.participated_on) return []
    const type = participant.state === 'changes_requested' ? 'changes_requested' : 'review'
    const user = participant.user
    return [{
      id: eventId(type, participant.participated_on, user),
      date: participant.participated_on,
      type,
      reviewerUuid: user?.uuid,
      reviewerName: user?.display_name,
    } satisfies ReviewHistoryEvent]
  })
}

export function buildPullRequestHistory(pr: PullRequest): ReviewHistoryPullRequest {
  const events = [
    ...(pr.activity || []).map(toReviewEvent).filter((event): event is ReviewHistoryEvent => Boolean(event)),
    ...participantEvents(pr),
  ]
  const uniqueEvents = Array.from(new Map(events.map((event) => [event.id, event])).values())
    .sort((first, second) => new Date(first.date).getTime() - new Date(second.date).getTime())
  return { id: pr.id, state: pr.state, createdAt: pr.created_on, updatedOn: pr.updated_on, title: pr.title, url: pr.links?.html?.href, events: uniqueEvents }
}

export function mergeReviewHistory(history: ReviewHistory, prs: PullRequest[], syncedAt = new Date().toISOString(), coverage: 'partial' | 'complete' = 'partial'): ReviewHistory {
  const repositories = { ...history.repositories }
  const byRepository = new Map<string, PullRequest[]>()
  prs.forEach((pr) => byRepository.set(repositoryKey(pr), [...(byRepository.get(repositoryKey(pr)) || []), pr]))

  byRepository.forEach((repositoryPrs, repository) => {
    const previous = repositories[repository]
    const pullRequests = { ...(previous?.pullRequests || {}) }
    repositoryPrs.forEach((pr) => {
      const next = buildPullRequestHistory(pr)
      const previousPullRequest = pullRequests[String(pr.id)]
      if (!previousPullRequest) {
        pullRequests[String(pr.id)] = next
        return
      }
      const events = Array.from(new Map([...previousPullRequest.events, ...next.events].map((event) => [event.id, event])).values())
        .sort((first, second) => new Date(first.date).getTime() - new Date(second.date).getTime())
      pullRequests[String(pr.id)] = { ...next, ...previousPullRequest, title: pr.title, url: pr.links?.html?.href || previousPullRequest.url, state: pr.state, updatedOn: pr.updated_on, events }
    })
    const nextCoverage = coverage === 'complete' ? 'complete' : previous?.coverage || 'partial'
    repositories[repository] = {
      syncedAt: coverage === 'complete' ? syncedAt : nextCoverage === 'complete' && previous?.coverage === 'complete' ? previous.syncedAt : syncedAt,
      coverage: nextCoverage,
      pullRequests,
    }
  })

  return { schemaVersion: 1, repositories }
}

export function markRepositoryCoverage(history: ReviewHistory, repositories: string[], coverage: 'partial' | 'complete', syncedAt = new Date().toISOString()): ReviewHistory {
  const nextRepositories = { ...history.repositories }
  repositories.forEach((repository) => {
    const previous = nextRepositories[repository]
    nextRepositories[repository] = { syncedAt, coverage, pullRequests: previous?.pullRequests || {} }
  })
  return { schemaVersion: 1, repositories: nextRepositories }
}

export function historyPullRequests(history: ReviewHistory) {
  return Object.values(history.repositories).flatMap((repository) => Object.values(repository.pullRequests))
}

export function historyPullRequestsForRepositories(history: ReviewHistory, repositories: RepoConfig[]) {
  const configuredKeys = new Set(repositories.map(configRepositoryKey))
  return Object.entries(history.repositories)
    .filter(([key]) => configuredKeys.has(key))
    .flatMap(([, repository]) => Object.values(repository.pullRequests))
}

export function historyCoverage(history: ReviewHistory) {
  const repositories = Object.values(history.repositories)
  if (!repositories.length) return 'partial' as const
  return repositories.every((repository) => repository.coverage === 'complete') ? 'complete' as const : 'partial' as const
}

export function historyCoverageForRepositories(history: ReviewHistory, repositories: RepoConfig[]) {
  if (!repositories.length) return 'complete' as const
  return repositories.every((repo) => history.repositories[configRepositoryKey(repo)]?.coverage === 'complete') ? 'complete' as const : 'partial' as const
}
