import { forwardRef } from 'react'
import { m, useReducedMotion } from 'framer-motion'
import {
  CheckCircle2,
  CircleSlash2,
  Clock3,
  ExternalLink,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  GitMerge,
  ScanEye,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import Avatar from './Avatar'
import { getLifecycleStatus, getReviewDecision } from '../lib/pullRequestReviewState'
import { hasPersonalAccess } from '../lib/accountAccess'
import {
  displayName,
  getHandoffMessage,
  getReviewDecisionDetail,
  getReviewLabel,
  isIgnoredPullRequest,
  lifecycleLabels,
  pullRequestKey,
  relativeTime,
} from '../lib/dashboard'
import { safeBitbucketUrl } from '../lib/externalLinks'
import LocalReviewGuide from './LocalReviewGuide'
import PullRequestMenu from './PullRequestMenu'
import PullRequestStats from './PullRequestStats'
import ReviewerPopover from './ReviewerPopover'
import type { GitWorkflowSettings, PrStatus, PullRequest, Session } from '../types'

const statusIcons = {
  unreviewed: ScanEye,
  changes: GitCompareArrows,
  waiting: Clock3,
  current: CheckCircle2,
  merged: GitMerge,
  declined: CircleSlash2,
} satisfies Record<PrStatus, typeof ScanEye>

function PullRequestPrimary({ pr, session, status, lifecycle, ignored, reviewDecision, titleId, gitWorkflowSettings, onGitWorkflowSettingsChange, onOpenSettings }: {
  pr: PullRequest
  session: Session
  status: PrStatus
  lifecycle: ReturnType<typeof getLifecycleStatus>
  ignored: boolean
  reviewDecision: ReturnType<typeof getReviewDecision>
  titleId: string
  gitWorkflowSettings: GitWorkflowSettings
  onGitWorkflowSettingsChange: (settings: GitWorkflowSettings) => void
  onOpenSettings: () => void
}) {
  const isNew = reviewDecision.reason === 'new_pr'
  const StatusIcon = isNew ? Sparkles : statusIcons[status]
  const handoff = getHandoffMessage(pr, status)
  const authorName = displayName(pr.author?.display_name || pr.author?.nickname)
  const sourceRepositoryUrl = safeBitbucketUrl(pr.source?.repository?.links?.html?.href)
  const pullRequestUrl = safeBitbucketUrl(pr.links?.html?.href)
  return <div className="pr-primary">
    <div className="pr-heading-row"><span className={`qa-status qa-${ignored ? 'ignored' : status}`}><StatusIcon size={15} />{getReviewLabel(pr, status)}</span><span className={`lifecycle-status lifecycle-${lifecycle.toLowerCase()}`}><span />{lifecycleLabels[lifecycle]}</span><time dateTime={pr.updated_on} className="updated-time"><Clock3 size={13} /> Actualizado {relativeTime(pr.updated_on)}</time></div>
    {pullRequestUrl ? <a className="pr-title-link" href={pullRequestUrl} target="_blank" rel="noreferrer" title={pr.title} onClick={() => toast(`Abriendo PR #${pr.id}`, { id: `open-pr-${pr.repo.workspace}-${pr.repo.repo}-${pr.id}`, description: 'Bitbucket se abrirá en una pestaña nueva.' })} aria-label={`Abrir PR ${pr.id}: ${pr.title} en Bitbucket`}><h2 id={titleId}>{pr.title}</h2><ExternalLink size={17} /></a> : <div className="pr-title-link"><h2 id={titleId}>{pr.title}</h2></div>}
    <div className="pr-context"><Avatar name={authorName} size="medium" /><div className="author-and-repo">{sourceRepositoryUrl ? <a href={sourceRepositoryUrl} target="_blank" rel="noreferrer" className="author-link" aria-label={`Abrir repositorio origen de ${authorName}`}><strong>{authorName}</strong><FolderGit2 size={14} /></a> : <strong>{authorName}</strong>}<span className="repo-reference">{pr.repo.repo} <b>#{pr.id}</b></span></div><span className="branch-path" title={`${pr.source?.branch?.name || '?'} → ${pr.destination?.branch?.name || '?'}`}><GitBranch size={15} /><span>{pr.source?.branch?.name || '?'}</span><b>→</b><span>{pr.destination?.branch?.name || '?'}</span></span></div>
    {hasPersonalAccess(session) && <LocalReviewGuide pr={pr} session={session} settings={gitWorkflowSettings} onSettingsChange={onGitWorkflowSettingsChange} onOpenSettings={onOpenSettings} />}
    <div className={`handoff-signal handoff-${ignored ? 'ignored' : status}`}><span className="handoff-node"><GitCommitHorizontal size={15} /></span><span className="handoff-track" aria-hidden="true"><i /></span><span className="handoff-node"><UserRound size={15} /></span><span className="handoff-copy"><strong>{handoff.label}</strong><small>{handoff.message}</small><em>{getReviewDecisionDetail(reviewDecision)}</em></span></div>
  </div>
}

const PullRequestRecord = forwardRef<HTMLElement, { pr: PullRequest; session: Session; highlighted?: boolean; technicalStatsEnabled?: boolean; gitWorkflowSettings: GitWorkflowSettings; onGitWorkflowSettingsChange: (settings: GitWorkflowSettings) => void; onOpenSettings: () => void }>(function PullRequestRecord(
  { pr, session, highlighted = false, technicalStatsEnabled = true, gitWorkflowSettings, onGitWorkflowSettingsChange, onOpenSettings },
  ref,
) {
  const reduceMotion = useReducedMotion()
  const reviewDecision = getReviewDecision(pr, session.uuid, session.displayName)
  const status = reviewDecision.status
  const lifecycle = getLifecycleStatus(pr)
  const ignored = isIgnoredPullRequest(pr)
  const titleId = `pr-${pr.repo.repo}-${pr.id}`

  return (
    <m.article
      ref={ref}
      aria-labelledby={titleId}
      className={`pr-record review-${ignored ? 'ignored' : status} lifecycle-${lifecycle.toLowerCase()}${highlighted ? ' is-located' : ''}`}
      data-pr-key={pullRequestKey(pr)}
      tabIndex={-1}
      initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
      transition={{ duration: reduceMotion ? 0.08 : 0.2 }}
    >
      <PullRequestPrimary pr={pr} session={session} status={status} lifecycle={lifecycle} ignored={ignored} reviewDecision={reviewDecision} titleId={titleId} gitWorkflowSettings={gitWorkflowSettings} onGitWorkflowSettingsChange={onGitWorkflowSettingsChange} onOpenSettings={onOpenSettings} />

      <aside className="pr-reviewers" aria-label="Revisores"><span className="column-kicker">Revisores</span><ReviewerPopover pr={pr} session={session} /></aside>
      <div className="pr-actions"><PullRequestMenu pr={pr} /></div>
      <PullRequestStats pr={pr} session={session} enabled={technicalStatsEnabled} />
    </m.article>
  )
})

export default PullRequestRecord
