import { AnimatePresence } from 'framer-motion'
import {
  CheckCircle2,
  CircleAlert,
  GitBranch,
  GitPullRequest,
  RefreshCw,
  ScanEye,
  SlidersHorizontal,
  WifiOff,
} from 'lucide-react'
import FilterToolbar from './FilterToolbar'
import PullRequestRecord from './PullRequestRecord'
import { pullRequestKey } from '../lib/dashboard'
import type { LifecycleFilter, ReviewFilter } from '../lib/dashboard'
import type { GitWorkflowSettings, PullRequest, RepoConfig, Session } from '../types'

function PullRequestSkeleton() {
  return (
    <div className="pr-skeleton" aria-hidden="true">
      <div className="skeleton-primary">
        <div className="skeleton-heading"><span /><span /><span /></div>
        <div className="skeleton-line skeleton-title" />
        <div className="skeleton-context"><span /><span><i /><i /></span><i /></div>
        <div className="skeleton-handoff"><span /><i /><span /><b><i /><i /></b></div>
      </div>
      <div className="skeleton-reviewers">
        <span className="skeleton-reviewer-label" />
        <div><span /><span /><span /></div>
        <i><span /><span /></i>
      </div>
      <span className="skeleton-action" />
      <div className="skeleton-stats"><span /><span /><span /><span /><span /><span /></div>
    </div>
  )
}

function EmptySignal() {
  return (
    <span className="empty-signal" aria-hidden="true">
      <span className="empty-signal-orbit"><i /></span>
      <span className="empty-icon"><CheckCircle2 size={25} /></span>
    </span>
  )
}

function EmptyQueue({ repos, filterLifecycle, filterReview, hasLoadError, onReset, onConfigure, onRetry }: {
  repos: RepoConfig[]
  filterLifecycle: LifecycleFilter
  filterReview: ReviewFilter
  hasLoadError: boolean
  onReset: () => void
  onConfigure: () => void
  onRetry: () => void
}) {
  if (!repos.length) {
    return <div className="empty-state" role="status"><span className="empty-icon"><GitPullRequest size={24} /></span><span className="empty-kicker">Sin fuentes conectadas</span><h3>Conecta tu primer repositorio</h3><p>Agrega un repositorio de Bitbucket para empezar a construir tu cola.</p><button type="button" className="button button-primary" onClick={onConfigure}><GitBranch size={17} /> Preparar repositorios</button></div>
  }
  if (hasLoadError) {
    return <div className="empty-state empty-error" role="alert"><span className="empty-icon"><CircleAlert size={24} /></span><span className="empty-kicker">Sin respuesta de Bitbucket</span><h3>No pudimos completar la cola</h3><p>Bitbucket no devolvió información disponible. Tus filtros y preferencias siguen intactos.</p><button type="button" className="button button-secondary" onClick={onRetry}><RefreshCw size={16} /> Reintentar conexión</button></div>
  }
  if (filterLifecycle === 'OPEN' && filterReview === 'ATTENTION') {
    return <div className="empty-state empty-success" role="status"><EmptySignal /><span className="empty-kicker">Escaneo completado</span><h3>Tu cola está al día</h3><p>No hay pull requests abiertos que necesiten tu revisión.</p></div>
  }
  return <div className="empty-state" role="status"><span className="empty-icon"><SlidersHorizontal size={24} /></span><span className="empty-kicker">Sin coincidencias</span><h3>No hay resultados con estos filtros</h3><p>La información sigue disponible; prueba con otra combinación.</p><button type="button" className="button button-secondary" onClick={onReset}>Restablecer filtros</button></div>
}

type QueueViewProps = {
  repos: RepoConfig[]
  allPrs: PullRequest[]
  visiblePrs: PullRequest[]
  sortedPrs: PullRequest[]
  statusCounts: Record<LifecycleFilter, number>
  session: Session
  filterRepo: string
  filterLifecycle: LifecycleFilter
  filterReview: ReviewFilter
  setFilterRepo: (value: string) => void
  setFilterLifecycle: (value: LifecycleFilter) => void
  setFilterReview: (value: ReviewFilter) => void
  gitWorkflowSettings: GitWorkflowSettings
  onGitWorkflowSettingsChange: (settings: GitWorkflowSettings) => void
  onOpenPreparation: () => void
  onReset: () => void
  onRetry: () => void
  onLoadMore: () => void
  highlightedPrKey: string | null
  visibleLimit: number
  errorCount: number
  allRepositoriesFailed: boolean
  fetching: boolean
  initialLoading: boolean
  loadingIsSlow: boolean
  isOnline: boolean
  fetchedRepositories: number
  repositoryCount: number
  loadingProgress: number
}

