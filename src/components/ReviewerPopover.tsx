import { useCallback, useId, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import Avatar from './Avatar'
import { useDismissableLayer } from '../hooks/useDismissableLayer'
import { getReviewerState } from '../lib/pullRequestReviewState'
import { displayName, reviewerLabels, trackedReviewers } from '../lib/dashboard'
import type { PullRequest, ReviewerState, Session } from '../types'

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

export default function ReviewerPopover({ pr, session }: { pr: PullRequest; session: Session }) {
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
  const signals = people.map((person) => ({ ...person, state: getReviewerState(pr, person.displayName, person.uuid) }))
  const activeSignals = signals.filter((person): person is typeof person & { state: ReviewerState } => person.state !== null)
  const summary = activeSignals.length === 0
    ? 'Sin actividad de QA'
    : activeSignals.length === 1
      ? getReviewerSummary(activeSignals[0].label, activeSignals[0].state)
      : `${activeSignals.length} revisores con actividad`

  return (
    <div className="reviewer-control">
      <button ref={triggerRef} type="button" className="reviewer-trigger" aria-expanded={open} aria-controls={popoverId} aria-haspopup="true" onClick={() => setOpen((current) => !current)}>
        <span className="avatar-stack" aria-hidden="true">{signals.map((person) => <Avatar key={person.displayName} name={person.displayName} state={person.state} size="small" />)}</span>
        <span className="reviewer-summary"><strong>{summary}</strong><small>Actividad QA</small></span>
        <ChevronDown size={16} className={open ? 'rotate' : ''} />
      </button>
      <AnimatePresence>
        {open && <motion.div ref={popoverRef} id={popoverId} className="reviewer-popover" role="group" aria-label="Actividad de revisión del equipo QA" initial={{ opacity: 0, y: reduceMotion ? 0 : -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }} transition={{ duration: reduceMotion ? 0.08 : 0.16 }}>
          <header><span className="section-kicker">Equipo QA</span><strong>Actividad de revisión</strong></header>
          {signals.map((person) => <div className="reviewer-person" key={person.displayName}>
            <Avatar name={person.displayName} state={person.state} size="medium" />
            <span><strong>{person.label}</strong><small>{person.displayName}</small></span>
            <span className={`reviewer-state ${person.state ? `state-${person.state}` : ''}`}>{person.state ? reviewerStateNames[person.state] : 'Sin actividad'}</span>
          </div>)}
        </motion.div>}
      </AnimatePresence>
    </div>
  )
}
