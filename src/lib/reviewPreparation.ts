import { getReviewContextDetails, type ReviewContextDetails } from './bitbucket'
import { buildReviewContext } from './reviewContext'
import { resolveRulepacksForRepository } from './rulepacks'
import { getCustomRules } from './storage'
import type { GitWorkflowSettings, PullRequest, Session } from '../types'

export const reviewDetailsQuery = (pr: PullRequest, session: Session) => ({
  queryKey: ['review-context-v2', session.uuid || session.email, pr.repo.workspace, pr.repo.repo, pr.id, pr.updated_on, pr.source?.commit?.hash, pr.destination?.commit?.hash],
  queryFn: () => getReviewContextDetails(pr, session),
  staleTime: 0,
})

export function prepareReviewContext(pr: PullRequest, session: Session, settings: GitWorkflowSettings, details: ReviewContextDetails) {
  const resolved = resolveRulepacksForRepository(pr.repo, getCustomRules())
  return buildReviewContext(pr, session, { ...details, unavailable: [...details.unavailable, ...resolved.unavailable] }, resolved.rulepacks, resolved.rules, settings)
}