export default function QueueView({
  repos,
  allPrs,
  visiblePrs,
  sortedPrs,
  statusCounts,
  session,
  filterRepo,
  filterLifecycle,
  filterReview,
  setFilterRepo,
  setFilterLifecycle,
  setFilterReview,
  gitWorkflowSettings,
  onGitWorkflowSettingsChange,
  onOpenPreparation,
  onReset,
  onRetry,
  onLoadMore,
  highlightedPrKey,
  visibleLimit,
  errorCount,
  allRepositoriesFailed,
  fetching,
  initialLoading,
  loadingIsSlow,
  isOnline,
  fetchedRepositories,
  repositoryCount,
  loadingProgress,
}: QueueViewProps) {
  const hasLoadError = errorCount > 0 && allPrs.length === 0

  return <>
    <FilterToolbar filterLifecycle={filterLifecycle} setFilterLifecycle={setFilterLifecycle} filterRepo={filterRepo} setFilterRepo={setFilterRepo} filterReview={filterReview} setFilterReview={setFilterReview} statusCounts={statusCounts} repos={repos} allPrs={allPrs} resultCount={sortedPrs.length} onReset={onReset} />

    {errorCount > 0 && allPrs.length > 0 && <div className="error-banner" role="alert"><span><CircleAlert size={18} /></span><div><strong>{allRepositoriesFailed ? 'No pudimos conectar con Bitbucket' : errorCount === 1 ? '1 repositorio no pudo actualizarse' : `${errorCount} repositorios no pudieron actualizarse`}</strong><p>Conservamos la información disponible. Revisa tus credenciales o intenta nuevamente.</p></div><button type="button" className="button button-secondary" onClick={onRetry}>Reintentar</button></div>}

    {initialLoading && <div className={`loading-status${loadingIsSlow ? ' is-slow' : ''}${!isOnline ? ' is-offline' : ''}`} role="status" aria-live="polite"><span className="loading-status-icon">{isOnline ? <RefreshCw className="spin" size={18} /> : <WifiOff size={18} />}</span><span><strong>{!isOnline ? 'Sin conexión a internet' : loadingIsSlow ? 'Bitbucket está tardando un poco' : 'Preparando tu cola'}</strong><small>{!isOnline ? 'La sincronización continuará cuando recuperes la conexión.' : loadingIsSlow ? `${fetchedRepositories} de ${repositoryCount} repositorios listos · seguimos intentando.` : `${fetchedRepositories} de ${repositoryCount} repositorios sincronizados`}</small></span><span className="loading-progress" role="progressbar" aria-label="Repositorios sincronizados" aria-valuemin={0} aria-valuemax={repositoryCount} aria-valuenow={fetchedRepositories}><i style={{ width: `${loadingProgress}%` }} /></span></div>}

    <section className="queue-section" aria-labelledby="pull-requests-title">
      <header className="queue-section-heading"><h2 id="pull-requests-title">Prioridad de revisión</h2><span className={`queue-sync-note ${fetching || !isOnline ? 'is-visible' : ''}`}>{isOnline ? <RefreshCw size={14} className={fetching ? 'spin' : ''} /> : <WifiOff size={14} />}{isOnline ? 'Actualizando actividad' : 'Sin conexión'}</span></header>
      <div className="queue-surface">
        <div className="queue-columns" aria-hidden="true"><span>Pull request · relevo</span><span>Actividad QA</span><span>Acciones</span></div>
        <div className="pr-list" aria-busy={initialLoading && !allPrs.length}>
          <AnimatePresence mode="popLayout">{visiblePrs.map((pr) => <PullRequestRecord key={`${pr.repo.workspace}/${pr.repo.repo}-${pr.id}`} pr={pr} session={session} highlighted={pullRequestKey(pr) === highlightedPrKey} gitWorkflowSettings={gitWorkflowSettings} onGitWorkflowSettingsChange={onGitWorkflowSettingsChange} onOpenSettings={onOpenPreparation} />)}</AnimatePresence>
          {initialLoading && !allPrs.length && <><PullRequestSkeleton /><PullRequestSkeleton /><PullRequestSkeleton /></>}
          {!initialLoading && !sortedPrs.length && <EmptyQueue repos={repos} filterLifecycle={filterLifecycle} filterReview={filterReview} hasLoadError={hasLoadError} onReset={onReset} onConfigure={onOpenPreparation} onRetry={onRetry} />}
        </div>
      </div>
      {visibleLimit < sortedPrs.length && <button type="button" className="load-more" onClick={onLoadMore}>Mostrar 20 más <span>{sortedPrs.length - visibleLimit} restantes</span></button>}
    </section>
  </>
}
