import { queryOptions, useQueries, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { getReviewHistoryForRange } from '../lib/bitbucket'
import type { SummaryActivityLoader } from '../lib/bitbucket'
import { localDate, type DateRange } from '../lib/dateRange'
import { PULL_REQUEST_POLL_INTERVAL_MS } from '../lib/notifications'
import {
  buildSummaryMonth, combineSummaryMonths, readSummaryMonth, runSummaryJob, saveSummaryMonth,
  summaryMonthKey, summaryMonths, summaryRepositoryKey, summaryScope,
} from '../lib/summaryHistory'
import type { SummaryMonth, SummaryMonthSnapshot } from '../lib/summaryHistory'
import type { RepoConfig, Session } from '../types'

export function summaryMonthQuery(client: QueryClient, repo: RepoConfig, session: Session, month: SummaryMonth, enabled = true) {
  const scope = summaryScope(session)
  const activityPrefix = ['summary-activity-v1', ...scope]
  let stored: SummaryMonthSnapshot | undefined
  let storageRead = false
  const readStored = () => {
    if (!storageRead) { stored = readSummaryMonth(scope, repo, month); storageRead = true }
    return stored
  }
  const loadActivity: SummaryActivityLoader = (pr, load) => {
    const queryKey = [...activityPrefix, summaryRepositoryKey(pr.repo), pr.id, pr.updated_on]
    const cached = client.getQueryData<{ complete: boolean }>(queryKey)
    return client.fetchQuery({ queryKey, queryFn: load, staleTime: cached?.complete ? Infinity : 0, gcTime: 60 * 60_000, retry: false })
  }
  return queryOptions({
      queryKey: summaryMonthKey(scope, repo, month),
      queryFn: () => runSummaryJob(async () => {
        const result = await getReviewHistoryForRange(repo, session, month, loadActivity)
        let snapshot = buildSummaryMonth(result.prs, month, result.complete)
        const previous = client.getQueryData<SummaryMonthSnapshot>(summaryMonthKey(scope, repo, month)) || readStored()
        // A capped read must not erase an already available snapshot.
        if (!result.complete && previous) snapshot = { ...previous, range: month, complete: false }
        // Save inside the job: navigation can unmount the observer before this finishes.
        const persisted = saveSummaryMonth(scope, repo, snapshot)
        return { ...snapshot, persisted }
      }),
      initialData: () => { const value = readStored(); return value && value.range.to >= month.to ? value : undefined },
      initialDataUpdatedAt: () => readStored()?.fetchedAt,
      placeholderData: () => readStored(),
      enabled,
      staleTime: Infinity,
      gcTime: 60 * 60_000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: enabled,
      refetchInterval: enabled && month.month === localDate(new Date()).slice(0, 7) ? PULL_REQUEST_POLL_INTERVAL_MS : false as const,
      retry: false,
  })
}

export function useSummaryHistory(repos: RepoConfig[], session: Session, range: DateRange, enabled = true) {
  const client = useQueryClient()
  const scope = summaryScope(session)
  const jobs = repos.flatMap((repo) => summaryMonths(range).map((month) => ({ repo, month })))
  const queries = useQueries({ queries: jobs.map(({ repo, month }) => summaryMonthQuery(client, repo, session, month, enabled)) })
  const history = combineSummaryMonths(jobs.map(({ repo }, index) => ({ repo, snapshot: queries[index].data })))
  const syncing = queries.some((query) => query.isFetching || (enabled && query.isPending))
  const completedPeriods = queries.filter((query) => query.data?.complete && !query.isPlaceholderData).length
  const isComplete = completedPeriods === jobs.length
  const hasData = queries.some((query) => Boolean(query.data))
  const refresh = () => Promise.all(queries.map((query) => query.refetch()))
  const reload = async () => {
    await client.invalidateQueries({ queryKey: ['summary-activity-v1', ...scope], refetchType: 'none' })
    return refresh()
  }
  return {
    history, syncing, completedPeriods, periodCount: jobs.length, isComplete, hasData,
    errorCount: queries.filter((query) => query.isError).length,
    persistenceFailed: queries.some((query) => query.data && 'persisted' in query.data && query.data.persisted === false),
    refresh, reload,
  }
}
