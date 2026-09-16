import { forwardRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  CheckCircle2,
  ChevronDown,
  CircleSlash2,
  Clock3,
  ExternalLink,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  GitMerge,
  FileJson,
  Copy,
  ScanEye,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import Avatar from './Avatar'
import { getLifecycleStatus, getReviewDecision } from '../lib/pullRequestReviewState'
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
import { buildGitReviewInstruction, getGitRemotesCommand } from '../lib/gitWorkflow'
import ReviewContextDialog from './ReviewContextDialog'
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

const PullRequestRecord = forwardRef<HTMLElement, { pr: PullRequest; session: Session; highlighted?: boolean; gitWorkflowSettings: GitWorkflowSettings; onGitWorkflowSettingsChange: (settings: GitWorkflowSettings) => void; onOpenSettings: () => void }>(function PullRequestRecord(
  { pr, session, highlighted = false, gitWorkflowSettings, onGitWorkflowSettingsChange, onOpenSettings },
  ref,
) {
  const reduceMotion = useReducedMotion()
  const [workflowOpen, setWorkflowOpen] = useState(false)
  const [remoteEditorOpen, setRemoteEditorOpen] = useState(false)
  const [remoteDraft, setRemoteDraft] = useState('')
  const [contextOpen, setContextOpen] = useState(false)
  const reviewDecision = getReviewDecision(pr, session.uuid, session.displayName)
  const status = reviewDecision.status
  const lifecycle = getLifecycleStatus(pr)
  const ignored = isIgnoredPullRequest(pr)
  const isNew = reviewDecision.reason === 'new_pr'
  const StatusIcon = isNew ? Sparkles : statusIcons[status]
  const handoff = getHandoffMessage(pr, status)
  const authorName = displayName(pr.author?.display_name || pr.author?.nickname)
  const sourceRepositoryUrl = pr.source?.repository?.links?.html?.href
  const instruction = buildGitReviewInstruction(pr, session, gitWorkflowSettings)
  const saveAuthorRemote = () => {
    const remote = remoteDraft.trim()
    if (!remote) return toast.error('Escribe el nombre del remoto local.')
    const author = authorName
    const existing = gitWorkflowSettings.developerRemotes.find((item) => item.displayName.trim().toLocaleLowerCase() === author.trim().toLocaleLowerCase())
    const developerRemotes = existing
      ? gitWorkflowSettings.developerRemotes.map((item) => item.id === existing.id ? { ...item, remote } : item)
      : [...gitWorkflowSettings.developerRemotes, { id: `inline-${Date.now()}`, displayName: author, remote }]
    onGitWorkflowSettingsChange({ ...gitWorkflowSettings, developerRemotes })
    setRemoteEditorOpen(false)
    toast.success(`Remoto de ${author} configurado`)
  }
  const titleId = `pr-${pr.repo.repo}-${pr.id}`

  const openPullRequest = () => {
    toast(`Abriendo PR #${pr.id}`, {
      id: `open-pr-${pr.repo.workspace}-${pr.repo.repo}-${pr.id}`,
      description: 'Bitbucket se abrirá en una pestaña nueva.',
    })
  }

  return (
    <motion.article
      ref={ref}
      layout
      aria-labelledby={titleId}
      className={`pr-record review-${ignored ? 'ignored' : status} lifecycle-${lifecycle.toLowerCase()}${highlighted ? ' is-located' : ''}`}
      data-pr-key={pullRequestKey(pr)}
      tabIndex={-1}
      initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
      transition={{ duration: reduceMotion ? 0.08 : 0.2 }}
    >
      <div className="pr-primary">
        <div className="pr-heading-row">
          <span className={`qa-status qa-${ignored ? 'ignored' : status}`}><StatusIcon size={15} />{getReviewLabel(pr, status)}</span>
          <span className={`lifecycle-status lifecycle-${lifecycle.toLowerCase()}`}><span />{lifecycleLabels[lifecycle]}</span>
          <time dateTime={pr.updated_on} className="updated-time"><Clock3 size={13} /> Actualizado {relativeTime(pr.updated_on)}</time>
        </div>

        <a
          className="pr-title-link"
          href={pr.links?.html?.href}
          target="_blank"
          rel="noreferrer"
          onClick={openPullRequest}
          aria-label={`Abrir PR ${pr.id}: ${pr.title} en Bitbucket`}
        >
          <h2 id={titleId}>{pr.title}</h2>
          <ExternalLink size={17} />
        </a>

        <div className="pr-context">
          <Avatar name={authorName} size="medium" />
          <div className="author-and-repo">
            {sourceRepositoryUrl
              ? <a href={sourceRepositoryUrl} target="_blank" rel="noreferrer" className="author-link" aria-label={`Abrir repositorio origen de ${authorName}`}><strong>{authorName}</strong><FolderGit2 size={14} /></a>
              : <strong>{authorName}</strong>}
            <span className="repo-reference">{pr.repo.repo} <b>#{pr.id}</b></span>
          </div>
          <span className="branch-path" title={`${pr.source?.branch?.name || '?'} → ${pr.destination?.branch?.name || '?'}`}>
            <GitBranch size={15} />
            <span>{pr.source?.branch?.name || '?'}</span>
            <b>→</b>
            <span>{pr.destination?.branch?.name || '?'}</span>
          </span>
        </div>

        <div className={`git-review-instruction${instruction.isComplete ? '' : ' is-incomplete'}${workflowOpen ? ' is-open' : ''}`}>
          <button type="button" className="git-review-instruction-toggle" aria-expanded={workflowOpen} onClick={() => setWorkflowOpen((open) => !open)}>
            <span className="git-review-instruction-heading"><span className="instruction-icon"><GitBranch size={15} /></span><span><small>REVISIÓN LOCAL</small><strong>Guía de revisión</strong></span></span>
            <span className="instruction-preview">{instruction.isRevisit ? 'Revisión de seguimiento' : 'Lista para revisar'}</span>
            <ChevronDown size={16} className={workflowOpen ? 'rotate' : ''} />
          </button>
          <AnimatePresence initial={false}>
            {workflowOpen && <motion.div className="git-review-instruction-details" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: reduceMotion ? 0.08 : 0.18 }}>
              <div className="workflow-route" aria-label="Ruta de revisión local">
                <div className="workflow-endpoint"><small>DESDE</small><strong>{instruction.sourceRemote || 'Remoto no configurado'}</strong><code>{instruction.sourceBranch}</code></div>
                <span className="workflow-route-arrow" aria-hidden="true">→</span>
                <div className="workflow-endpoint"><small>HACIA</small><strong>{instruction.targetRemote || 'Remoto no configurado'}</strong><code>{instruction.targetBranch}</code></div>
              </div>
              <p className="workflow-instruction-copy">{instruction.text}</p>
              {!instruction.sourceRemote && <div className="inline-remote-editor">{remoteEditorOpen ? <form noValidate onSubmit={(event) => { event.preventDefault(); saveAuthorRemote() }}><label htmlFor={`remote-${pr.id}`}>Remoto de {authorName}</label><div><input id={`remote-${pr.id}`} autoFocus value={remoteDraft} onChange={(event) => setRemoteDraft(event.target.value)} placeholder="cosores" /><button type="submit" className="button button-secondary">Guardar</button><button type="button" className="text-button" onClick={() => setRemoteEditorOpen(false)}>Cancelar</button></div></form> : <button type="button" className="instruction-configure" onClick={() => setRemoteEditorOpen(true)}>Asignar remoto local para {authorName}</button>}</div>}
              {!instruction.isComplete && instruction.sourceRemote && <button type="button" className="instruction-configure" onClick={onOpenSettings}>Configura el remoto destino para completar esta instrucción</button>}
              <div className="instruction-actions">
                <button type="button" className="instruction-context" onClick={() => setContextOpen(true)}><FileJson size={14} /> Ver contexto</button>
                <button type="button" className="instruction-copy" onClick={() => { void navigator.clipboard?.writeText(instruction.text); toast.success('Instrucción copiada') }}><Copy size={14} /> Copiar instrucción</button>
                <button type="button" className={`sync-check${gitWorkflowSettings.syncRemotesConfirmed ? ' is-checked' : ''}`} onClick={() => onGitWorkflowSettingsChange({ ...gitWorkflowSettings, syncRemotesConfirmed: !gitWorkflowSettings.syncRemotesConfirmed })} aria-pressed={gitWorkflowSettings.syncRemotesConfirmed}><span>{gitWorkflowSettings.syncRemotesConfirmed ? '✓' : ''}</span> Remotos actualizados</button>
                {!gitWorkflowSettings.syncRemotesConfirmed && <button type="button" className="sync-command" onClick={() => { void navigator.clipboard?.writeText(getGitRemotesCommand()); toast.success('Comando copiado') }}>Copiar git sync-remotes</button>}
              </div>
            </motion.div>}
          </AnimatePresence>
        </div>

        <div className={`handoff-signal handoff-${ignored ? 'ignored' : status}`}>
          <span className="handoff-node"><GitCommitHorizontal size={15} /></span>
          <span className="handoff-track" aria-hidden="true"><i /></span>
          <span className="handoff-node"><UserRound size={15} /></span>
          <span className="handoff-copy"><strong>{handoff.label}</strong><small>{handoff.message}</small><em>{getReviewDecisionDetail(reviewDecision)}</em></span>
        </div>
      </div>

      <aside className="pr-reviewers" aria-label="Revisores"><span className="column-kicker">Revisores</span><ReviewerPopover pr={pr} session={session} /></aside>
      <div className="pr-actions"><PullRequestMenu pr={pr} /></div>
      <PullRequestStats pr={pr} session={session} />
      <AnimatePresence>{contextOpen && <ReviewContextDialog pr={pr} session={session} onClose={() => setContextOpen(false)} />}</AnimatePresence>
    </motion.article>
  )
})

export default PullRequestRecord
