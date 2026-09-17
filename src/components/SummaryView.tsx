import { useMemo, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, CalendarClock, CheckCircle2, CircleAlert, Clock3, GitPullRequest, MessageCircle, RefreshCw, RotateCcw, ScanEye, Sparkles, TrendingUp } from 'lucide-react'
import AnimatedNumber from './AnimatedNumber'
import ConfirmDialog from './ConfirmDialog'
import DateRangePicker from './DateRangePicker'
import { rangeFor, type DateRange } from '../lib/dateRange'
import { formatDate, relativeTime } from '../lib/dashboard'
import { historyCoverageForRepositories, historyPullRequestsForRepositories } from '../lib/reviewHistory'
import { previousDateRange, summaryMetricsForRange, type SummaryEvent } from '../lib/summary'
import { useReviewHistorySync } from '../hooks/useReviewHistorySync'
import { toast } from 'sonner'
import type { PullRequest, RepoConfig, Session } from '../types'

const eventCopy: Record<SummaryEvent['event']['type'], { label: string; icon: typeof MessageCircle }> = {
  comment: { label: 'Comentaste', icon: MessageCircle },
  approval: { label: 'Aprobaste', icon: CheckCircle2 },
  review: { label: 'Registraste una revisión', icon: ScanEye },
  changes_requested: { label: 'Pediste cambios', icon: ArrowUpRight },
}

function Delta({ current, previous }: { current: number; previous: number }) {
  const value = current - previous
  if (!value) return <small className="summary-delta is-neutral">Sin variación</small>
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight
  return <small className={`summary-delta ${value > 0 ? 'is-positive' : 'is-negative'}`}><Icon size={12} /> {value > 0 ? '+' : ''}{value} vs. período anterior</small>
}

function SummarySkeleton() {
  return <div className="summary-loading" role="status" aria-label="Cargando resumen">
    <div className="summary-skeleton-hero"><span /><strong /><small /></div>
    <div className="summary-skeleton-metrics">{Array.from({ length: 4 }, (_, index) => <div className="summary-skeleton-metric" key={index}><span /><strong /><small /></div>)}</div>
    <div className="summary-skeleton-grid"><div /><div /></div>
    <span className="summary-loading-label"><RefreshCw size={14} className="spin" /> Construyendo tu actividad histórica…</span>
  </div>
}

function SummaryEmpty({ hasHistory }: { hasHistory: boolean }) {
  return <div className="summary-empty" role="status">
    <span className="summary-empty-icon"><Sparkles size={24} /></span>
    <strong>{hasHistory ? 'No hay actividad en este período' : 'Aún no hay actividad para mostrar'}</strong>
    <p>{hasHistory ? 'Prueba otro rango para encontrar tus revisiones, comentarios y decisiones.' : 'Cuando el histórico termine de sincronizarse, aquí verás el pulso de tus revisiones.'}</p>
  </div>
}

function ActivityChart({ points }: { points: ReturnType<typeof summaryMetricsForRange>['activity'] }) {
  const max = Math.max(...points.map((point) => point.count), 1)
  const total = points.reduce((sum, point) => sum + point.count, 0)
  return <section className="summary-panel activity-panel" aria-labelledby="activity-chart-title">
    <header className="summary-panel-heading"><div><span className="summary-panel-icon"><Activity size={17} /></span><div><h2 id="activity-chart-title">Ritmo de actividad</h2><p>{total ? `${total} acciones tuyas en el período` : 'Todavía no hay acciones en este período'}</p></div></div><span className="summary-panel-meta">{points.length} bloques</span></header>
    <figure className="summary-chart" aria-label={`Actividad de revisión: ${total} acciones distribuidas en ${points.length} bloques`}>
      <div className="summary-chart-grid" aria-hidden="true">{[0, 1, 2].map((line) => <span key={line} />)}</div>
      <div className="summary-chart-bars">{points.map((point) => <div className="summary-chart-column" key={point.from} title={`${point.label}: ${point.count} ${point.count === 1 ? 'acción' : 'acciones'}`}><span className="summary-chart-value">{point.count || ''}</span><span className="summary-chart-bar" style={{ height: `${Math.max(point.count ? (point.count / max) * 100 : 5, 5)}%` }} /><small>{point.label}</small></div>)}</div>
    </figure>
  </section>
}

