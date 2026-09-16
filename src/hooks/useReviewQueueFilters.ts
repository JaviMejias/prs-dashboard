import { useMemo } from 'react'
import {
  comparePullRequests,
  getLifecycleCounts,
  matchesReviewFilter,
  requiresReview,
} from '../lib/dashboard'
import { getLifecycleStatus } from '../lib/pullRequestReviewState'
import type { LifecycleFilter, ReviewFilter } from '../lib/dashboard'
import type { PullRequest, Session } from '../types'

export function useReviewQueueFilters({
  allPrs,
  session,
  filterRepo,
  filterLifecycle,
  filterReview,
  visibleLimit,
}: {
  allPrs: PullRequest[]
  session: Session | null
  filterRepo: string
  filterLifecycle: LifecycleFilter
  filterReview: ReviewFilter
  visibleLimit: number
}) {
  const repoPrs = useMemo(() => allPrs.filter((pr) => filterRepo === 'all' || `${pr.repo.workspace}/${pr.repo.repo}` === filterRepo), [allPrs, filterRepo])
  const statusCounts = useMemo(() => getLifecycleCounts(repoPrs), [repoPrs])
  const sortedPrs = useMemo(() => repoPrs
    .filter((pr) => (filterLifecycle === 'ALL' || getLifecycleStatus(pr) === filterLifecycle)
      && matchesReviewFilter(pr, filterReview, session?.uuid, session?.displayName))
    .sort((first, second) => comparePullRequests(first, second, session?.uuid, session?.displayName)), [filterLifecycle, filterReview, repoPrs, session?.displayName, session?.uuid])
  const visiblePrs = sortedPrs.slice(0, visibleLimit)
  const reviewCount = repoPrs.filter((pr) => requiresReview(pr, session?.uuid, session?.displayName)).length

  return { repoPrs, statusCounts, sortedPrs, visiblePrs, reviewCount }
}
