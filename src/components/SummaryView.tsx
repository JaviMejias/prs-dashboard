import { useMemo, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, CalendarClock, CheckCircle2, CircleAlert, Clock3, Download, GitPullRequest, MessageCircle, Pause, RefreshCw, RotateCcw, ScanEye, Sparkles, TrendingUp } from 'lucide-react'
import AnimatedNumber from './AnimatedNumber'
import ConfirmDialog from './ConfirmDialog'
import DateRangePicker from './DateRangePicker'
import type { DateRange } from '../lib/dateRange'
import { formatDate, relativeTime } from '../lib/dashboard'
import { safeBitbucketUrl } from '../lib/externalLinks'
import { previousDateRange, summaryMetricsForRange, type SummaryEvent } from '../lib/summary'
import { useSummaryHistory } from '../hooks/useSummaryHistory'
import { downloadPreparationFile } from '../lib/preparationFiles'
import { summaryReport } from '../lib/summaryReport'
import { toast } from 'sonner'
import type { RepoConfig, Session } from '../types'

const eventCopy: Record<SummaryEvent['event']['type'], { label: string; icon: typeof MessageCircle }> = {
  comment: { label: 'Comentaste', icon: MessageCircle },
  approval: { label: 'Aprobaste', icon: CheckCircle2 },
  review: { label: 'Registraste una revisión', icon: ScanEye },
  changes_requested: { label: 'Pediste cambios', icon: ArrowUpRight },
}

