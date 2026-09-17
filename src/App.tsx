import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import {
  Bell,
  GitBranch,
  GitPullRequest,
  RefreshCw,
  ScanEye,
  Settings2,
  WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'
import Avatar from './components/Avatar'
import Login from './components/Login'
import NotificationPanel from './components/NotificationPanel'
import QueueView from './components/QueueView'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { useReviewQueueFilters } from './hooks/useReviewQueueFilters'
import { usePullRequestQueue } from './hooks/usePullRequestQueue'
import { useDashboardNotifications } from './hooks/useDashboardNotifications'
import { displayName, pullRequestKey } from './lib/dashboard'
import type { LifecycleFilter, ReviewFilter } from './lib/dashboard'
import {
  clearSession,
  defaultNotificationPreferences,
  getNotificationPreferences,
  getGitWorkflowSettings,
  getRepos,
  getSession,
  saveNotificationPreferences,
  saveGitWorkflowSettings,
} from './lib/storage'
import type { GitWorkflowSettings, NotificationPreferences, RepoConfig, Session } from './types'

const SettingsDialog = lazy(() => import('./components/SettingsDialog'))
const SummaryView = lazy(() => import('./components/SummaryView'))
const AuthorsView = lazy(() => import('./components/AuthorsView'))

type AppView = 'queue' | 'summary' | 'authors'

export default function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const value = getSession()
    return value && value.expiresAt > Date.now() ? value : null
  })

  useEffect(() => {
    if (!session) return
    const timer = window.setInterval(() => {
      if (Date.now() < session.expiresAt) return
      clearSession()
      setSession(null)
      toast('La sesión expiró.')
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [session])

  if (!session) return <Login onLogin={setSession} />
  return <Dashboard session={session} setSession={setSession} />
}

type DashboardLayoutProps = {
  session: Session
  repos: RepoConfig[]
  activeView: AppView
  onViewChange: (view: AppView) => void
  reviewCount: number
  fetching: boolean
  isOnline: boolean
  allRepositoriesFailed: boolean
  errorCount: number
  latestSync: number
  onRefresh: () => void
  notificationCenter: ReturnType<typeof useDashboardNotifications>
  settingsTriggerRef: React.RefObject<HTMLButtonElement>
  onOpenSettings: () => void
  showSettings: boolean
  preferences: NotificationPreferences
  onUpdatePreferences: (next: NotificationPreferences) => void
  onRequestDesktop: () => Promise<void>
  onTestSound: () => void
  onCloseSettings: () => void
  onLogout: () => void
  allPrs: ReturnType<typeof usePullRequestQueue>['allPrs']
  visiblePrs: ReturnType<typeof useReviewQueueFilters>['visiblePrs']
  sortedPrs: ReturnType<typeof useReviewQueueFilters>['sortedPrs']
  statusCounts: ReturnType<typeof useReviewQueueFilters>['statusCounts']
  filterRepo: string
  filterLifecycle: LifecycleFilter
  filterReview: ReviewFilter
  setFilterRepo: (value: string) => void
  setFilterLifecycle: (value: LifecycleFilter) => void
  setFilterReview: (value: ReviewFilter) => void
  gitWorkflowSettings: GitWorkflowSettings
  onGitWorkflowSettingsChange: (settings: GitWorkflowSettings) => void
  onResetFilters: () => void
  highlightedPrKey: string | null
  visibleLimit: number
  onLoadMore: () => void
  loadingIsSlow: boolean
  initialLoading: boolean
  fetchedRepositories: number
  repositoryCount: number
  loadingProgress: number
  setRepos: (repos: RepoConfig[]) => void
}

function syncLabelFor({ isOnline, fetching, allRepositoriesFailed, errorCount }: Pick<DashboardLayoutProps, 'isOnline' | 'fetching' | 'allRepositoriesFailed' | 'errorCount'>) {
  if (!isOnline || allRepositoriesFailed) return isOnline ? 'Sin conexión' : 'Sin conexión'
  if (fetching) return 'Sincronizando'
  if (errorCount > 0) return 'Conexión parcial'
  return 'Conectado'
}

function syncDetailFor({ isOnline, fetching, allRepositoriesFailed, errorCount, latestSync }: Pick<DashboardLayoutProps, 'isOnline' | 'fetching' | 'allRepositoriesFailed' | 'errorCount' | 'latestSync'>) {
  if (!isOnline) return 'Se reanudará automáticamente'
  if (allRepositoriesFailed) return 'Requiere atención'
  if (errorCount > 0 && !fetching) return `${errorCount} ${errorCount === 1 ? 'repositorio pendiente' : 'repositorios pendientes'}`
  if (latestSync) return `Última lectura ${new Date(latestSync).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`
  return 'Bitbucket Cloud'
}

function DashboardHeader({ session, activeView, onViewChange, reviewCount, fetching, isOnline, allRepositoriesFailed, errorCount, latestSync, onRefresh, notificationCenter, settingsTriggerRef, onOpenSettings }: Pick<DashboardLayoutProps, 'session' | 'activeView' | 'onViewChange' | 'reviewCount' | 'fetching' | 'isOnline' | 'allRepositoriesFailed' | 'errorCount' | 'latestSync' | 'onRefresh' | 'notificationCenter' | 'settingsTriggerRef' | 'onOpenSettings'>) {
  const userName = displayName(session.displayName, session.email)
  const { notices, noticePresentations, unread, showNotices, notificationTriggerRef, markNoticeRead, locateNotice, deleteNotice, clearNotices, toggleNotices, closeNotices } = notificationCenter
  const syncLabel = syncLabelFor({ isOnline, fetching, allRepositoriesFailed, errorCount })
  const syncDetail = syncDetailFor({ isOnline, fetching, allRepositoriesFailed, errorCount, latestSync })
  return <header className="topbar">
    <div className="topbar-leading"><div className="brand"><span className="brand-mark"><GitPullRequest size={19} /></span><span className="brand-copy"><strong>PR Control Room</strong><small>Bitbucket review intelligence</small></span></div></div>
    <nav className="desktop-nav" aria-label="Navegación principal de escritorio"><button type="button" className={activeView === 'queue' ? 'is-active' : ''} onClick={() => onViewChange('queue')}><GitPullRequest size={15} /> Cola{reviewCount > 0 && <b>{reviewCount}</b>}</button><button type="button" className={activeView === 'summary' ? 'is-active' : ''} onClick={() => onViewChange('summary')}><ScanEye size={15} /> Resumen</button><button type="button" className={activeView === 'authors' ? 'is-active' : ''} onClick={() => onViewChange('authors')}><GitBranch size={15} /> Preparar</button></nav>
    <div className="topbar-actions"><div className={`sync-status ${fetching && isOnline ? 'is-syncing' : ''} ${!isOnline || allRepositoriesFailed ? 'has-error' : errorCount > 0 && !fetching ? 'has-warning' : ''}`} role="status"><span className="sync-dot" /><span><strong>{syncLabel}</strong><small>{syncDetail}</small></span></div><button type="button" className="icon-button" onClick={onRefresh} aria-label="Actualizar pull requests" aria-busy={fetching} title="Actualizar pull requests"><RefreshCw size={18} className={fetching ? 'spin' : ''} /></button><div className="notification-control"><button ref={notificationTriggerRef} type="button" className="icon-button notification-trigger" onClick={toggleNotices} aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ''}`} aria-expanded={showNotices} title="Notificaciones"><Bell size={18} />{unread > 0 && <b>{unread}</b>}</button><AnimatePresence>{showNotices && <NotificationPanel notices={notices} presentations={noticePresentations} triggerRef={notificationTriggerRef} onClose={closeNotices} onRead={markNoticeRead} onSelect={locateNotice} onDelete={deleteNotice} onClear={clearNotices} />}</AnimatePresence></div><button ref={settingsTriggerRef} type="button" className="user-button" onClick={onOpenSettings} aria-label="Abrir configuración" title="Configuración"><Avatar name={userName} size="small" /><span><strong>{userName}</strong><small>Configuración</small></span><Settings2 size={16} /></button></div>
  </header>
}

function DashboardMain({ layout }: { layout: DashboardLayoutProps }) {
  const { activeView, onViewChange, reviewCount, repos, allPrs, visiblePrs, sortedPrs, statusCounts, session, filterRepo, filterLifecycle, filterReview, setFilterRepo, setFilterLifecycle, setFilterReview, gitWorkflowSettings, onGitWorkflowSettingsChange, onResetFilters, onRefresh, onLoadMore, highlightedPrKey, visibleLimit, errorCount, allRepositoriesFailed, fetching, initialLoading, loadingIsSlow, isOnline, fetchedRepositories, repositoryCount, loadingProgress } = layout
  const reduceMotion = useReducedMotion()
  return <main id="main-content" className="content"><Suspense fallback={<ViewLoading label={activeView === 'summary' ? 'Cargando resumen…' : 'Cargando preparación…'} />}><AnimatePresence mode="wait" initial={false}><m.div key={activeView} className={`dashboard-view dashboard-view-${activeView}`} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -6 }} transition={{ duration: reduceMotion ? 0 : .2, ease: 'easeOut' }}>{activeView === 'queue' ? <><section className="queue-intro" aria-labelledby="queue-title"><div><span className="section-kicker">Bandeja priorizada</span><h1 id="queue-title">Cola de revisión</h1><p>Prioridad y contexto para decidir sin volver a recorrer Bitbucket.</p></div><div className="attention-summary" aria-label={`${reviewCount} ${reviewCount === 1 ? 'requiere' : 'requieren'} tu revisión`}><span className="attention-icon"><ScanEye size={20} /></span><strong>{reviewCount}</strong><span>{reviewCount === 1 ? 'requiere' : 'requieren'}<br />tu revisión</span></div></section><QueueView repos={repos} allPrs={allPrs} visiblePrs={visiblePrs} sortedPrs={sortedPrs} statusCounts={statusCounts} session={session} filterRepo={filterRepo} filterLifecycle={filterLifecycle} filterReview={filterReview} setFilterRepo={setFilterRepo} setFilterLifecycle={setFilterLifecycle} setFilterReview={setFilterReview} gitWorkflowSettings={gitWorkflowSettings} onGitWorkflowSettingsChange={onGitWorkflowSettingsChange} onOpenPreparation={() => onViewChange('authors')} onReset={onResetFilters} onRetry={onRefresh} onLoadMore={onLoadMore} highlightedPrKey={highlightedPrKey} visibleLimit={visibleLimit} errorCount={errorCount} allRepositoriesFailed={allRepositoriesFailed} fetching={fetching} initialLoading={initialLoading} loadingIsSlow={loadingIsSlow} isOnline={isOnline} fetchedRepositories={fetchedRepositories} repositoryCount={repositoryCount} loadingProgress={loadingProgress} /></> : activeView === 'summary' ? <SummaryView prs={allPrs} repos={repos} session={session} /> : <AuthorsView prs={allPrs} repos={repos} setRepos={layout.setRepos} settings={gitWorkflowSettings} onChange={onGitWorkflowSettingsChange} />}</m.div></AnimatePresence></Suspense></main>
}

function ViewLoading({ label }: { label: string }) {
  return <div className="view-loading" role="status" aria-label={label}><span className="loading-orbit" aria-hidden="true" /><strong>{label}</strong><small>Preparando la vista…</small></div>
}

function DashboardMobileNav({ activeView, onViewChange, reviewCount, onOpenSettings }: Pick<DashboardLayoutProps, 'activeView' | 'onViewChange' | 'reviewCount' | 'onOpenSettings'>) {
  return <nav className="mobile-bottom-nav" aria-label="Navegación principal móvil"><button type="button" className={activeView === 'queue' ? 'is-active' : ''} onClick={() => onViewChange('queue')}><GitPullRequest size={19} /><span>Cola</span>{reviewCount > 0 && <b>{reviewCount}</b>}</button><button type="button" className={activeView === 'summary' ? 'is-active' : ''} onClick={() => onViewChange('summary')}><ScanEye size={19} /><span>Resumen</span></button><button type="button" className={activeView === 'authors' ? 'is-active' : ''} onClick={() => onViewChange('authors')}><GitBranch size={19} /><span>Preparar</span></button><button type="button" onClick={onOpenSettings}><Settings2 size={19} /><span>Más</span></button></nav>
}

function DashboardSettings({ layout }: { layout: DashboardLayoutProps }) {
  if (!layout.showSettings) return null
  return <AnimatePresence><Suspense fallback={null}><SettingsDialog preferences={layout.preferences} setPreferences={layout.onUpdatePreferences} triggerRef={layout.settingsTriggerRef} requestDesktop={layout.onRequestDesktop} testSound={layout.onTestSound} onClose={layout.onCloseSettings} onLogout={layout.onLogout} /></Suspense></AnimatePresence>
}

function DashboardLayout(layoutProps: DashboardLayoutProps) {
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Saltar a la cola</a>
    <DashboardHeader session={layoutProps.session} activeView={layoutProps.activeView} onViewChange={layoutProps.onViewChange} reviewCount={layoutProps.reviewCount} fetching={layoutProps.fetching} isOnline={layoutProps.isOnline} allRepositoriesFailed={layoutProps.allRepositoriesFailed} errorCount={layoutProps.errorCount} latestSync={layoutProps.latestSync} onRefresh={layoutProps.onRefresh} notificationCenter={layoutProps.notificationCenter} settingsTriggerRef={layoutProps.settingsTriggerRef} onOpenSettings={layoutProps.onOpenSettings} />
    <DashboardMain layout={layoutProps} />
    <DashboardMobileNav activeView={layoutProps.activeView} onViewChange={layoutProps.onViewChange} reviewCount={layoutProps.reviewCount} onOpenSettings={layoutProps.onOpenSettings} />
    <DashboardSettings layout={layoutProps} />
  </div>
}

function Dashboard({ session, setSession }: { session: Session; setSession: (session: Session | null) => void }) {
  const [repos, setRepos] = useState<RepoConfig[]>(getRepos)
  const [filterRepo, setFilterRepo] = useState('all')
  const [filterLifecycle, setFilterLifecycle] = useState<LifecycleFilter>('OPEN')
  const [filterReview, setFilterReview] = useState<ReviewFilter>('ATTENTION')
  const [visibleLimit, setVisibleLimit] = useState(20)
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => ({
    ...defaultNotificationPreferences,
    ...getNotificationPreferences(),
  }))
  const [gitWorkflowSettings, setGitWorkflowSettings] = useState<GitWorkflowSettings>(() => getGitWorkflowSettings())
  const [showSettings, setShowSettings] = useState(false)
  const [activeView, setActiveView] = useState<AppView>('queue')
  const [highlightedPrKey, setHighlightedPrKey] = useState<string | null>(null)
  const [loadingIsSlow, setLoadingIsSlow] = useState(false)
  const settingsTriggerRef = useRef<HTMLButtonElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const pendingLocateRef = useRef<string | null>(null)
  const isOnline = useOnlineStatus()

  const updateGitWorkflowSettings = useCallback((settings: GitWorkflowSettings) => {
    setGitWorkflowSettings(settings)
    saveGitWorkflowSettings(settings)
  }, [])

  useEffect(() => {
    if (!session || !preferences.sound || !window.AudioContext) return
    const unlockSound = () => {
      const context = audioContextRef.current || new window.AudioContext()
      audioContextRef.current = context
      void context.resume()
    }
    window.addEventListener('pointerdown', unlockSound, { once: true })
    return () => window.removeEventListener('pointerdown', unlockSound)
  }, [preferences.sound, session])

  const {
    queries,
    allPrs,
    fetching,
    fetchedRepositories,
    initialLoading,
    loadingProgress,
    errors,
    initialSyncComplete,
    syncVersion,
    successfulRepositoryKeys,
    latestSync,
  } = usePullRequestQueue(session, repos)
  const notificationCenter = useDashboardNotifications({
    allPrs,
    initialLoading,
    initialSyncComplete,
    latestSync,
    repos,
    session,
    successfulRepositoryKeys,
    syncVersion,
    preferences,
    audioContextRef,
    setFilterRepo,
    setFilterLifecycle,
    setFilterReview,
    setVisibleLimit,
    setHighlightedPrKey,
    pendingLocateRef,
  })
  const { playSound } = notificationCenter
  useEffect(() => {
    if (!initialLoading || !isOnline) {
      setLoadingIsSlow(false)
      return
    }

    const timer = window.setTimeout(() => setLoadingIsSlow(true), 6_000)
    return () => window.clearTimeout(timer)
  }, [initialLoading, isOnline])

  const updatePreferences = (next: NotificationPreferences) => {
    setPreferences(next)
    saveNotificationPreferences(next)
  }

  const testSound = () => {
    if (!window.AudioContext) {
      toast.error('Este navegador no permite reproducir sonidos aquí.')
      return
    }
    const context = audioContextRef.current || new window.AudioContext()
    audioContextRef.current = context
    void context.resume()
    playSound()
    updatePreferences({ ...preferences, sound: true })
    toast.success('Sonido activado')
  }

  const requestDesktop = async () => {
    if (!('Notification' in window)) {
      toast.error('Este navegador no soporta notificaciones del sistema.')
      return
    }
    const permission = Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission
    if (permission === 'granted') {
      updatePreferences({ ...preferences, desktop: true })
      toast.success('Notificaciones del sistema activadas')
      return
    }
    toast.error('El navegador no concedió permiso para las notificaciones.')
  }

  useEffect(() => {
    if (pendingLocateRef.current) return
    setVisibleLimit(20)
  }, [filterRepo, filterLifecycle, filterReview])
  const { sortedPrs, visiblePrs, statusCounts, reviewCount } = useReviewQueueFilters({ allPrs, session, filterRepo, filterLifecycle, filterReview, visibleLimit })
  const visiblePullRequestKeys = visiblePrs.map(pullRequestKey).join('|')
  const allRepositoriesFailed = queries.length > 0 && errors.length === queries.length && !fetching
  const resetFilters = () => {
    setFilterRepo('all')
    setFilterLifecycle('OPEN')
    setFilterReview('ATTENTION')
  }
  const refresh = () => {
    if (!isOnline) {
      toast.error('No hay conexión a internet', {
        id: 'manual-refresh-offline',
        description: 'La cola se sincronizará automáticamente cuando vuelvas a estar en línea.',
        icon: <WifiOff size={16} />,
      })
      return
    }

    queries.forEach((query) => void query.refetch())
    toast('Sincronizando con Bitbucket…', { id: 'manual-refresh', icon: <RefreshCw size={16} /> })
  }
  const closeSettings = useCallback(() => setShowSettings(false), [])

  useEffect(() => {
    if (!highlightedPrKey) return
    const frame = window.requestAnimationFrame(() => {
      const record = Array.from(document.querySelectorAll<HTMLElement>('[data-pr-key]'))
        .find((element) => element.dataset.prKey === highlightedPrKey)
      pendingLocateRef.current = null
      if (!record) return
      record.focus({ preventScroll: true })
      record.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'center',
      })
    })
    const timer = window.setTimeout(() => setHighlightedPrKey(null), 4_500)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [highlightedPrKey, visiblePullRequestKeys])

  return <DashboardLayout
    session={session}
    repos={repos}
    activeView={activeView}
    onViewChange={setActiveView}
    reviewCount={reviewCount}
    fetching={fetching}
    isOnline={isOnline}
    allRepositoriesFailed={allRepositoriesFailed}
    errorCount={errors.length}
    latestSync={latestSync}
    onRefresh={refresh}
    notificationCenter={notificationCenter}
    settingsTriggerRef={settingsTriggerRef}
    onOpenSettings={() => setShowSettings(true)}
    showSettings={showSettings}
    preferences={preferences}
    onUpdatePreferences={updatePreferences}
    onRequestDesktop={requestDesktop}
    onTestSound={testSound}
    onCloseSettings={closeSettings}
    onLogout={() => { clearSession(); setSession(null) }}
    allPrs={allPrs}
    visiblePrs={visiblePrs}
    sortedPrs={sortedPrs}
    statusCounts={statusCounts}
    filterRepo={filterRepo}
    filterLifecycle={filterLifecycle}
    filterReview={filterReview}
    setFilterRepo={setFilterRepo}
    setFilterLifecycle={setFilterLifecycle}
    setFilterReview={setFilterReview}
    gitWorkflowSettings={gitWorkflowSettings}
    onGitWorkflowSettingsChange={updateGitWorkflowSettings}
    onResetFilters={resetFilters}
    highlightedPrKey={highlightedPrKey}
    visibleLimit={visibleLimit}
    onLoadMore={() => setVisibleLimit((limit) => limit + 20)}
    loadingIsSlow={loadingIsSlow}
    initialLoading={initialLoading}
    fetchedRepositories={fetchedRepositories}
    repositoryCount={queries.length}
    loadingProgress={loadingProgress}
    setRepos={setRepos}
  />
}
