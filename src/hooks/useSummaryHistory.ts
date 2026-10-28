import { queryOptions, useQueries, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { getReviewHistoryForRange } from '../lib/bitbucket'
import { historyYears, importHistoryChunk, type HistoryImportMode, type HistoryImportSnapshot, type HistoryYear } from '../lib/historyImport'
import type { SummaryActivityLoader } from '../lib/bitbucket'
import { localDate, type DateRange } from '../lib/dateRange'
import { PULL_REQUEST_POLL_INTERVAL_MS } from '../lib/notifications'
import {
  buildSummaryMonth, combineSummaryMonths, readSummaryMonth, runSummaryJob, saveSummaryMonth,
  summaryMonthKey, summaryMonths, summaryRepositoryKey, summaryScope,
} from '../lib/summaryHistory'
import type { SummaryMonth, SummaryMonthSnapshot } from '../lib/summaryHistory'
import type { RepoConfig, Session } from '../types'

export function historicalImportQuery(client: QueryClient, repo: RepoConfig, session: Session, year: HistoryYear, enabled = true, mode?: HistoryImportMode) {
  const queryKey = ['summary-import-v2', ...summaryScope(session), summaryRepositoryKey(repo), year.year]
  let intent = mode
  return queryOptions({
    queryKey,
    queryFn: ({ signal }) => {
      const nextMode = intent
      intent = undefined
      const target = year.year === new Date().getFullYear() ? { ...year, to: localDate(new Date()) } : year
      return importHistoryChunk(repo, session, target, {
        signal, mode: nextMode,
        onProgress: (snapshot) => client.setQueryData(queryKey, snapshot),
      })
    },
    enabled, staleTime: Infinity, gcTime: 60 * 60_000, retry: false, networkMode: 'always',
    refetchOnWindowFocus: false,
    refetchOnMount: (query) => query.state.data?.status === 'pending' || Boolean(query.state.data && query.state.data.status === 'complete'
      && (query.state.data.through < year.to || year.year === new Date().getFullYear() && Date.now() - query.state.data.updatedAt >= PULL_REQUEST_POLL_INTERVAL_MS)),
    refetchInterval: (query) => !enabled ? false : query.state.data?.status === 'pending' ? 1_000
      : query.state.data?.status === 'complete' && year.year === new Date().getFullYear() ? PULL_REQUEST_POLL_INTERVAL_MS : false,
  })
}

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
  const jobs = repos.flatMap((repo) => historyYears(range).map((year) => ({ repo, year })))
  const queries = useQueries({ queries: jobs.map(({ repo, year }) => historicalImportQuery(client, repo, session, year, enabled)) })
  const entries = jobs.map(({ repo, year }, index) => {
    const data = queries[index].data
    return { repo, snapshot: data ? {
      schemaVersion: 1 as const, range: { ...year, month: String(year.year) }, fetchedAt: data.updatedAt,
      complete: data.status === 'complete', pullRequests: data.pullRequests,
    } : undefined }
  })
  const legacy = repos.flatMap((repo) => summaryMonths(range).filter((month) => !jobs.some((job, index) => summaryRepositoryKey(job.repo) === summaryRepositoryKey(repo)
    && job.year.year === Number(month.month.slice(0, 4)) && queries[index].data?.status === 'complete'))
    .map((month) => ({ repo, snapshot: readSummaryMonth(scope, repo, month) })))
  const history = combineSummaryMonths([...legacy.filter((entry) => entry.snapshot), ...entries])
  const syncing = enabled && queries.some((query) => query.isFetching || query.isPending || query.data?.status === 'pending')
  const completedPeriods = queries.filter((query, index) => query.data?.status === 'complete' && query.data.through >= jobs[index].year.to).length
  const isComplete = jobs.length > 0 && completedPeriods === jobs.length
  const hasData = Object.values(history.repositories).some((repository) => Object.keys(repository.pullRequests).length > 0)
  const run = (mode: HistoryImportMode) => Promise.all(jobs.map(({ repo, year }) => client.fetchQuery({ ...historicalImportQuery(client, repo, session, year, enabled, mode), staleTime: 0 })))
  const refresh = () => run('refresh')
  const reload = () => run('reload')
  const pause = async () => {
    const snapshots = jobs.map(({ repo, year }) => {
      const key = historicalImportQuery(client, repo, session, year).queryKey
      return { key, data: client.getQueryData<HistoryImportSnapshot>(key), through: year.to }
    })
    await Promise.all(snapshots.map(({ key }) => client.cancelQueries({ queryKey: key, exact: true })))
    snapshots.forEach(({ key, data, through }) => {
      if (data?.status !== 'complete') client.setQueryData(key, {
        ...(data || { phase: 'listing', pullRequests: {}, processed: 0, total: 0, pages: 0, persisted: true, updatedAt: Date.now(), through }),
        status: 'paused', error: 'Importación pausada. Puedes reanudar sin perder el avance.',
      })
    })
  }
  const problems = jobs.flatMap(({ repo, year }, index) => {
    const query = queries[index]
    const message = query.data?.error || query.error?.message
    return message ? [`${summaryRepositoryKey(repo)} · ${year.year}: ${message}`] : []
  })
  return {
    history, syncing, completedPeriods, periodCount: jobs.length, isComplete, hasData,
    errorCount: problems.length, problems,
    persistenceFailed: queries.some((query) => query.data?.persisted === false),
    processed: queries.reduce((total, query) => total + (query.data?.processed || 0), 0),
    discovered: queries.reduce((total, query) => total + (query.data?.total || 0), 0),
    listing: queries.some((query) => !query.data || query.data.phase === 'listing'),
    retryAt: Math.max(0, ...queries.map((query) => query.data?.retryAt || 0)),
    refresh, reload, pause,
  }
}
