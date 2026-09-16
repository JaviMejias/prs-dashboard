export type RepositoryTechnology = { id: string; name: string; version: string; kind: 'language' | 'framework' | 'library' }
export type RepoConfig = { workspace: string; repo: string; technologies?: RepositoryTechnology[]; ruleRefs?: string[]; rulepackRefs?: string[] }
export type Session = { email: string; token: string; expiresAt: number; uuid?: string; displayName?: string }
export type BitbucketUser = { uuid: string; display_name: string }
export type ActivityUser = { uuid?: string; display_name?: string }
export type Participant = { user?: ActivityUser; approved?: boolean; state?: string; participated_on?: string }
export type PullRequestActivity = { pull_request?: { id?: number }; comment?: { created_on?: string; updated_on?: string; deleted?: boolean; user?: ActivityUser }; approval?: { date?: string; user?: ActivityUser }; update?: { date?: string; author?: ActivityUser; state?: string; source?: { commit?: { hash?: string } } } }
export type PullRequest = { id: number; title: string; description?: string; state: 'OPEN' | 'MERGED' | 'DECLINED'; draft?: boolean; queued?: boolean; created_on: string; updated_on: string; author?: { uuid?: string; display_name?: string; nickname?: string; links?: { avatar?: { href?: string } } }; source?: { branch?: { name?: string }; repository?: { full_name?: string; links?: { html?: { href?: string } } } }; destination?: { branch?: { name?: string }; repository?: { full_name?: string; links?: { html?: { href?: string } } } }; links?: { html?: { href?: string } }; comment_count?: number; participants?: Participant[]; activity?: PullRequestActivity[]; repo: RepoConfig }
export type PrStatus = 'unreviewed' | 'changes' | 'waiting' | 'current' | 'merged' | 'declined'
export type ReviewDecisionReason = 'new_pr' | 'no_review_recorded' | 'reviewer_not_identified' | 'new_commit_after_review' | 'same_commit_after_review' | 'reviewer_activity_after_review' | 'updated_after_review' | 'waiting_for_developer' | 'merged' | 'declined' | 'activity_incomplete'
export type ReviewDecisionConfidence = 'confirmed' | 'inferred' | 'unknown'
export type ReviewDecision = { status: PrStatus; reason: ReviewDecisionReason; confidence: ReviewDecisionConfidence; reviewDate?: string; reviewedCommit?: string; latestCommit?: string }
export type ReviewerState = 'approved' | 'waiting' | 'reviewed' | 'changes'
export type LifecycleStatus = 'OPEN' | 'DRAFT' | 'QUEUED' | 'MERGED' | 'DECLINED'
export type PrStats = { commits: number; files: number; added: number; removed: number }
export type NoticeKind = 'new-pr' | 'review-required'
export type NoticeAction = 'abrió' | 'actualizó'
export type Notice = {
  id: string
  text: string
  createdAt: number
  read: boolean
  kind: NoticeKind
  actorName: string
  actorUrl?: string
  action: NoticeAction
  pullRequestTitle: string
  pullRequestUrl?: string
  repositoryName: string
  pullRequestId: number
  pullRequestKey?: string
}
export type NotificationSnapshotEntry = { updatedOn: string; needsReview: boolean }
export type NotificationSnapshot = Record<string, string | NotificationSnapshotEntry>
export type NotificationPreferences = { desktop: boolean; sound: boolean; title: boolean }
export type ReviewHistoryEventType = 'comment' | 'approval' | 'review' | 'changes_requested'
export type ReviewHistoryEvent = { id: string; date: string; type: ReviewHistoryEventType; reviewerUuid?: string; reviewerName?: string; commitHash?: string }
export type ReviewHistoryPullRequest = { id: number; state: PullRequest['state']; createdAt: string; updatedOn: string; title?: string; url?: string; events: ReviewHistoryEvent[] }
export type ReviewHistoryRepository = { syncedAt: string; coverage: 'partial' | 'complete'; pullRequests: Record<string, ReviewHistoryPullRequest> }
export type ReviewHistory = { schemaVersion: 1; repositories: Record<string, ReviewHistoryRepository> }
export type IgnoreRules = { authors: string[]; pullRequests: string[] }
export type DeveloperRemote = { id: string; displayName: string; remote: string }
export type RepositoryRemote = { id: string; repository: string; remote: string }
export type GitWorkflowSettings = { developerRemotes: DeveloperRemote[]; repositoryRemotes: RepositoryRemote[]; syncRemotesConfirmed: boolean }
export type ReviewContextCommit = { hash: string; message: string; author?: string; date?: string; url?: string }
export type ReviewContextFile = { path: string; status?: string; additions?: number; deletions?: number; changeType?: string }
export type ReviewContextComment = { author?: string; date?: string; content: string; path?: string; line?: number; url?: string }
export type ReviewContextActivity = { type: 'created' | 'updated' | 'comment' | 'approval' | 'changes'; date: string; actor?: string; summary: string }
export type ReviewContextDiffstat = { files: number; additions: number; deletions: number; totalChanges: number }
export type ReviewContextReviewState = { isNew: boolean; requiresReview: boolean; isRevisit: boolean; status: PrStatus; lastRelevantActivity?: ReviewContextActivity }
export type RuleCategory = 'general' | 'technology' | 'framework' | 'project'
export type ReviewRule = { id: string; name: string; category: RuleCategory; description: string; version?: string; technology?: string; content: string; source: 'git' | 'local'; rulepackId?: string; sources?: string[] }
export type Rulepack = { id: string; name: string; version: string; description: string; reviewRules: string; testing?: string; references?: string[]; source: 'git' | 'local'; category?: RuleCategory; technology?: string }
export type AppliedRulepack = Rulepack & { reviewRulesContent: string; testingContent?: string; referenceContents: Array<{ path: string; content: string }> }
export type AppliedReviewRule = ReviewRule & { reference: string }
export type ReviewContext = {
  schemaVersion: 1
  repository: { workspace: string; repository: string; friendlyName?: string; url?: string; technologies?: RepositoryTechnology[] }
  pullRequest: { id: number; title: string; description?: string; state: LifecycleStatus; draft: boolean; author?: { name?: string; uuid?: string; url?: string }; sourceBranch?: string; targetBranch?: string; createdAt: string; updatedAt: string; url?: string }
  reviewState: ReviewContextReviewState
  commits: ReviewContextCommit[]
  changedFiles: ReviewContextFile[]
  diffstat: ReviewContextDiffstat
  comments: ReviewContextComment[]
  activity: ReviewContextActivity[]
  unavailable: string[]
  rulepacks: AppliedRulepack[]
  rules: AppliedReviewRule[]
}
