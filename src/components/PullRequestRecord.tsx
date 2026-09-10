import { forwardRef, useCallback, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleSlash2,
  Clock3,
  EllipsisVertical,
  ExternalLink,
  EyeOff,
  FileCode2,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  GitMerge,
  MessageCircle,
  Minus,
  Plus,
  ScanEye,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import Avatar from './Avatar'
import { useDismissableLayer } from '../hooks/useDismissableLayer'
import { classifyPr, getLifecycleStatus, getReviewerState, getStats, isFreshPullRequest } from '../lib/bitbucket'
import {
  displayName,
  formatDate,
  getHandoffMessage,
  getReviewLabel,
  isIgnoredPullRequest,
  lifecycleLabels,
  normalizeForRule,
  pullRequestKey,
  relativeTime,
  reviewerLabels,
  trackedReviewers,
} from '../lib/dashboard'
import { getIgnoreRules, saveIgnoreRules } from '../lib/storage'
import type { IgnoreRules, PrStatus, PullRequest, ReviewerState, Session } from '../types'

const statusIcons = {
  unreviewed: ScanEye,
  changes: GitCompareArrows,
  waiting: Clock3,
  current: CheckCircle2,
  merged: GitMerge,
  declined: CircleSlash2,
} satisfies Record<PrStatus, typeof ScanEye>

const reviewerStateNames: Record<ReviewerState, string> = {
  approved: 'Aprobado',
  waiting: 'Cambios solicitados',
  reviewed: 'Revisado',
  changes: 'Desactualizado',
}

function getReviewerSummary(label: string, state: ReviewerState) {
  if (label !== 'Tú') return `${label} ${reviewerLabels[state]}`
  const personalLabels: Record<ReviewerState, string> = {
    approved: 'Aprobaste el PR',
    waiting: 'Pediste cambios',
    reviewed: 'Ya revisaste',
    changes: 'Tu revisión quedó desactualizada',
  }
  return personalLabels[state]
}

function Stats({ pr, session }: { pr: PullRequest; session: Session }) {
  const query = useQuery({
    queryKey: ['stats', pr.id, pr.updated_on],
    queryFn: () => getStats(pr, session),
  })
  const compactCreatedDate = new Date(pr.created_on).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  return (
    <div className="pr-stats" aria-label="Estadísticas del pull request">
      <span className="stat-item"><CalendarDays size={15} /><span>Creado</span><strong><span className="date-full">{formatDate(pr.created_on)}</span><span className="date-compact">{compactCreatedDate}</span></strong></span>
      <span className="stat-item"><MessageCircle size={15} /><strong>{pr.comment_count || 0}</strong><span>comentarios</span></span>
      {query.isLoading && (
        <span className="stats-state stats-loading" role="status">
          <span className="inline-loader" />
          <span>Cargando actividad técnica…</span>
          <span className="stats-loading-bars" aria-hidden="true"><i /><i /><i /><i /></span>
        </span>
      )}
      {query.isError && <span className="stats-state stats-error"><CircleSlash2 size={15} /> No se pudieron cargar los datos técnicos.</span>}
      {query.data && <>
        <span className="stat-item"><GitCommitHorizontal size={15} /><strong>{query.data.commits}</strong><span>commits</span></span>
        <span className="stat-item"><FileCode2 size={15} /><strong>{query.data.files}</strong><span>archivos</span></span>
        <span className="stat-item stat-added"><Plus size={15} /><strong>{query.data.added}</strong><span>añadidos</span></span>
        <span className="stat-item stat-removed"><Minus size={15} /><strong>{query.data.removed}</strong><span>eliminados</span></span>
      </>}
    </div>
  )
}

function ReviewerPopover({ pr, session }: { pr: PullRequest; session: Session }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()
  const reduceMotion = useReducedMotion()
  const close = useCallback(() => setOpen(false), [])
  useDismissableLayer(open, popoverRef, close, triggerRef)

  const people = [
    { displayName: displayName(session.displayName, session.email), label: 'Tú', uuid: session.uuid },
    ...trackedReviewers.map((person) => ({ ...person, label: person.shortName })),
  ]
  const signals = people.map((person) => ({
    ...person,
    state: getReviewerState(pr, person.displayName, person.uuid),
  }))
  const activeSignals = signals.filter((person): person is typeof person & { state: ReviewerState } => person.state !== null)
  const summary = activeSignals.length === 0
    ? 'Sin actividad de QA'
    : activeSignals.length === 1
      ? getReviewerSummary(activeSignals[0].label, activeSignals[0].state)
      : `${activeSignals.length} revisores con actividad`

  return (
    <div className="reviewer-control">
      <button
        ref={triggerRef}
        type="button"
        className="reviewer-trigger"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-haspopup="true"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="avatar-stack" aria-hidden="true">
          {signals.map((person) => <Avatar key={person.displayName} name={person.displayName} state={person.state} size="small" />)}
        </span>
        <span className="reviewer-summary"><strong>{summary}</strong><small>Actividad QA</small></span>
        <ChevronDown size={16} className={open ? 'rotate' : ''} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={popoverRef}
            id={popoverId}
            className="reviewer-popover"
            role="group"
            aria-label="Actividad de revisión del equipo QA"
            initial={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
            transition={{ duration: reduceMotion ? 0.08 : 0.16 }}
          >
            <header><span className="section-kicker">Equipo QA</span><strong>Actividad de revisión</strong></header>
            {signals.map((person) => (
              <div className="reviewer-person" key={person.displayName}>
                <Avatar name={person.displayName} state={person.state} size="medium" />
                <span><strong>{person.label}</strong><small>{person.displayName}</small></span>
                <span className={`reviewer-state ${person.state ? `state-${person.state}` : ''}`}>
                  {person.state ? reviewerStateNames[person.state] : 'Sin actividad'}
                </span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PullRequestMenu({ pr }: { pr: PullRequest }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const reduceMotion = useReducedMotion()
  const ignored = isIgnoredPullRequest(pr)
  const authorName = displayName(pr.author?.display_name || pr.author?.nickname)
  const close = useCallback(() => setOpen(false), [])
  useDismissableLayer(open, menuRef, close, triggerRef)

  const applyRules = (rules: IgnoreRules) => {
    saveIgnoreRules(rules)
    window.dispatchEvent(new Event('prcr:ignore-rules-changed'))
  }

  const updateRule = (scope: 'pr' | 'author') => {
    const previous = getIgnoreRules()
    const next: IgnoreRules = {
      authors: [...previous.authors],
      pullRequests: [...previous.pullRequests],
    }

    if (ignored) {
      next.authors = next.authors.filter((item) => normalizeForRule(item) !== normalizeForRule(authorName))
      next.pullRequests = next.pullRequests.filter((item) => item !== pullRequestKey(pr))
    } else if (scope === 'author' && !next.authors.some((item) => normalizeForRule(item) === normalizeForRule(authorName))) {
      next.authors.push(authorName)
    } else if (scope === 'pr' && !next.pullRequests.includes(pullRequestKey(pr))) {
      next.pullRequests.push(pullRequestKey(pr))
    }

    applyRules(next)
    setOpen(false)
    toast.success(
      ignored ? 'PR incluido nuevamente en tu cola' : scope === 'author' ? `PR de ${authorName} ocultados` : 'PR ocultado de tu cola',
      {
        description: ignored ? 'Volverá a aparecer en tus filtros de revisión.' : 'Puedes encontrarlo en QA > Todos.',
        action: { label: 'Deshacer', onClick: () => applyRules(previous) },
      },
    )
  }

  return (
    <div className="pr-menu-control">
      <button
        ref={triggerRef}
        type="button"
        className="icon-button pr-menu-trigger"
        aria-label={`Más acciones para el PR ${pr.id}`}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        <EllipsisVertical size={19} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            id={menuId}
            className="pr-actions-menu"
            role="menu"
            initial={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
            transition={{ duration: reduceMotion ? 0.08 : 0.15 }}
          >
            <span className="menu-label">Organizar cola</span>
            {ignored ? (
              <button type="button" role="menuitem" onClick={() => updateRule('pr')}><Check size={16} /><span><strong>Reactivar PR</strong><small>Volver a incluirlo en tu cola</small></span></button>
            ) : <>
              <button type="button" role="menuitem" onClick={() => updateRule('pr')}><EyeOff size={16} /><span><strong>Ocultar este PR</strong><small>Solo afecta tu cola personal</small></span></button>
              <button type="button" role="menuitem" className="menu-item-warning" onClick={() => updateRule('author')}><UserRound size={16} /><span><strong>Ignorar este autor</strong><small>Oculta todos sus PR de tu revisión</small></span></button>
            </>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const PullRequestRecord = forwardRef<HTMLElement, { pr: PullRequest; session: Session; highlighted?: boolean }>(function PullRequestRecord(
  { pr, session, highlighted = false },
  ref,
) {
  const reduceMotion = useReducedMotion()
  const status = classifyPr(pr, session.uuid)
  const lifecycle = getLifecycleStatus(pr)
  const ignored = isIgnoredPullRequest(pr)
  const isNew = status === 'unreviewed' && isFreshPullRequest(pr)
  const StatusIcon = isNew ? Sparkles : statusIcons[status]
  const handoff = getHandoffMessage(pr, status)
  const authorName = displayName(pr.author?.display_name || pr.author?.nickname)
  const sourceRepositoryUrl = pr.source?.repository?.links?.html?.href
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

        <div className={`handoff-signal handoff-${ignored ? 'ignored' : status}`}>
          <span className="handoff-node"><GitCommitHorizontal size={15} /></span>
          <span className="handoff-track" aria-hidden="true"><i /></span>
          <span className="handoff-node"><UserRound size={15} /></span>
          <span className="handoff-copy"><strong>{handoff.label}</strong><small>{handoff.message}</small></span>
        </div>
      </div>

      <aside className="pr-reviewers" aria-label="Revisores"><span className="column-kicker">Revisores</span><ReviewerPopover pr={pr} session={session} /></aside>
      <div className="pr-actions"><PullRequestMenu pr={pr} /></div>
      <Stats pr={pr} session={session} />
    </motion.article>
  )
})

export default PullRequestRecord
