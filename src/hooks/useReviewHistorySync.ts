import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueries, type UseQueryResult } from '@tanstack/react-query'
import { getReviewHistorySnapshot } from '../lib/bitbucket'
import { repositoryKey } from '../lib/notifications'
import { historyCoverageForRepositories, markRepositoryCoverage, mergeReviewHistory } from '../lib/reviewHistory'
import { clearReviewHistory, emptyReviewHistory, getReviewHistory, saveReviewHistory } from '../lib/storage'
import type { PullRequest, RepoConfig, Session } from '../types'

type HistorySnapshot = { prs: PullRequest[]; complete: boolean }
const HISTORY_REFRESH_INTERVAL_MS = 15 * 60_000

export function useReviewHistorySync(
  prs: PullRequest[],
  repos: RepoConfig[],
  session: Session,
) {
  const [storedHistory, setStoredHistory] = useState(getReviewHistory)
  const [historyGeneration, setHistoryGeneration] = useState(0)
  const repositoryKeys = useMemo(() => repos.map(repositoryKey), [repos])
  const baseHistory = useMemo(() => mergeReviewHistory(storedHistory, prs), [prs, storedHistory])
  const baseIsComplete = historyCoverageForRepositories(baseHistory, repos) === 'complete'
  const historyIsStale = repos.some((repo) => {
    const value = baseHistory.repositories[repositoryKey(repo)]?.syncedAt
    const syncedAt = value ? new Date(value).getTime() : 0
    return !syncedAt || Date.now() - syncedAt >= HISTORY_REFRESH_INTERVAL_MS
  })
  const shouldSync = repositoryKeys.length > 0 && (!baseIsComplete || historyIsStale)

  const queries = useQueries({
    queries: repos.map((repo) => ({
      queryKey: ['review-history', historyGeneration, repo.workspace, repo.repo],
      queryFn: () => getReviewHistorySnapshot(repo, session, baseHistory.repositories[repositoryKey(repo)]?.coverage === 'complete' ? baseHistory.repositories[repositoryKey(repo)]?.pullRequests : undefined),
      enabled: shouldSync,
      staleTime: 15 * 60_000,
      refetchOnMount: true,
      refetchOnWindowFocus: false,
    })),
  }) as UseQueryResult<HistorySnapshot, Error>[]
  const queryStateVersion = queries
    .map((query) => [query.dataUpdatedAt, query.isSuccess, query.isFetching, query.isError].join(':'))
    .join('|')

  const history = useMemo(() => {
    let next = baseHistory
    const syncedAt = new Date().toISOString()
    queries.forEach((query, index) => {
      if (!query.data || !query.isSuccess || query.isFetching) return
      const coverage = query.data.complete ? 'complete' : 'partial'
      next = mergeReviewHistory(next, query.data.prs, syncedAt, coverage)
      next = markRepositoryCoverage(next, [repositoryKeys[index]], coverage, syncedAt)
    })
    return next
  }, [baseHistory, queryStateVersion, queries, repositoryKeys])

  const isComplete = historyCoverageForRepositories(history, repos) === 'complete'

  useEffect(() => {
    saveReviewHistory(history)
  }, [history])

  const refresh = useCallback(() => {
    queries.forEach((query) => void query.refetch())
  }, [queries])
  const reset = useCallback(() => {
    clearReviewHistory()
    setStoredHistory(emptyReviewHistory())
    setHistoryGeneration((generation) => generation + 1)
  }, [])

  return {
    history,
    syncing: shouldSync && queries.some((query) => query.isFetching),
    completedRepositories: queries.filter((query) => query.isSuccess && !query.isFetching).length,
    repositoryCount: repos.length,
    errorCount: queries.filter((query) => query.isError).length,
    isComplete,
    reset,
    refresh,
  }
}
