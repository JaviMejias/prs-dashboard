import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { AnimatePresence } from 'framer-motion'
import {
  Bell,
  CheckCircle2,
  CircleAlert,
  CircleSlash2,
  FilePenLine,
  GitMerge,
  GitPullRequest,
  LocateFixed,
  RefreshCw,
  ScanEye,
  Settings2,
  SlidersHorizontal,
  WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'
import Avatar from './components/Avatar'
import FilterToolbar from './components/FilterToolbar'
import Login from './components/Login'
import NotificationPanel from './components/NotificationPanel'
import PullRequestRecord from './components/PullRequestRecord'
import SettingsDialog from './components/SettingsDialog'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { getLifecycleStatus, getPullRequests } from './lib/bitbucket'
import {
  comparePullRequests,
  displayName,
  getLifecycleCounts,
  matchesReviewFilter,
  pullRequestKey,
  requiresReview,
} from './lib/dashboard'
import type { LifecycleFilter, ReviewFilter } from './lib/dashboard'
import {
  createPullRequestNotice,
  getActionableNoticeKind,
  getNoticePresentation,
  getObservedRepositories,
  noticeReferencesPullRequest,
  PULL_REQUEST_POLL_INTERVAL_MS,
  repositoryKey,
  repositorySnapshotKey,
} from './lib/notifications'
import {
  clearSession,
  defaultNotificationPreferences,
  getNotificationPreferences,
  getNotices,
  getRepos,
  getSession,
  getSnapshot,
  saveNotices,
  saveNotificationPreferences,
  saveSnapshot,
} from './lib/storage'
import type { LifecycleStatus, Notice, NotificationPreferences, NotificationSnapshot, RepoConfig, Session } from './types'

const locatedFeedback: Record<LifecycleStatus, {
  title: string
  description: string
  icon: typeof LocateFixed
  tone: string
}> = {
  OPEN: {
    title: 'PR localizado en tu cola',
    description: 'Ajustamos la vista y lo señalamos durante unos segundos.',
    icon: LocateFixed,
    tone: 'open',
  },
  DRAFT: {
    title: 'Este PR ahora es borrador',
    description: 'Te mostramos el estado que Bitbucket informa actualmente.',
    icon: FilePenLine,
    tone: 'draft',
  },
  QUEUED: {
    title: 'Este PR está en cola para fusionarse',
    description: 'Ya no aparece como una revisión pendiente.',
    icon: GitMerge,
    tone: 'queued',
  },
  MERGED: {
    title: 'Este PR ya fue fusionado',
    description: 'Abrimos su estado actual para cerrar el contexto del aviso.',
    icon: CheckCircle2,
    tone: 'merged',
  },
  DECLINED: {
    title: 'Este PR fue rechazado',
    description: 'Abrimos su estado actual para cerrar el contexto del aviso.',
    icon: CircleSlash2,
    tone: 'declined',
  },
}

function playDashboardSound(context: AudioContext) {
  if (context.state === 'suspended') {
    void context.resume().then(() => playDashboardSound(context))
    return
  }
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(740, context.currentTime)
  oscillator.frequency.exponentialRampToValueAtTime(980, context.currentTime + 0.12)
  gain.gain.setValueAtTime(0.0001, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.24, context.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + 0.24)
}

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

function EmptyQueue({
  repos,
  filterLifecycle,
  filterReview,
  hasLoadError,
  onReset,
  onConfigure,
  onRetry,
}: {
  repos: RepoConfig[]
  filterLifecycle: LifecycleFilter
  filterReview: ReviewFilter
  hasLoadError: boolean
  onReset: () => void
  onConfigure: () => void
  onRetry: () => void
}) {
  if (!repos.length) {
    return (
      <div className="empty-state" role="status">
        <span className="empty-icon"><GitPullRequest size={24} /></span>
        <span className="empty-kicker">Sin fuentes conectadas</span>
        <h3>Conecta tu primer repositorio</h3>
        <p>Agrega un repositorio de Bitbucket para empezar a construir tu cola.</p>
        <button type="button" className="button button-primary" onClick={onConfigure}><Settings2 size={17} /> Configurar repositorios</button>
      </div>
    )
  }

  if (hasLoadError) {
    return (
      <div className="empty-state empty-error" role="alert">
        <span className="empty-icon"><CircleAlert size={24} /></span>
        <span className="empty-kicker">Sin respuesta de Bitbucket</span>
        <h3>No pudimos completar la cola</h3>
        <p>Bitbucket no devolvió información disponible. Tus filtros y preferencias siguen intactos.</p>
        <button type="button" className="button button-secondary" onClick={onRetry}><RefreshCw size={16} /> Reintentar conexión</button>
      </div>
    )
  }

  if (filterLifecycle === 'OPEN' && filterReview === 'ATTENTION') {
    return (
      <div className="empty-state empty-success" role="status">
        <EmptySignal />
        <span className="empty-kicker">Escaneo completado</span>
        <h3>Tu cola está al día</h3>
        <p>No hay pull requests abiertos que necesiten tu revisión.</p>
      </div>
    )
  }

  return (
    <div className="empty-state" role="status">
      <span className="empty-icon"><SlidersHorizontal size={24} /></span>
      <span className="empty-kicker">Sin coincidencias</span>
      <h3>No hay resultados con estos filtros</h3>
      <p>La información sigue disponible; prueba con otra combinación.</p>
      <button type="button" className="button button-secondary" onClick={onReset}>Restablecer filtros</button>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const value = getSession()
    return value && value.expiresAt > Date.now() ? value : null
  })
  const [repos, setRepos] = useState<RepoConfig[]>(getRepos)
  const [filterRepo, setFilterRepo] = useState('all')
  const [filterLifecycle, setFilterLifecycle] = useState<LifecycleFilter>('OPEN')
  const [filterReview, setFilterReview] = useState<ReviewFilter>('ATTENTION')
  const [visibleLimit, setVisibleLimit] = useState(20)
  const [notices, setNotices] = useState<Notice[]>(getNotices)
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => ({
    ...defaultNotificationPreferences,
    ...getNotificationPreferences(),
  }))
  const [showNotices, setShowNotices] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [highlightedPrKey, setHighlightedPrKey] = useState<string | null>(null)
  const [ignoreRevision, setIgnoreRevision] = useState(0)
  const [loadingIsSlow, setLoadingIsSlow] = useState(false)
  const notificationTriggerRef = useRef<HTMLButtonElement>(null)
  const settingsTriggerRef = useRef<HTMLButtonElement>(null)
  const snapshotRef = useRef<NotificationSnapshot>(getSnapshot())
  const audioContextRef = useRef<AudioContext | null>(null)
  const pendingLocateRef = useRef<string | null>(null)
  const isOnline = useOnlineStatus()

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

  const queries = useQueries({
    queries: session ? repos.map((repo) => ({
      queryKey: ['prs-v2', repo.workspace, repo.repo],
      queryFn: () => getPullRequests(repo, session),
      refetchInterval: PULL_REQUEST_POLL_INTERVAL_MS,
      refetchIntervalInBackground: true,
      staleTime: 10_000,
    })) : [],
  })
  const allPrs = useMemo(() => Array.from(new Map(
    queries
      .flatMap((query) => query.data || [])
      .map((pr) => [`${pr.repo.workspace}/${pr.repo.repo}#${pr.id}`, pr]),
  ).values()), [queries])
  const noticePresentations = useMemo(() => new Map(notices.map((notice) => {
    const pullRequest = allPrs.find((pr) => noticeReferencesPullRequest(notice, pr))
    return [notice.id, getNoticePresentation(notice, pullRequest, session?.uuid)]
  })), [allPrs, ignoreRevision, notices, session?.uuid])
  const fetching = queries.some((query) => query.isFetching)
  const fetchedRepositories = queries.filter((query) => query.isFetched).length
  const initialLoading = queries.length > 0 && fetchedRepositories < queries.length
  const loadingProgress = queries.length ? (fetchedRepositories / queries.length) * 100 : 0
  const errors = queries.filter((query) => query.isError)
  const initialSyncComplete = queries.length > 0 && queries.every((query) => query.isFetched)
  const syncVersion = queries.map((query) => query.dataUpdatedAt).join(':')
  const successfulRepositoryKeys = repos
    .filter((_, index) => queries[index]?.isSuccess)
    .map(repositoryKey)
    .join('|')
  const latestSync = Math.max(0, ...queries.map((query) => query.dataUpdatedAt))

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
    playDashboardSound(context)
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

  const markNoticeRead = useCallback((id: string) => {
    setNotices((current) => {
      let changed = false
      const next = current.map((notice) => {
        if (notice.id !== id || notice.read) return notice
        changed = true
        return { ...notice, read: true }
      })
      if (changed) saveNotices(next)
      return changed ? next : current
    })
  }, [])

  const locateNotice = useCallback((notice: Notice) => {
    markNoticeRead(notice.id)
    setShowNotices(false)

    const target = allPrs.find((pr) => noticeReferencesPullRequest(notice, pr))
    if (!target) {
      toast('Este PR no está en la cola cargada', {
        id: `missing-${notice.id}`,
        description: initialLoading
          ? 'La sincronización todavía no termina. Puedes volver a intentarlo desde este aviso.'
          : 'Puede haberse cerrado, eliminado, no haberse sincronizado o pertenecer a un repositorio que ya no monitorizas.',
        icon: <span className="toast-icon is-declined" aria-hidden="true"><CircleAlert size={16} /></span>,
        action: notice.pullRequestUrl ? {
          label: 'Abrir en Bitbucket',
          onClick: () => window.open(notice.pullRequestUrl, '_blank', 'noopener,noreferrer'),
        } : undefined,
      })
      return
    }

    const targetKey = pullRequestKey(target)
    const lifecycle = getLifecycleStatus(target)
    const targetPosition = allPrs
      .filter((pr) => repositoryKey(pr.repo) === repositoryKey(target.repo) && getLifecycleStatus(pr) === lifecycle)
      .sort((first, second) => comparePullRequests(first, second, session?.uuid))
      .findIndex((pr) => pullRequestKey(pr) === targetKey)
    const feedback = locatedFeedback[lifecycle]
    const FeedbackIcon = feedback.icon

    pendingLocateRef.current = targetKey
    setFilterRepo(repositoryKey(target.repo))
    setFilterLifecycle(lifecycle)
    setFilterReview('ALL')
    setVisibleLimit(Math.max(20, targetPosition + 1))
    setHighlightedPrKey(targetKey)
    toast(feedback.title, {
      id: `located-${targetKey}`,
      description: feedback.description,
      icon: <span className={`toast-icon is-${feedback.tone}`} aria-hidden="true"><FeedbackIcon size={16} /></span>,
    })
  }, [allPrs, initialLoading, markNoticeRead, session?.uuid])

  useEffect(() => {
    if (!initialSyncComplete) return
    const previous = snapshotRef.current
    const observedRepositories = getObservedRepositories(previous)
    const successfulRepositories = new Set(successfulRepositoryKeys.split('|').filter(Boolean))
    const next = { ...previous }
    const fresh: Notice[] = []
    const detectedAt = Date.now()

    allPrs.forEach((pr) => {
      const pullRequestRepository = repositoryKey(pr.repo)
      if (!successfulRepositories.has(pullRequestRepository)) return

      const key = pullRequestKey(pr)
      const needsReview = requiresReview(pr, session?.uuid)
      const current = { updatedOn: pr.updated_on, needsReview }
      const kind = getActionableNoticeKind(
        previous[key],
        current,
        observedRepositories.has(pullRequestRepository),
      )

      if (kind) fresh.push(createPullRequestNotice(pr, kind, detectedAt))
      next[key] = current
    })

    successfulRepositories.forEach((key) => {
      const repo = repos.find((item) => repositoryKey(item) === key)
      if (!repo) return
      next[repositorySnapshotKey(repo)] = {
        updatedOn: new Date(latestSync || detectedAt).toISOString(),
        needsReview: false,
      }
    })

    snapshotRef.current = next
    saveSnapshot(next)
    if (!fresh.length) return

    if (fresh.length === 1) {
      const notice = fresh[0]
      toast(notice.kind === 'new-pr' ? 'Nuevo PR en tu cola' : 'Tu revisión es necesaria', {
        id: notice.id,
        description: notice.text,
        icon: <span className={`toast-icon is-${notice.kind}`} aria-hidden="true">{notice.kind === 'new-pr' ? <GitPullRequest size={16} /> : <ScanEye size={16} />}</span>,
        action: { label: 'Ver en la cola', onClick: () => locateNotice(notice) },
      })

      if (preferences.desktop && 'Notification' in window && Notification.permission === 'granted') {
        const desktopNotice = new Notification(
          notice.kind === 'new-pr' ? 'Nuevo PR en Bitbucket' : 'Tu revisión es necesaria',
          {
            body: `${notice.text} · ${notice.repositoryName} #${notice.pullRequestId}`,
            icon: '/icons/pwa-192.png',
            tag: notice.id,
          },
        )
        desktopNotice.onclick = () => {
          window.focus()
          locateNotice(notice)
          desktopNotice.close()
        }
      }
    } else {
      toast(`${fresh.length} PR requieren tu atención`, {
        id: `review-batch-${detectedAt}`,
        description: 'Los agrupamos en el centro de notificaciones para no interrumpirte varias veces.',
        icon: <span className="toast-icon is-review-required" aria-hidden="true"><ScanEye size={16} /></span>,
        action: { label: 'Ver avisos', onClick: () => setShowNotices(true) },
      })
      if (preferences.desktop && 'Notification' in window && Notification.permission === 'granted') {
        const desktopNotice = new Notification(`${fresh.length} PR requieren tu atención`, {
          body: 'Abre PR Control Room para revisar la cola priorizada.',
          icon: '/icons/pwa-192.png',
          tag: `review-batch-${detectedAt}`,
        })
        desktopNotice.onclick = () => {
          window.focus()
          setShowNotices(true)
          desktopNotice.close()
        }
      }
    }
    if (preferences.sound && audioContextRef.current) playDashboardSound(audioContextRef.current)
    setNotices((current) => {
      const unique = new Map([...fresh, ...current].map((notice) => [notice.id, notice]))
      const merged = Array.from(unique.values()).slice(0, 40)
      saveNotices(merged)
      return merged
    })
  }, [allPrs, initialSyncComplete, latestSync, locateNotice, preferences.desktop, preferences.sound, repos, session?.uuid, successfulRepositoryKeys, syncVersion])

  useEffect(() => {
    if (!initialSyncComplete) return
    setNotices((current) => {
      let changed = false
      const next = current.map((notice) => {
        if (notice.read || !noticePresentations.get(notice.id)?.resolved) return notice
        changed = true
        return { ...notice, read: true }
      })
      if (changed) saveNotices(next)
      return changed ? next : current
    })
  }, [initialSyncComplete, noticePresentations])

  useEffect(() => {
    const unreadCount = notices.filter((notice) => !notice.read).length
    document.title = preferences.title && unreadCount
      ? `${unreadCount} nuevas · PR Control Room`
      : 'Cola de revisión — PR Control Room'
    return () => { document.title = 'PR Control Room · Bitbucket' }
  }, [notices, preferences.title, session])

  useEffect(() => {
    if (pendingLocateRef.current) return
    setVisibleLimit(20)
  }, [filterRepo, filterLifecycle, filterReview])
  useEffect(() => {
    const refreshIgnoreRules = () => setIgnoreRevision((value) => value + 1)
    window.addEventListener('prcr:ignore-rules-changed', refreshIgnoreRules)
    return () => window.removeEventListener('prcr:ignore-rules-changed', refreshIgnoreRules)
  }, [])

  const repoPrs = allPrs.filter((pr) => filterRepo === 'all' || `${pr.repo.workspace}/${pr.repo.repo}` === filterRepo)
  const statusCounts = useMemo(() => getLifecycleCounts(repoPrs), [repoPrs])
  const sortedPrs = useMemo(() => repoPrs
    .filter((pr) => (filterLifecycle === 'ALL' || getLifecycleStatus(pr) === filterLifecycle)
      && matchesReviewFilter(pr, filterReview, session?.uuid))
    .sort((first, second) => comparePullRequests(first, second, session?.uuid)), [filterLifecycle, filterReview, repoPrs, session?.uuid])
  const visiblePrs = sortedPrs.slice(0, visibleLimit)
  const visiblePullRequestKeys = visiblePrs.map(pullRequestKey).join('|')
  const reviewCount = repoPrs.filter((pr) => requiresReview(pr, session?.uuid)).length
  const unread = notices.filter((notice) => !notice.read).length
  const allRepositoriesFailed = queries.length > 0 && errors.length === queries.length && !fetching
  const syncLabel = !isOnline
    ? 'Sin conexión'
    : fetching
    ? 'Sincronizando'
    : allRepositoriesFailed
      ? 'Sin conexión'
      : errors.length > 0
        ? 'Conexión parcial'
        : 'Conectado'
  const syncDetail = !isOnline
    ? 'Se reanudará automáticamente'
    : allRepositoriesFailed
    ? 'Requiere atención'
    : errors.length > 0 && !fetching
      ? `${errors.length} ${errors.length === 1 ? 'repositorio pendiente' : 'repositorios pendientes'}`
      : latestSync
        ? `Última lectura ${new Date(latestSync).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`
        : 'Bitbucket Cloud'

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
  const openNotices = () => {
    setShowNotices((current) => !current)
  }
  const deleteNotice = (id: string) => {
    const next = notices.filter((notice) => notice.id !== id)
    setNotices(next)
    saveNotices(next)
  }
  const clearNotices = () => {
    setNotices([])
    saveNotices([])
  }
  const closeNotices = useCallback(() => setShowNotices(false), [])
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

  if (!session) return <Login onLogin={setSession} />

  const userName = displayName(session.displayName, session.email)

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Saltar a la cola</a>
      <header className="topbar">
        <div className="topbar-leading">
          <div className="brand">
            <span className="brand-mark"><GitPullRequest size={19} /></span>
            <span className="brand-copy"><strong>PR Control Room</strong><small>Bitbucket review intelligence</small></span>
          </div>
        </div>
        <div className="topbar-actions">
          <div className={`sync-status ${fetching && isOnline ? 'is-syncing' : ''} ${!isOnline || allRepositoriesFailed ? 'has-error' : errors.length > 0 && !fetching ? 'has-warning' : ''}`} role="status">
            <span className="sync-dot" />
            <span><strong>{syncLabel}</strong><small>{syncDetail}</small></span>
          </div>
          <button type="button" className="icon-button" onClick={refresh} aria-label="Actualizar pull requests" aria-busy={fetching} title="Actualizar pull requests"><RefreshCw size={18} className={fetching ? 'spin' : ''} /></button>
          <div className="notification-control">
            <button ref={notificationTriggerRef} type="button" className="icon-button notification-trigger" onClick={openNotices} aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ''}`} aria-expanded={showNotices} title="Notificaciones"><Bell size={18} />{unread > 0 && <b>{unread}</b>}</button>
            <AnimatePresence>{showNotices && <NotificationPanel notices={notices} presentations={noticePresentations} triggerRef={notificationTriggerRef} onClose={closeNotices} onRead={markNoticeRead} onSelect={locateNotice} onDelete={deleteNotice} onClear={clearNotices} />}</AnimatePresence>
          </div>
          <button ref={settingsTriggerRef} type="button" className="user-button" onClick={() => setShowSettings(true)} aria-label="Abrir configuración" title="Configuración"><Avatar name={userName} size="small" /><span><strong>{userName}</strong><small>Configuración</small></span><Settings2 size={16} /></button>
        </div>
      </header>

      <main id="main-content" className="content">
        <section className="queue-intro" aria-labelledby="queue-title">
          <div><span className="section-kicker">Bandeja priorizada</span><h1 id="queue-title">Cola de revisión</h1><p>Prioridad y contexto para decidir sin volver a recorrer Bitbucket.</p></div>
          <div className="attention-summary" aria-label={`${reviewCount} ${reviewCount === 1 ? 'requiere' : 'requieren'} tu revisión`}><span className="attention-icon"><ScanEye size={20} /></span><strong>{reviewCount}</strong><span>{reviewCount === 1 ? 'requiere' : 'requieren'}<br />tu revisión</span></div>
        </section>

        <FilterToolbar
          filterLifecycle={filterLifecycle}
          setFilterLifecycle={setFilterLifecycle}
          filterRepo={filterRepo}
          setFilterRepo={setFilterRepo}
          filterReview={filterReview}
          setFilterReview={setFilterReview}
          statusCounts={statusCounts}
          repos={repos}
          allPrs={allPrs}
          resultCount={sortedPrs.length}
          onReset={resetFilters}
        />

        {errors.length > 0 && allPrs.length > 0 && (
          <div className="error-banner" role="alert">
            <span><CircleAlert size={18} /></span>
            <div><strong>{errors.length === queries.length ? 'No pudimos conectar con Bitbucket' : errors.length === 1 ? '1 repositorio no pudo actualizarse' : `${errors.length} repositorios no pudieron actualizarse`}</strong><p>Conservamos la información disponible. Revisa tus credenciales o intenta nuevamente.</p></div>
            <button type="button" className="button button-secondary" onClick={refresh}>Reintentar</button>
          </div>
        )}

        {initialLoading && (
          <div className={`loading-status${loadingIsSlow ? ' is-slow' : ''}${!isOnline ? ' is-offline' : ''}`} role="status" aria-live="polite">
            <span className="loading-status-icon">{isOnline ? <RefreshCw className="spin" size={18} /> : <WifiOff size={18} />}</span>
            <span>
              <strong>{!isOnline ? 'Sin conexión a internet' : loadingIsSlow ? 'Bitbucket está tardando un poco' : 'Preparando tu cola'}</strong>
              <small>{!isOnline ? 'La sincronización continuará cuando recuperes la conexión.' : loadingIsSlow ? `${fetchedRepositories} de ${queries.length} repositorios listos · seguimos intentando.` : `${fetchedRepositories} de ${queries.length} repositorios sincronizados`}</small>
            </span>
            <span
              className="loading-progress"
              role="progressbar"
              aria-label="Repositorios sincronizados"
              aria-valuemin={0}
              aria-valuemax={queries.length}
              aria-valuenow={fetchedRepositories}
            >
              <i style={{ width: `${loadingProgress}%` }} />
            </span>
          </div>
        )}

        <section className="queue-section" aria-labelledby="pull-requests-title">
          <header className="queue-section-heading">
            <h2 id="pull-requests-title">Prioridad de revisión</h2>
            <span className={`queue-sync-note ${fetching || !isOnline ? 'is-visible' : ''}`}>
              {isOnline ? <RefreshCw size={14} className={fetching ? 'spin' : ''} /> : <WifiOff size={14} />}
              {isOnline ? 'Actualizando actividad' : 'Sin conexión'}
            </span>
          </header>
          <div className="queue-surface">
            <div className="queue-columns" aria-hidden="true"><span>Pull request · relevo</span><span>Actividad QA</span><span>Acciones</span></div>
            <div className="pr-list" aria-busy={initialLoading && !allPrs.length}>
              <AnimatePresence mode="popLayout">
                {visiblePrs.map((pr) => <PullRequestRecord key={`${pr.repo.workspace}/${pr.repo.repo}-${pr.id}`} pr={pr} session={session} highlighted={pullRequestKey(pr) === highlightedPrKey} />)}
              </AnimatePresence>
              {initialLoading && !allPrs.length && <><PullRequestSkeleton /><PullRequestSkeleton /><PullRequestSkeleton /></>}
              {!initialLoading && !sortedPrs.length && (
                <EmptyQueue
                  repos={repos}
                  filterLifecycle={filterLifecycle}
                  filterReview={filterReview}
                  hasLoadError={errors.length > 0 && allPrs.length === 0}
                  onReset={resetFilters}
                  onConfigure={() => setShowSettings(true)}
                  onRetry={refresh}
                />
              )}
            </div>
          </div>
          {visibleLimit < sortedPrs.length && (
            <button type="button" className="load-more" onClick={() => setVisibleLimit((limit) => limit + 20)}>
              Mostrar 20 más <span>{sortedPrs.length - visibleLimit} restantes</span>
            </button>
          )}
        </section>
      </main>

      <AnimatePresence>
        {showSettings && (
          <SettingsDialog
            repos={repos}
            setRepos={setRepos}
            preferences={preferences}
            setPreferences={updatePreferences}
            triggerRef={settingsTriggerRef}
            requestDesktop={requestDesktop}
            testSound={testSound}
            onClose={closeSettings}
            onLogout={() => {
              clearSession()
              setSession(null)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
