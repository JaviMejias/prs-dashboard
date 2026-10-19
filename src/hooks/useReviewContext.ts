import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getReviewContextDetails, type ReviewContextDetails } from '../lib/bitbucket'
import { buildReviewContext } from '../lib/reviewContext'
import { sessionCacheKey } from '../lib/queryIdentity'
import { resolveRulepacksForRepository } from '../lib/rulepacks'
import { usePreparationData } from './usePreparationSettings'
import type { PullRequest, Session } from '../types'

export function reviewContextQuery(pr: PullRequest, session: Session, enabled = true) {
  return {
    queryKey: ['review-context', sessionCacheKey(session), pr.repo.workspace, pr.repo.repo, pr.id, pr.updated_on],
    queryFn: ({ signal }: { signal: AbortSignal }) => getReviewContextDetails(pr, session, signal),
    enabled,
    retry: false,
    networkMode: 'always' as const,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  }
}

export function useReviewContext(pr: PullRequest, session: Session, enabled = true) {
  const query = useQuery(reviewContextQuery(pr, session, enabled))
  const { customRules } = usePreparationData()
  const resolved = useMemo(() => resolveRulepacksForRepository(pr.repo, customRules), [customRules, pr.repo])
  const buildContext = (details: ReviewContextDetails) => buildReviewContext(pr, session, { ...details, unavailable: [...details.unavailable, ...resolved.unavailable] }, resolved.rulepacks, resolved.rules)
  return { query, context: query.data ? buildContext(query.data) : null, buildContext }
}