function RepositoryBreakdown({ repositories }: { repositories: ReturnType<typeof summaryMetricsForRange>['repositories'] }) {
  const max = Math.max(...repositories.map((repository) => repository.pullRequests), 1)
  return <section className="summary-panel repository-breakdown" aria-labelledby="repository-breakdown-title">
    <header className="summary-panel-heading"><div><span className="summary-panel-icon"><BarChart3 size={17} /></span><div><h2 id="repository-breakdown-title">Dónde revisaste</h2><p>PR con actividad tuya por repositorio.</p></div></div><span className="summary-panel-meta">{repositories.length} repos.</span></header>
    {repositories.length ? <div className="repository-bars">{repositories.map((repository) => <div className="repository-bar-row" key={repository.repositoryKey}><div className="repository-bar-label"><span title={repository.repositoryKey}>{repository.label}</span><strong>{repository.pullRequests}</strong></div><div className="repository-bar-track"><span style={{ width: `${Math.max((repository.pullRequests / max) * 100, 8)}%` }} /></div></div>)}</div> : <p className="summary-panel-empty">Sin repositorios con actividad en este período.</p>}
  </section>
}

function RecentActivity({ events }: { events: SummaryEvent[] }) {
  return <section className="summary-panel recent-activity" aria-labelledby="recent-activity-title">
    <header className="summary-panel-heading"><div><span className="summary-panel-icon"><Clock3 size={17} /></span><div><h2 id="recent-activity-title">Actividad reciente</h2><p>Las últimas decisiones que registraste.</p></div></div></header>
    {events.length ? <ol className="summary-timeline">{events.slice(0, 6).map(({ event, pullRequest, repositoryKey }) => { const presentation = eventCopy[event.type]; const Icon = presentation.icon; return <li key={`${repositoryKey}-${event.id}`}><span className="summary-timeline-icon"><Icon size={14} /></span><div className="summary-timeline-copy"><strong>{presentation.label} <span>en</span> {pullRequest.url ? <a href={pullRequest.url} target="_blank" rel="noreferrer">PR #{pullRequest.id}</a> : <span>PR #{pullRequest.id}</span>}</strong><small>{pullRequest.title || repositoryKey} · {relativeTime(event.date)}</small></div><time dateTime={event.date}>{formatDate(event.date)}</time></li> })}</ol> : <p className="summary-panel-empty">Sin actividad reciente.</p>}
  </section>
}

type SummaryMetrics = ReturnType<typeof summaryMetricsForRange>

function SummaryDashboard({ summary, previousSummary, coverage, hasSyncErrors, range }: {
  summary: SummaryMetrics
  previousSummary: SummaryMetrics
  coverage: 'complete' | 'partial' | 'empty'
  hasSyncErrors: boolean
  range: DateRange
}) {
  const reduceMotion = useReducedMotion()
  const motionProps = reduceMotion ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: .24 } }
  const heroTitle = hasSyncErrors
    ? 'Hay datos guardados, pero falta actualizar una parte.'
    : coverage === 'complete'
      ? 'Trabajo registrado con contexto completo.'
      : 'Tu actividad está tomando forma.'
  const heroDescription = hasSyncErrors
    ? 'Conservamos lo que ya estaba disponible y puedes reintentar los repositorios pendientes.'
    : coverage === 'complete'
      ? 'El histórico cubre todos tus repositorios configurados.'
      : 'La comparación mejorará a medida que se complete el histórico local.'

  return <m.div className="summary-dashboard" key={`${range.from}-${range.to}`} {...motionProps}>
    <section className="summary-hero-panel">
      <div className="summary-hero-copy"><span className="summary-panel-eyebrow"><ScanEye size={14} /> Tu pulso de revisión</span><h2>{heroTitle}</h2><p>{heroDescription}</p></div>
      <div className="summary-hero-value"><strong><AnimatedNumber value={summary.reviewed} /></strong><span>PR con tu actividad</span><Delta current={summary.reviewed} previous={previousSummary.reviewed} /></div>
    </section>
    <div className="summary-metrics" aria-label="Métricas de revisión">
      <div className="summary-metric metric-primary"><span><ScanEye size={18} /></span><strong><AnimatedNumber value={summary.reviewed} /></strong><small>PR revisados</small><Delta current={summary.reviewed} previous={previousSummary.reviewed} /></div>
      <div className="summary-metric"><span><MessageCircle size={18} /></span><strong><AnimatedNumber value={summary.comments} /></strong><small>Comentarios</small><Delta current={summary.comments} previous={previousSummary.comments} /></div>
      <div className="summary-metric"><span><CheckCircle2 size={18} /></span><strong><AnimatedNumber value={summary.approved} /></strong><small>Aprobados</small><Delta current={summary.approved} previous={previousSummary.approved} /></div>
      <div className="summary-metric"><span><GitPullRequest size={18} /></span><strong><AnimatedNumber value={summary.changes} /></strong><small>Cambios solicitados</small><Delta current={summary.changes} previous={previousSummary.changes} /></div>
    </div>
    <div className="summary-dashboard-grid"><ActivityChart points={summary.activity} /><RepositoryBreakdown repositories={summary.repositories} /><RecentActivity events={summary.events} /></div>
  </m.div>
}

type HistorySync = ReturnType<typeof useReviewHistorySync>

function SummaryHistoryStatus({ sync, historyCount, reposCount }: { sync: HistorySync; historyCount: number; reposCount: number }) {
  const message = sync.syncing
    ? `Sincronizando histórico · ${sync.completedRepositories} de ${sync.repositoryCount} repositorios`
    : sync.errorCount > 0
      ? `Histórico con errores · ${historyCount} PR registrados`
      : sync.isComplete
        ? `Histórico completo · ${historyCount} PR registrados`
        : `Histórico local parcial · ${historyCount} PR registrados`
  const detail = sync.errorCount > 0
    ? `${sync.errorCount} ${sync.errorCount === 1 ? 'repositorio no pudo' : 'repositorios no pudieron'} actualizarse. Puedes reintentar sin perder lo guardado.`
    : 'La cola rápida sigue actualizando los PR abiertos mientras este histórico se completa.'
  return <div className={`summary-history-status${sync.errorCount > 0 ? ' has-error' : ''}`} role={sync.errorCount > 0 ? 'alert' : 'status'} aria-live="polite">
    <span className="summary-history-icon">{sync.errorCount > 0 ? <CircleAlert size={16} /> : <GitPullRequest size={16} />}</span>
    <span className="summary-history-copy"><strong>{message}</strong><small>{detail}</small></span>
    <button type="button" className="button button-secondary summary-history-refresh" onClick={sync.refresh} disabled={sync.syncing || !reposCount}><RefreshCw size={14} className={sync.syncing ? 'spin' : ''} />{sync.syncing ? 'Sincronizando…' : 'Actualizar histórico'}</button>
  </div>
}

function SummaryBody({ sync, historyCount, summary, previousSummary, coverage, range }: { sync: HistorySync; historyCount: number; summary: SummaryMetrics; previousSummary: SummaryMetrics; coverage: 'complete' | 'partial' | 'empty'; range: DateRange }) {
  const showLoading = sync.syncing && historyCount === 0
  const showEmpty = !showLoading && !summary.events.length
  return <AnimatePresence mode="wait">
    {showLoading ? <SummarySkeleton /> : showEmpty ? <SummaryEmpty hasHistory={historyCount > 0} /> : <SummaryDashboard summary={summary} previousSummary={previousSummary} coverage={coverage} hasSyncErrors={sync.errorCount > 0} range={range} />}
  </AnimatePresence>
}

export default function SummaryView({ prs, repos, session }: { prs: PullRequest[]; repos: RepoConfig[]; session: Session }) {
  const [range, setRange] = useState<DateRange>(() => rangeFor('month'))
  const [showRebuildConfirm, setShowRebuildConfirm] = useState(false)
  const historySync = useReviewHistorySync(prs, repos, session)
  const { history } = historySync

  const summary = useMemo(() => summaryMetricsForRange(history, repos, session, range), [history, range, repos, session])
  const previousSummary = useMemo(() => summaryMetricsForRange(history, repos, session, previousDateRange(range)), [history, range, repos, session])
  const label = `${formatDate(`${range.from}T12:00:00`)} — ${formatDate(`${range.to}T12:00:00`)}`
  const coverage = historyCoverageForRepositories(history, repos)
  const historyCount = historyPullRequestsForRepositories(history, repos).length
  const rebuildHistory = () => {
    historySync.reset()
    setShowRebuildConfirm(false)
    toast.success('Histórico local reiniciado', { description: 'Comenzaremos a reconstruirlo desde Bitbucket.' })
  }

  return <section className="product-view summary-view" aria-labelledby="summary-title">
    <div className="queue-intro"><div><span className="section-kicker">Actividad personal</span><h1 id="summary-title">Tu resumen</h1><p>Una lectura rápida de tu trabajo de revisión en Bitbucket.</p></div><span className="view-period"><TrendingUp size={16} /> {label}</span></div>
    <DateRangePicker value={range} onChange={setRange} />
    <SummaryHistoryStatus sync={historySync} historyCount={historyCount} reposCount={repos.length} />
    <SummaryBody sync={historySync} historyCount={historyCount} summary={summary} previousSummary={previousSummary} coverage={coverage} range={range} />
    <div className="summary-footer-note"><CalendarClock size={15} /> <span>Las cifras se calculan con tu histórico local y respetan el período seleccionado.</span><button type="button" className="text-button summary-history-reset" onClick={() => setShowRebuildConfirm(true)} disabled={historySync.syncing || !repos.length}><RotateCcw size={13} /> Reconstruir histórico</button></div>
    <AnimatePresence>{showRebuildConfirm && <ConfirmDialog title="¿Reconstruir el histórico local?" description="Se eliminará únicamente el histórico guardado en este navegador y se volverá a consultar Bitbucket. Tus repositorios y preferencias no cambiarán." confirmLabel="Reconstruir histórico" onConfirm={rebuildHistory} onClose={() => setShowRebuildConfirm(false)} />}</AnimatePresence>
  </section>
}
