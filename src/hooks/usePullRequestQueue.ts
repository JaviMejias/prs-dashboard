import { useMemo } from 'react'
import { queryOptions, useQueries, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { BitbucketRequestError, getPullRequests } from '../lib/bitbucket'
import type { LifecycleFilter } from '../lib/dashboard'
import { PULL_REQUEST_POLL_INTERVAL_MS, repositoryKey } from '../lib/notifications'
import { sessionCacheKey } from '../lib/queryIdentity'
import type { PullRequest, RepoConfig, Session } from '../types'

const pullRequestStates = ['OPEN', 'MERGED', 'DECLINED'] as const
export type RepositorySyncError = { repository: string; state: PullRequest['state']; message: string }

export function pullRequestQueueQuery(client: QueryClient, session: Session, repo: RepoConfig, state: PullRequest['state'], enabled = true) {
  const queryKey = ['prs-v3', sessionCacheKey(session), repo.workspace, repo.repo, state]
  return queryOptions({
    queryKey,
    queryFn: async ({ signal }) => {
      try {
        return await getPullRequests(repo, session, {
          state, signal, previousPullRequests: client.getQueryData<PullRequest[]>(queryKey),
          loadActivity: (pr, load) => client.fetchQuery({
            queryKey: ['queue-activity-v1', sessionCacheKey(session), repo.workspace, repo.repo, pr.id, pr.updated_on],
            queryFn: load, staleTime: Infinity, gcTime: 60 * 60_000, retry: false,
          }),
        })
      } catch (reason) {
        if (!signal.aborted) {
          console.warn('No se pudo sincronizar el repositorio de Bitbucket', {
            repository: repositoryKey(repo), state,
            operation: reason instanceof BitbucketRequestError ? reason.operation : 'Sincronización',
            status: reason instanceof BitbucketRequestError ? reason.status : undefined,
            message: reason instanceof BitbucketRequestError ? reason.message : 'No se pudo completar la sincronización.',
          })
        }
        throw reason
      }
    },
    enabled,
    refetchInterval: enabled ? PULL_REQUEST_POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    retry: false,
  })
}

export function usePullRequestQueue(session: Session | null, repos: RepoConfig[], lifecycle: LifecycleFilter = 'OPEN') {
  const client = useQueryClient()
  const jobs = useMemo(() => session ? repos.flatMap((repo) => pullRequestStates.map((state) => ({
    repo, state, enabled: state === 'OPEN' || lifecycle === 'ALL' || lifecycle === state,
  }))) : [], [session, repos, lifecycle])
  const results = useQueries({ queries: jobs.map(({ repo, state, enabled }) => pullRequestQueueQuery(client, session!, repo, state, enabled)) })
  const queries = results.filter((_, index) => jobs[index].enabled)
  const openQueries = results.filter((_, index) => jobs[index].state === 'OPEN')
  const allPrs = useMemo(() => {
    const latest = new Map<string, PullRequest>()
    results.forEach((query, index) => query.data?.forEach((pr) => {
      const key = `${repositoryKey(pr.repo)}#${pr.id}`
      const previous = latest.get(key)
      if (!previous || Date.parse(pr.updated_on) > Date.parse(previous.updated_on)) latest.set(key, { ...pr, repo: jobs[index].repo })
    }))
    return Array.from(latest.values())
  }, [results, jobs])
  const fetching = queries.some((query) => query.isFetching)
  const fetchedRepositories = repos.filter((repo) => jobs.every((job, index) => repositoryKey(job.repo) !== repositoryKey(repo) || !job.enabled || results[index].isFetched)).length
  const initialLoading = fetchedRepositories < repos.length
  const loadingProgress = repos.length ? (fetchedRepositories / repos.length) * 100 : 0
  const repositoryErrors: RepositorySyncError[] = jobs.flatMap((job, index) => {
    const query = results[index]
    return job.enabled && query.isError ? [{ repository: repositoryKey(job.repo), state: job.state, message: query.error.message }] : []
  })
  const errorCount = new Set(repositoryErrors.map((error) => error.repository)).size
  const initialSyncComplete = openQueries.length > 0 && openQueries.every((query) => query.isFetched)
  const syncVersion = openQueries.map((query) => query.dataUpdatedAt).join(':')
  const successfulRepositoryKeys = repos.filter((_, index) => openQueries[index]?.isSuccess).map(repositoryKey).join('|')
  const latestSync = Math.max(0, ...queries.map((query) => query.dataUpdatedAt))
  const loadedLifecycles = new Set<LifecycleFilter>()
  for (const state of pullRequestStates) {
    if (results.some((query, index) => jobs[index].state === state && query.data !== undefined)
      && results.every((query, index) => jobs[index].state !== state || query.data !== undefined)) loadedLifecycles.add(state)
  }
  if (loadedLifecycles.has('OPEN')) { loadedLifecycles.add('DRAFT'); loadedLifecycles.add('QUEUED') }
  if (pullRequestStates.every((state) => loadedLifecycles.has(state))) loadedLifecycles.add('ALL')

  return {
    queries, allPrs, fetching, fetchedRepositories, initialLoading, loadingProgress,
    repositoryErrors, errorCount, initialSyncComplete, syncVersion, successfulRepositoryKeys, latestSync,
    loadedLifecycles,
    allRepositoriesFailed: repos.length > 0 && errorCount === repos.length && !fetching,
  }
}
