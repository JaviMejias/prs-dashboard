import { useMemo, useState } from 'react'
import { CheckCircle2, GitPullRequest, MessageCircle, ScanEye, TrendingUp } from 'lucide-react'
import DateRangePicker, { rangeFor, type DateRange } from './DateRangePicker'
import { classifyPr, getReviewerState } from '../lib/bitbucket'
import { displayName, formatDate } from '../lib/dashboard'
import type { PullRequest, Session } from '../types'

const inRange = (date: string | undefined, range: DateRange) => Boolean(date && date.slice(0, 10) >= range.from && date.slice(0, 10) <= range.to)
const matches = (name: string | undefined, session: Session) => {
  const left = (name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
  const right = displayName(session.displayName, session.email).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
  return Boolean(left && left === right)
}

export default function SummaryView({ prs, session }: { prs: PullRequest[]; session: Session }) {
  const [range, setRange] = useState<DateRange>(() => rangeFor('month'))
  const summary = useMemo(() => {
    const reviewed = prs.filter((pr) => {
      const dates = [
        ...(pr.activity || []).flatMap((item) => [item.comment?.user?.display_name && matches(item.comment.user.display_name, session) ? item.comment.updated_on || item.comment.created_on : undefined, item.approval?.user?.display_name && matches(item.approval.user.display_name, session) ? item.approval.date : undefined]),
        ...(pr.participants || []).filter((item) => matches(item.user?.display_name, session)).map((item) => item.participated_on),
      ]
      return dates.some((date) => inRange(date, range))
    })
    const comments = prs.reduce((total, pr) => total + (pr.activity || []).filter((item) => item.comment && !item.comment.deleted && matches(item.comment.user?.display_name, session) && inRange(item.comment.updated_on || item.comment.created_on, range)).length, 0)
    const approved = reviewed.filter((pr) => getReviewerState(pr, displayName(session.displayName, session.email), session.uuid) === 'approved').length
    const changes = reviewed.filter((pr) => classifyPr(pr, session.uuid) === 'waiting').length
    return { reviewed: reviewed.length, comments, approved, changes }
  }, [prs, range, session])
  const label = `${formatDate(`${range.from}T12:00:00`)} — ${formatDate(`${range.to}T12:00:00`)}`

  return <section className="product-view summary-view" aria-labelledby="summary-title">
    <div className="queue-intro"><div><span className="section-kicker">Actividad personal</span><h1 id="summary-title">Tu resumen</h1><p>Una lectura rápida de tu trabajo de revisión en Bitbucket.</p></div><span className="view-period"><TrendingUp size={16} /> {label}</span></div>
    <DateRangePicker value={range} onChange={setRange} />
    <div className="summary-metrics">
      <div className="summary-metric metric-primary"><span><ScanEye size={18} /></span><strong>{summary.reviewed}</strong><small>PR revisados</small></div>
      <div className="summary-metric"><span><MessageCircle size={18} /></span><strong>{summary.comments}</strong><small>Comentarios</small></div>
      <div className="summary-metric"><span><CheckCircle2 size={18} /></span><strong>{summary.approved}</strong><small>Aprobados</small></div>
      <div className="summary-metric"><span><GitPullRequest size={18} /></span><strong>{summary.changes}</strong><small>Cambios solicitados</small></div>
    </div>
    <div className="summary-note"><GitPullRequest size={16} /><span>Resumen basado en los {prs.length} PR cargados actualmente desde tus repositorios monitorizados.</span></div>
  </section>
}
