import type { ActivityUser, DeveloperActivityKind, LifecycleStatus, Participant, PullRequest, PullRequestActivity, PrStatus, ReviewDecision, ReviewDecisionConfidence, ReviewDecisionReason, ReviewerState } from '../types'

const normalizeName = (name?: string) => name?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim()

const hasIdentifiableUser = (user?: ActivityUser) => Boolean(user?.uuid || user?.display_name)

const matchesActivityUser = (user: ActivityUser | undefined, participant: Participant) => {
  if (participant.user?.uuid) return user?.uuid === participant.user.uuid
  const participantName = normalizeName(participant.user?.display_name)
  return Boolean(participantName && normalizeName(user?.display_name) === participantName)
}

const matchesPullRequestAuthor = (pr: PullRequest, user?: ActivityUser) => Boolean(
  (pr.author?.uuid && user?.uuid === pr.author.uuid)
  || (pr.author?.display_name && normalizeName(user?.display_name) === normalizeName(pr.author.display_name))
  || (pr.author?.nickname && normalizeName(user?.display_name) === normalizeName(pr.author.nickname)),
)

const activityDate = (item: PullRequestActivity) => item.update?.date || item.comment?.updated_on || item.comment?.created_on || item.approval?.date

function latestReviewDate(pr: PullRequest, matchesUser: (user?: ActivityUser) => boolean) {
  const dates = [
    ...(pr.participants || [])
      .filter((participant) => matchesUser(participant.user))
      .map((participant) => participant.participated_on),
    ...(pr.activity || []).flatMap((item) => {
      if (item.comment && !item.comment.deleted && matchesUser(item.comment.user)) {
        return [item.comment.updated_on || item.comment.created_on]
      }
      if (item.approval && matchesUser(item.approval.user)) return [item.approval.date]
      return []
    }),
  ].filter((date): date is string => Boolean(date))

  return dates.sort((first, second) => new Date(second).getTime() - new Date(first).getTime())[0]
}

type ActivityEvidence = {
  hasNewActivity: boolean
  confidence: ReviewDecisionConfidence
  reason: ReviewDecisionReason
  reviewedCommit?: string
  latestCommit?: string
  latestDeveloperActivity?: DeveloperActivityKind
}

function getReviewEvidence(pr: PullRequest, reviewDate?: string, matchesUser?: (user?: ActivityUser) => boolean): ActivityEvidence {
  if (!reviewDate) return { hasNewActivity: false, confidence: 'unknown', reason: 'no_review_recorded' }

  const reviewTimestamp = new Date(reviewDate).getTime()
  const activityAfterReview = (pr.activity || []).filter((item) => {
    const date = activityDate(item)
    return Boolean(date && new Date(date).getTime() > reviewTimestamp)
  })
  const developerActivityAfterReview = activityAfterReview.filter((item) => matchesPullRequestAuthor(pr, item.update?.author || item.comment?.user))
  const hasDeveloperCommit = developerActivityAfterReview.some((item) => Boolean(item.update?.source?.commit?.hash))
  const hasDeveloperComment = developerActivityAfterReview.some((item) => Boolean(item.comment && !item.comment.deleted))
  const latestDeveloperActivity = hasDeveloperCommit && hasDeveloperComment
    ? 'commit_and_comment'
    : hasDeveloperCommit
      ? 'commit'
      : hasDeveloperComment
        ? 'comment'
        : undefined

  if (latestDeveloperActivity) {
    return {
      hasNewActivity: true,
      confidence: 'confirmed',
      reason: 'developer_activity_after_review',
      latestDeveloperActivity,
    }
  }

  const updateEvents = (pr.activity || []).filter((item) => item.update?.date)

  if (updateEvents.length) {
    const knownUpdates = updateEvents
      .filter((item) => item.update?.source?.commit?.hash)
      .sort((first, second) => new Date(first.update!.date!).getTime() - new Date(second.update!.date!).getTime())
    const updatesBeforeReview = knownUpdates.filter((item) => new Date(item.update!.date!).getTime() <= reviewTimestamp)
    const baseline = updatesBeforeReview[updatesBeforeReview.length - 1]?.update?.source?.commit?.hash
    const latestCommit = knownUpdates[knownUpdates.length - 1]?.update?.source?.commit?.hash

    if (!baseline) {
      if (!knownUpdates.length) return { hasNewActivity: false, confidence: 'unknown', reason: 'activity_incomplete', latestCommit }
      const latestReviewerActivity = matchesUser ? latestReviewDate(pr, matchesUser) : undefined
      const hasNewTimestamp = new Date(pr.updated_on).getTime() > reviewTimestamp
      if (latestReviewerActivity && new Date(latestReviewerActivity).getTime() >= new Date(pr.updated_on).getTime()) return { hasNewActivity: false, confidence: 'inferred', reason: 'reviewer_activity_after_review', latestCommit }
      return { hasNewActivity: hasNewTimestamp, confidence: hasNewTimestamp ? 'inferred' : 'unknown', reason: hasNewTimestamp ? 'updated_after_review' : 'activity_incomplete', latestCommit }
    }

    const hasNewCommit = knownUpdates.some((item) => {
      const update = item.update
      return Boolean(update
        && new Date(update.date!).getTime() > reviewTimestamp
        && update.source?.commit?.hash !== baseline
        && hasIdentifiableUser(update.author)
        && (matchesPullRequestAuthor(pr, update.author) || (!pr.author?.uuid && !pr.author?.display_name && !pr.author?.nickname && !matchesUser?.(update.author))))
    })
    return {
      hasNewActivity: hasNewCommit,
      confidence: 'confirmed',
      reason: hasNewCommit ? 'new_commit_after_review' : 'same_commit_after_review',
      reviewedCommit: baseline,
      latestCommit,
    }
  }

  const postReviewReviewActivity = (pr.activity || []).some((item) => {
    const date = item.comment?.updated_on || item.comment?.created_on || item.approval?.date
    return Boolean(date && new Date(date).getTime() > reviewTimestamp && (item.comment || item.approval))
  })
  if (postReviewReviewActivity) return { hasNewActivity: false, confidence: 'inferred', reason: 'reviewer_activity_after_review' }

  const latestReviewerActivity = matchesUser ? latestReviewDate(pr, matchesUser) : undefined
  if (latestReviewerActivity && new Date(latestReviewerActivity).getTime() >= new Date(pr.updated_on).getTime()) return { hasNewActivity: false, confidence: 'inferred', reason: 'reviewer_activity_after_review' }
  const hasNewTimestamp = new Date(pr.updated_on).getTime() > reviewTimestamp
  return { hasNewActivity: hasNewTimestamp, confidence: 'inferred', reason: hasNewTimestamp ? 'updated_after_review' : 'same_commit_after_review' }
}