function Delta({ current, previous, showUnavailable = false }: { current: number; previous?: number; showUnavailable?: boolean }) {
  if (previous === undefined) return showUnavailable ? <small className="summary-delta is-neutral">Sin comparación cargada</small> : null
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

function SummaryEmpty({ incomplete, pending = false }: { incomplete: boolean; pending?: boolean }) {
  return <div className="summary-empty" role="status">
    <span className="summary-empty-icon"><Sparkles size={24} /></span>
    <strong>{incomplete ? 'El período aún no está completo' : 'No hay actividad en este período'}</strong>
    <p>{pending ? 'La importación sigue en curso. Todavía no encontramos actividad para este rango en las páginas descargadas.' : incomplete ? 'Reanuda la importación pendiente. No presentamos la información que falta como cero actividad.' : 'Prueba otro rango para encontrar tus revisiones, comentarios y decisiones.'}</p>
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
    {events.length ? <ol className="summary-timeline">{events.slice(0, 6).map(({ event, pullRequest, repositoryKey }) => { const presentation = eventCopy[event.type]; const Icon = presentation.icon; const pullRequestUrl = safeBitbucketUrl(pullRequest.url); return <li key={`${repositoryKey}-${event.id}`}><span className="summary-timeline-icon"><Icon size={14} /></span><div className="summary-timeline-copy"><strong>{presentation.label} <span>en</span> {pullRequestUrl ? <a href={pullRequestUrl} target="_blank" rel="noreferrer">PR #{pullRequest.id}</a> : <span>PR #{pullRequest.id}</span>}</strong><small>{pullRequest.title || repositoryKey} · {relativeTime(event.date)}</small></div><time dateTime={event.date}>{formatDate(event.date)}</time></li> })}</ol> : <p className="summary-panel-empty">Sin actividad reciente.</p>}
  </section>
}

type SummaryMetrics = ReturnType<typeof summaryMetricsForRange>

function SummaryDashboard({ summary, previousSummary, coverage, hasSyncErrors, range }: {
  summary: SummaryMetrics
  previousSummary?: SummaryMetrics
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
      ? 'El período cubre todos tus repositorios configurados.'
      : 'Las cifras son provisionales hasta completar el período seleccionado.'

  return <m.div className="summary-dashboard" key={`${range.from}-${range.to}`} {...motionProps}>
    <section className="summary-hero-panel">
      <div className="summary-hero-copy"><span className="summary-panel-eyebrow"><ScanEye size={14} /> Tu pulso de revisión</span><h2>{heroTitle}</h2><p>{heroDescription}</p></div>
      <div className="summary-hero-value"><strong><AnimatedNumber value={summary.reviewed} /></strong><span>PR con tu actividad</span><Delta current={summary.reviewed} previous={previousSummary?.reviewed} showUnavailable /></div>
    </section>
    <div className="summary-metrics" aria-label="Métricas de revisión">
      <div className="summary-metric metric-primary"><span><ScanEye size={18} /></span><strong><AnimatedNumber value={summary.reviewed} /></strong><small>PR revisados</small><Delta current={summary.reviewed} previous={previousSummary?.reviewed} /></div>
      <div className="summary-metric"><span><MessageCircle size={18} /></span><strong><AnimatedNumber value={summary.comments} /></strong><small>Comentarios</small><Delta current={summary.comments} previous={previousSummary?.comments} /></div>
      <div className="summary-metric"><span><CheckCircle2 size={18} /></span><strong><AnimatedNumber value={summary.approved} /></strong><small>Aprobados</small><Delta current={summary.approved} previous={previousSummary?.approved} /></div>
      <div className="summary-metric"><span><GitPullRequest size={18} /></span><strong><AnimatedNumber value={summary.changes} /></strong><small>Cambios solicitados</small><Delta current={summary.changes} previous={previousSummary?.changes} /></div>
    </div>
    <div className="summary-dashboard-grid"><ActivityChart points={summary.activity} /><RepositoryBreakdown repositories={summary.repositories} /><RecentActivity events={summary.events} /></div>
  </m.div>
}

type HistorySync = ReturnType<typeof useSummaryHistory>

function SummaryDownload({ sync, repos, session, range }: { sync: HistorySync; repos: RepoConfig[]; session: Session; range: DateRange }) {
  const download = () => {
    if (!sync.isComplete || sync.syncing) return
    try {
      downloadPreparationFile(`resumen-revisiones-${range.from}-${range.to}.md`, summaryReport(sync.history, repos, session, range, sync.isComplete), 'text/markdown;charset=utf-8')
      toast.success('Informe descargado')
    } catch { toast.error('No se pudo descargar el informe. Los datos siguen disponibles.') }
  }
  return <button type="button" className="text-button" disabled={!sync.isComplete || sync.syncing} onClick={download}><Download size={13} /> Descargar informe</button>
}

function historyStatusCopy(sync: HistorySync, historyCount: number) {
  const records = `${historyCount} PR ${historyCount === 1 ? 'registrado' : 'registrados'}`
  const message = sync.syncing
    ? sync.listing ? `Buscando PR del histórico · ${sync.discovered} encontrados` : `Importando actividad · ${sync.processed} de ${sync.discovered} PR`
    : sync.errorCount > 0
      ? `Importación pausada · ${records}`
      : sync.isComplete
        ? `Período completo · ${records}`
        : `Período parcial · ${records}`
  const detail = sync.persistenceFailed
    ? 'No pudimos guardar el avance en este navegador. Los datos solo siguen en memoria: no cierres ni recargues antes de descargar el informe.'
    : sync.errorCount > 0
      ? `Conservamos las páginas descargadas. ${sync.retryAt > Date.now() ? `La pausa de red termina a las ${new Date(sync.retryAt).toLocaleTimeString('es-CL')}; después puedes reanudar.` : 'Puedes reanudar sin empezar de cero.'}`
      : sync.isComplete
        ? 'Se recorrieron las páginas disponibles de la API. Los meses reutilizan este histórico; esto no recupera datos que Bitbucket haya eliminado.'
        : 'Avance guardado en este navegador. La primera importación puede tardar; mantén Resumen abierto. Al volver, continúa desde la última página guardada.'
  return { message, detail }
}

function SummaryHistoryStatus({ sync, historyCount, reposCount }: { sync: HistorySync; historyCount: number; reposCount: number }) {
  const { message, detail } = historyStatusCopy(sync, historyCount)
  return <div className={`summary-history-status${sync.errorCount > 0 ? ' has-error' : ''}`} role={sync.errorCount > 0 ? 'alert' : 'status'} aria-live="polite">
    <span className="summary-history-icon">{sync.errorCount > 0 ? <CircleAlert size={16} /> : <GitPullRequest size={16} />}</span>
    <span className="summary-history-copy"><strong>{message}</strong><small>{detail}</small>{sync.problems.map((problem) => <small key={problem}>{problem}</small>)}</span>
    {sync.syncing
      ? <button type="button" className="button button-secondary summary-history-refresh" onClick={() => void sync.pause()}><Pause size={14} /> Pausar importación</button>
      : <button type="button" className="button button-secondary summary-history-refresh" onClick={() => void sync.refresh()} disabled={!reposCount}><RefreshCw size={14} />{sync.isComplete ? 'Actualizar período' : 'Reanudar importación'}</button>}
  </div>
}

function SummaryBody({ sync, summary, previousSummary, coverage, range }: { sync: HistorySync; summary: SummaryMetrics; previousSummary?: SummaryMetrics; coverage: 'complete' | 'partial' | 'empty'; range: DateRange }) {
  const showLoading = sync.syncing && !sync.hasData
  const showEmpty = !showLoading && !summary.events.length
  return <AnimatePresence mode="wait">
    {showLoading ? <SummarySkeleton /> : showEmpty ? <SummaryEmpty incomplete={!sync.isComplete} pending={sync.syncing} /> : <SummaryDashboard summary={summary} previousSummary={previousSummary} coverage={coverage} hasSyncErrors={sync.errorCount > 0} range={range} />}
  </AnimatePresence>
}

function ComparisonStatus({ sync }: { sync: HistorySync }) {
  const message = sync.syncing ? 'Cargando el período anterior sin cambiar el rango seleccionado…'
    : sync.errorCount || !sync.isComplete ? 'Comparación incompleta. Puedes reintentar sin perder el resumen actual.'
      : 'Comparación cargada con el período anterior de igual duración.'
  return <p role={sync.errorCount ? 'alert' : 'status'} className="summary-panel-empty">{message}</p>
}

export default function SummaryView({ repos, session, range, onRangeChange }: { repos: RepoConfig[]; session: Session; range: DateRange; onRangeChange: (range: DateRange) => void }) {
  const [comparisonRange, setComparisonRange] = useState<string | null>(null)
  const [showRebuildConfirm, setShowRebuildConfirm] = useState(false)
  const rangeKey = `${range.from}-${range.to}`
  const compare = comparisonRange === rangeKey
  const historySync = useSummaryHistory(repos, session, range)
  const previousRange = previousDateRange(range)
  const comparisonSync = useSummaryHistory(repos, session, previousRange, compare)
  const { history } = historySync

  const summary = useMemo(() => summaryMetricsForRange(history, repos, session, range), [history, range, repos, session])
  const previousSummary = comparisonSync.isComplete ? summaryMetricsForRange(comparisonSync.history, repos, session, previousRange) : undefined
  const label = `${formatDate(`${range.from}T12:00:00`)} — ${formatDate(`${range.to}T12:00:00`)}`
  const coverage = historySync.isComplete ? 'complete' : 'partial'
  const historyCount = summary.reviewed
  const rebuildHistory = () => {
    void historySync.reload()
    setShowRebuildConfirm(false)
    toast('Recargando el período', { description: 'Conservamos lo guardado mientras volvemos a consultar Bitbucket.' })
  }

  return <section className="product-view summary-view" aria-labelledby="summary-title">
    <div className="queue-intro"><div><span className="section-kicker">Actividad personal</span><h1 id="summary-title">Tu resumen</h1><p>Una lectura rápida de tu trabajo de revisión en Bitbucket.</p></div><span className="view-period"><TrendingUp size={16} /> {label}</span></div>
    <DateRangePicker value={range} onChange={onRangeChange} />
    <SummaryHistoryStatus sync={historySync} historyCount={historyCount} reposCount={repos.length} />
    <SummaryBody sync={historySync} summary={summary} previousSummary={previousSummary} coverage={coverage} range={range} />
    <div className="summary-footer-note"><CalendarClock size={15} /> <span>Importamos por año y repositorio; cambiar de mes reutiliza las páginas guardadas.</span><button type="button" className="text-button" onClick={() => { setComparisonRange(rangeKey); if (compare) void comparisonSync.refresh() }} disabled={comparisonSync.syncing || !repos.length}>{comparisonSync.syncing ? 'Cargando comparación…' : comparisonSync.errorCount && compare ? 'Reintentar comparación' : 'Comparar con período anterior'}</button><SummaryDownload sync={historySync} repos={repos} session={session} range={range} /><button type="button" className="text-button summary-history-reset" onClick={() => setShowRebuildConfirm(true)} disabled={historySync.syncing || !repos.length}><RotateCcw size={13} /> Recargar período</button></div>
    {!historySync.isComplete && <p className="summary-footer-note">El informe estará disponible al completar la importación. Los datos parciales no se exportan como definitivos.</p>}
    <p className="summary-footer-note">El avance es local a este navegador; no se sincroniza entre PCs y puede perderse si borras sus datos.</p>
    {compare && <ComparisonStatus sync={comparisonSync} />}
    <AnimatePresence>{showRebuildConfirm && <ConfirmDialog title="¿Volver a cargar el histórico?" description="Volveremos a consultar el listado y toda la actividad de los años y repositorios del período. Esto puede consumir muchas consultas. Conservamos los datos anteriores si ocurre un error." confirmLabel="Recargar histórico" onConfirm={rebuildHistory} onClose={() => setShowRebuildConfirm(false)} />}</AnimatePresence>
  </section>
}
