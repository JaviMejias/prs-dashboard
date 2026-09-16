import { useMemo } from 'react'
import { useQueries, type UseQueryResult } from '@tanstack/react-query'
import { getPullRequests } from '../lib/bitbucket'
import { PULL_REQUEST_POLL_INTERVAL_MS, repositoryKey } from '../lib/notifications'
import type { PullRequest, RepoConfig, Session } from '../types'

export function usePullRequestQueue(session: Session | null, repos: RepoConfig[]) {
  const queries = useQueries({
    queries: session ? repos.map((repo) => ({
      queryKey: ['prs-v2', repo.workspace, repo.repo],
      queryFn: () => getPullRequests(repo, session),
      refetchInterval: PULL_REQUEST_POLL_INTERVAL_MS,
      refetchIntervalInBackground: true,
      staleTime: 10_000,
    })) : [],
  }) as UseQueryResult<PullRequest[], Error>[]

  const allPrs = useMemo(() => Array.from(new Map(
    queries
      .flatMap((query) => query.data || [])
      .map((pr) => [`${pr.repo.workspace}/${pr.repo.repo}#${pr.id}`, pr]),
  ).values()), [queries])
  const fetching = queries.some((query) => query.isFetching)
  const fetchedRepositories = queries.filter((query) => query.isFetched).length
  const initialLoading = queries.length > 0 && fetchedRepositories < queries.length
  const loadingProgress = queries.length ? (fetchedRepositories / queries.length) * 100 : 0
  const errors = queries.filter((query) => query.isError)
  const initialSyncComplete = queries.length > 0 && queries.every((query) => query.isFetched)
  const syncVersion = queries.map((query) => query.dataUpdatedAt).join(':')
  const successfulRepositoryKeys = repos
    .filter((_, index) => queries[index]?.isSuccess)
    .map(repositoryKey)
    .join('|')
  const latestSync = Math.max(0, ...queries.map((query) => query.dataUpdatedAt))

  return {
    queries,
    allPrs,
    fetching,
    fetchedRepositories,
    initialLoading,
    loadingProgress,
    errors,
    initialSyncComplete,
    syncVersion,
    successfulRepositoryKeys,
    latestSync,
  }
}
