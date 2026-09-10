import { useCallback, useRef } from 'react'
import type { RefObject } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowUpRight,
  CheckCircle2,
  CircleSlash2,
  Clock3,
  FilePenLine,
  GitMerge,
  GitPullRequest,
  LocateFixed,
  ScanEye,
  Trash2,
  X,
} from 'lucide-react'
import { useDismissableLayer } from '../hooks/useDismissableLayer'
import { relativeTime } from '../lib/dashboard'
import { getNoticePresentation } from '../lib/notifications'
import type { NoticePresentation } from '../lib/notifications'
import type { Notice } from '../types'

const noticeIcons = {
  'new-pr': GitPullRequest,
  'review-required': ScanEye,
  waiting: Clock3,
  current: CheckCircle2,
  ignored: CircleSlash2,
  draft: FilePenLine,
  queued: GitMerge,
  merged: GitMerge,
  declined: CircleSlash2,
}

export default function NotificationPanel({
  notices,
  presentations,
  triggerRef,
  onClose,
  onRead,
  onSelect,
  onDelete,
  onClear,
}: {
  notices: Notice[]
  presentations: ReadonlyMap<string, NoticePresentation>
  triggerRef: RefObject<HTMLButtonElement>
  onClose: () => void
  onRead: (id: string) => void
  onSelect: (notice: Notice) => void
  onDelete: (id: string) => void
  onClear: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const close = useCallback(onClose, [onClose])
  useDismissableLayer(true, panelRef, close, triggerRef)

  return (
    <motion.div
      ref={panelRef}
      className="notification-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="notifications-title"
      initial={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
      transition={{ duration: reduceMotion ? 0.08 : 0.18 }}
    >
      <div className="overlay-heading">
        <div><span className="section-kicker">Cola de atención</span><h2 id="notifications-title">Notificaciones</h2></div>
        <div className="overlay-heading-actions">
          {notices.length > 0 && <button type="button" className="text-button" onClick={onClear}><Trash2 size={14} /> Borrar todo</button>}
          <button type="button" className="icon-button" aria-label="Cerrar notificaciones" onClick={onClose}><X size={19} /></button>
        </div>
      </div>
      <div className="notification-list">
        {notices.length ? notices.map((notice) => {
          const presentation = presentations.get(notice.id) || getNoticePresentation(notice)
          const StateIcon = noticeIcons[presentation.tone]

          return (
            <article className={`notification-item is-${presentation.tone} ${presentation.resolved ? 'is-resolved' : ''} ${notice.read ? 'is-read' : 'is-unread'}`} key={notice.id}>
              <button
                type="button"
                className="notification-locate-button"
                onClick={() => onSelect(notice)}
                aria-label={`Mostrar PR ${notice.pullRequestId} en la cola. Estado actual: ${presentation.label}${notice.read ? '' : ', sin leer'}`}
              />
              <span className="notification-icon" aria-hidden="true">
                <StateIcon size={17} />
              </span>
              <div className="notification-content">
                <p className="notification-copy">
                  {notice.actorUrl ? (
                    <a href={notice.actorUrl} target="_blank" rel="noreferrer" onClick={() => onRead(notice.id)} aria-label={`Abrir repositorio de ${notice.actorName}`}>
                      {notice.actorName}<ArrowUpRight size={11} aria-hidden="true" />
                    </a>
                  ) : <strong>{notice.actorName}</strong>}
                  {' '}{notice.action}{' '}
                  {notice.pullRequestUrl ? (
                    <a href={notice.pullRequestUrl} target="_blank" rel="noreferrer" onClick={() => onRead(notice.id)} aria-label={`Abrir pull request ${notice.pullRequestTitle}`}>
                      {notice.pullRequestTitle}<ArrowUpRight size={11} aria-hidden="true" />
                    </a>
                  ) : <strong>{notice.pullRequestTitle}</strong>}
                </p>
                <div className="notification-meta">
                  <span className="notification-kind">{presentation.label}</span>
                  <span><GitPullRequest size={12} aria-hidden="true" />{notice.repositoryName} #{notice.pullRequestId}</span>
                  <time dateTime={new Date(notice.createdAt).toISOString()}><Clock3 size={12} aria-hidden="true" />{relativeTime(new Date(notice.createdAt).toISOString())}</time>
                  <span className="notification-read-state">{presentation.resolved ? 'Resuelta' : notice.read ? 'Leída' : 'Sin leer'}</span>
                </div>
                {presentation.detail && <span className="notification-resolution">{presentation.detail}</span>}
                <span className="notification-locate-label"><LocateFixed size={13} aria-hidden="true" /> {presentation.resolved ? 'Ver estado actual' : 'Mostrar en la cola'}</span>
              </div>
              <button type="button" className="icon-button notification-delete" onClick={() => onDelete(notice.id)} aria-label={`Borrar notificación del PR ${notice.pullRequestId}`}><Trash2 size={16} /></button>
            </article>
          )
        }) : (
          <div className="overlay-empty"><CheckCircle2 size={24} /><strong>Tu cola de avisos está al día</strong><span>Te avisaremos cuando llegue un PR nuevo o vuelva a ser tu turno.</span></div>
        )}
      </div>
    </motion.div>
  )
}
