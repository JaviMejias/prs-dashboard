import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useQueries, type UseQueryResult } from '@tanstack/react-query'
import { getReviewHistorySnapshot } from '../lib/bitbucket'
import { repositoryKey } from '../lib/notifications'
import { historyCoverageForRepositories, markRepositoryCoverage, mergeReviewHistory } from '../lib/reviewHistory'
import { saveReviewHistory } from '../lib/storage'
import type { PullRequest, RepoConfig, ReviewHistory, Session } from '../types'

type HistorySnapshot = { prs: PullRequest[]; complete: boolean }
const HISTORY_REFRESH_INTERVAL_MS = 15 * 60_000

export function useReviewHistorySync(
  history: ReviewHistory,
  setHistory: Dispatch<SetStateAction<ReviewHistory>>,
  repos: RepoConfig[],
  session: Session,
) {
  const [manualSyncRequested, setManualSyncRequested] = useState(false)
  const repositoryKeys = useMemo(() => repos.map(repositoryKey), [repos])
  const isComplete = historyCoverageForRepositories(history, repos) === 'complete'
  const historyIsStale = repos.some((repo) => {
    const value = history.repositories[repositoryKey(repo)]?.syncedAt
    const syncedAt = value ? new Date(value).getTime() : 0
    return !syncedAt || Date.now() - syncedAt >= HISTORY_REFRESH_INTERVAL_MS
  })
  const shouldSync = repositoryKeys.length > 0 && (manualSyncRequested || !isComplete || historyIsStale)
  const queries = useQueries({
    queries: shouldSync ? repos.map((repo) => ({
      queryKey: ['review-history', repo.workspace, repo.repo],
      queryFn: () => getReviewHistorySnapshot(repo, session, history.repositories[repositoryKey(repo)]?.coverage === 'complete' ? history.repositories[repositoryKey(repo)]?.pullRequests : undefined),
      staleTime: manualSyncRequested ? 0 : 15 * 60_000,
      refetchOnMount: manualSyncRequested ? 'always' : true,
      refetchOnWindowFocus: false,
    })) : [],
  }) as UseQueryResult<HistorySnapshot, Error>[]
  const syncVersion = queries.map((query) => query.dataUpdatedAt).join(':')

  useEffect(() => {
    if (!shouldSync || !queries.some((query) => query.isSuccess && !query.isFetching)) return
    const syncedAt = new Date().toISOString()
    setHistory((current) => {
      let next = current
      queries.forEach((query, index) => {
        if (!query.data || !query.isSuccess || query.isFetching) return
        next = mergeReviewHistory(next, query.data.prs, syncedAt, query.data.complete ? 'complete' : 'partial')
        next = markRepositoryCoverage(next, [repositoryKeys[index]], query.data.complete ? 'complete' : 'partial', syncedAt)
      })
      if (next !== current) saveReviewHistory(next)
      return next
    })
  }, [repositoryKeys, setHistory, shouldSync, syncVersion])

  useEffect(() => {
    if (!manualSyncRequested || !queries.length || queries.some((query) => query.isFetching)) return
    setManualSyncRequested(false)
  }, [manualSyncRequested, syncVersion])

  const refresh = useCallback(() => {
    setManualSyncRequested(true)
    queries.forEach((query) => void query.refetch())
  }, [queries])

  return {
    syncing: shouldSync && queries.some((query) => query.isFetching),
    completedRepositories: queries.filter((query) => query.isSuccess && !query.isFetching).length,
    repositoryCount: repos.length,
    errorCount: queries.filter((query) => query.isError).length,
    isComplete,
    refresh,
  }
}