type DecisionEvidence = Pick<ReviewDecision, 'reviewDate' | 'reviewedCommit' | 'latestCommit' | 'latestDeveloperActivity'>
const decision = (status: PrStatus, reason: ReviewDecisionReason, confidence: ReviewDecisionConfidence, evidence: Partial<DecisionEvidence> = {}): ReviewDecision => ({ status, reason, confidence, ...evidence })

export function getLifecycleStatus(pr: PullRequest): LifecycleStatus {
  if (pr.state === 'MERGED') return 'MERGED'
  if (pr.state === 'DECLINED') return 'DECLINED'
  if (pr.queued) return 'QUEUED'
  if (pr.draft) return 'DRAFT'
  return 'OPEN'
}

export function getReviewerState(pr: PullRequest, displayName: string, uuid?: string): ReviewerState | null {
  const matchesUser = (user?: ActivityUser) => Boolean(
    (uuid && user?.uuid === uuid)
    || normalizeName(user?.display_name) === normalizeName(displayName),
  )
  const participant = pr.participants?.find((item) => matchesUser(item.user))
  const reviewDate = latestReviewDate(pr, matchesUser)

  if (!reviewDate) return null
  if (getReviewEvidence(pr, reviewDate, matchesUser).hasNewActivity) return 'changes'
  if (participant?.state === 'changes_requested') return 'waiting'
  if (participant?.approved) return 'approved'
  return 'reviewed'
}

export function isFreshPullRequest(pr: PullRequest) {
  const hasParticipantReview = pr.participants?.some((participant) => Boolean(participant.participated_on || participant.approved || participant.state))
  const hasReviewActivity = pr.activity?.some((item) => !item.comment?.deleted && Boolean(item.comment || item.approval))
  return !hasParticipantReview && !hasReviewActivity
}

export function getReviewDecision(pr: PullRequest, myUuid?: string, myDisplayName?: string): ReviewDecision {
  if (pr.state === 'MERGED') return decision('merged', 'merged', 'confirmed')
  if (pr.state === 'DECLINED') return decision('declined', 'declined', 'confirmed')

  const waitingForDeveloper = pr.participants?.some((participant) => {
    if (participant.state !== 'changes_requested') return false
    const matchesReviewer = (user?: ActivityUser) => matchesActivityUser(user, participant)
    return !getReviewEvidence(pr, latestReviewDate(pr, matchesReviewer), matchesReviewer).hasNewActivity
  })
  if (waitingForDeveloper) return decision('waiting', 'waiting_for_developer', 'confirmed')
  if (!myUuid && !myDisplayName) return decision('unreviewed', 'reviewer_not_identified', 'unknown')

  const matchesUser = (user?: ActivityUser) => Boolean(
    (myUuid && user?.uuid === myUuid)
    || (myDisplayName && normalizeName(user?.display_name) === normalizeName(myDisplayName)),
  )
  const participant = pr.participants?.find((item) => matchesUser(item.user))
  const reviewDate = latestReviewDate(pr, matchesUser)

  if (!reviewDate) return decision('unreviewed', isFreshPullRequest(pr) ? 'new_pr' : 'no_review_recorded', isFreshPullRequest(pr) ? 'confirmed' : 'unknown')
  const evidence = getReviewEvidence(pr, reviewDate, matchesUser)
  if (evidence.hasNewActivity) return decision('changes', evidence.reason, evidence.confidence, { reviewDate, reviewedCommit: evidence.reviewedCommit, latestCommit: evidence.latestCommit, latestDeveloperActivity: evidence.latestDeveloperActivity })
  if (participant?.state === 'changes_requested') return decision('waiting', 'waiting_for_developer', evidence.confidence, { reviewDate, reviewedCommit: evidence.reviewedCommit, latestCommit: evidence.latestCommit })
  return decision('current', evidence.reason, evidence.confidence, { reviewDate, reviewedCommit: evidence.reviewedCommit, latestCommit: evidence.latestCommit })
}

export function classifyPr(pr: PullRequest, myUuid?: string, myDisplayName?: string) {
  return getReviewDecision(pr, myUuid, myDisplayName).status
}
