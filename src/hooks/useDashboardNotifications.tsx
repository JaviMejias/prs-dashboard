import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { CheckCircle2, CircleAlert, CircleSlash2, FilePenLine, GitMerge, GitPullRequest, LocateFixed, ScanEye } from 'lucide-react'
import { toast } from 'sonner'
import { getLifecycleStatus } from '../lib/pullRequestReviewState'
import { comparePullRequests, pullRequestKey, requiresReview } from '../lib/dashboard'
import {
  createPullRequestNotice,
  getActionableNoticeKind,
  getNoticePresentation,
  getObservedRepositories,
  noticeReferencesPullRequest,
  repositoryKey,
  repositorySnapshotKey,
} from '../lib/notifications'
import { getNotices, getSnapshot, saveNotices, saveSnapshot } from '../lib/storage'
import type { LifecycleStatus, Notice, NotificationPreferences, NotificationSnapshot, PullRequest, RepoConfig, Session } from '../types'

const locatedFeedback: Record<LifecycleStatus, {
  title: string
  description: string
  icon: typeof LocateFixed
  tone: string
}> = {
  OPEN: { title: 'PR localizado en tu cola', description: 'Ajustamos la vista y lo señalamos durante unos segundos.', icon: LocateFixed, tone: 'open' },
  DRAFT: { title: 'Este PR ahora es borrador', description: 'Te mostramos el estado que Bitbucket informa actualmente.', icon: FilePenLine, tone: 'draft' },
  QUEUED: { title: 'Este PR está en cola para fusionarse', description: 'Ya no aparece como una revisión pendiente.', icon: GitMerge, tone: 'queued' },
  MERGED: { title: 'Este PR ya fue fusionado', description: 'Abrimos su estado actual para cerrar el contexto del aviso.', icon: CheckCircle2, tone: 'merged' },
  DECLINED: { title: 'Este PR fue rechazado', description: 'Abrimos su estado actual para cerrar el contexto del aviso.', icon: CircleSlash2, tone: 'declined' },
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

type NotificationOptions = {
  allPrs: PullRequest[]
  initialLoading: boolean
  initialSyncComplete: boolean
  latestSync: number
  repos: RepoConfig[]
  session: Session | null
  successfulRepositoryKeys: string
  syncVersion: string
  preferences: NotificationPreferences
  audioContextRef: MutableRefObject<AudioContext | null>
  setFilterRepo: (value: string) => void
  setFilterLifecycle: (value: LifecycleStatus) => void
  setFilterReview: (value: 'ALL' | 'ATTENTION' | 'WAITING' | 'REVIEWED') => void
  setVisibleLimit: Dispatch<SetStateAction<number>>
  setHighlightedPrKey: (value: string | null) => void
  pendingLocateRef: MutableRefObject<string | null>
}

export function useDashboardNotifications({
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
}: NotificationOptions) {
  const [notices, setNotices] = useState<Notice[]>(getNotices)
  const [showNotices, setShowNotices] = useState(false)
  const [ignoreRevision, setIgnoreRevision] = useState(0)
  const notificationTriggerRef = useRef<HTMLButtonElement>(null)
  const snapshotRef = useRef<NotificationSnapshot | null>(null)
  const reviewerUuid = session?.uuid
  const reviewerName = session?.displayName

  useEffect(() => {
    saveNotices(notices)
  }, [notices])

  useEffect(() => {
    const unreadCount = notices.filter((notice) => !notice.read).length
    document.title = preferences.title && unreadCount
      ? `${unreadCount} nuevas · PR Control Room`
      : 'Cola de revisión — PR Control Room'
    return () => { document.title = 'PR Control Room · Bitbucket' }
  }, [notices, preferences.title])

  useEffect(() => {
    const refreshIgnoreRules = () => setIgnoreRevision((value) => value + 1)
    window.addEventListener('prcr:ignore-rules-changed', refreshIgnoreRules)
    return () => window.removeEventListener('prcr:ignore-rules-changed', refreshIgnoreRules)
  }, [])

  const noticePresentations = useMemo(() => new Map(notices.map((notice) => {
    const pullRequest = allPrs.find((pr) => noticeReferencesPullRequest(notice, pr))
    return [notice.id, getNoticePresentation(notice, pullRequest, reviewerUuid, reviewerName)]
  })), [allPrs, ignoreRevision, notices, reviewerName, reviewerUuid])

  const markNoticeRead = useCallback((id: string) => {
    setNotices((current) => {
      const next = current.map((notice) => notice.id === id && !notice.read ? { ...notice, read: true } : notice)
      if (next.every((notice, index) => notice === current[index])) return current
      return next
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
        action: notice.pullRequestUrl ? { label: 'Abrir en Bitbucket', onClick: () => window.open(notice.pullRequestUrl, '_blank', 'noopener,noreferrer') } : undefined,
      })
      return
    }

    const targetKey = pullRequestKey(target)
    const lifecycle = getLifecycleStatus(target)
    const targetPosition = allPrs
      .filter((pr) => repositoryKey(pr.repo) === repositoryKey(target.repo) && getLifecycleStatus(pr) === lifecycle)
      .sort((first, second) => comparePullRequests(first, second, reviewerUuid, reviewerName))
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
  }, [allPrs, initialLoading, markNoticeRead, pendingLocateRef, reviewerName, reviewerUuid, setFilterLifecycle, setFilterRepo, setFilterReview, setHighlightedPrKey, setVisibleLimit])

  useEffect(() => {
    if (!session || !initialSyncComplete) return
    const previous = snapshotRef.current || getSnapshot()
    const observedRepositories = getObservedRepositories(previous)
    const successfulRepositories = new Set(successfulRepositoryKeys.split('|').filter(Boolean))
    const next = { ...previous }
    const fresh: Notice[] = []
    const detectedAt = Date.now()

    allPrs.forEach((pr) => {
      const pullRequestRepository = repositoryKey(pr.repo)
      if (!successfulRepositories.has(pullRequestRepository)) return
      const key = pullRequestKey(pr)
      const current = { updatedOn: pr.updated_on, needsReview: requiresReview(pr, reviewerUuid, reviewerName) }
      const kind = getActionableNoticeKind(previous[key], current, observedRepositories.has(pullRequestRepository))
      if (kind) fresh.push(createPullRequestNotice(pr, kind, detectedAt))
      next[key] = current
    })

    successfulRepositories.forEach((key) => {
      const repo = repos.find((item) => repositoryKey(item) === key)
      if (repo) next[repositorySnapshotKey(repo)] = { updatedOn: new Date(latestSync || detectedAt).toISOString(), needsReview: false }
    })
    snapshotRef.current = next
    saveSnapshot(next)
    if (!fresh.length) return

    const firstNotice = fresh.length === 1 ? fresh[0] : null
    if (firstNotice) {
      toast(firstNotice.kind === 'new-pr' ? 'Nuevo PR en tu cola' : 'Tu revisión es necesaria', {
        id: firstNotice.id,
        description: firstNotice.text,
        icon: <span className={`toast-icon is-${firstNotice.kind}`} aria-hidden="true">{firstNotice.kind === 'new-pr' ? <GitPullRequest size={16} /> : <ScanEye size={16} />}</span>,
        action: { label: 'Ver en la cola', onClick: () => locateNotice(firstNotice) },
      })
      if (preferences.desktop && 'Notification' in window && Notification.permission === 'granted') {
        const desktopNotice = new Notification(firstNotice.kind === 'new-pr' ? 'Nuevo PR en Bitbucket' : 'Tu revisión es necesaria', { body: `${firstNotice.text} · ${firstNotice.repositoryName} #${firstNotice.pullRequestId}`, icon: '/icons/pwa-192.png', tag: firstNotice.id })
        desktopNotice.onclick = () => { window.focus(); locateNotice(firstNotice); desktopNotice.close() }
      }
    } else {
      toast(`${fresh.length} PR requieren tu atención`, { id: `review-batch-${detectedAt}`, description: 'Los agrupamos en el centro de notificaciones para no interrumpirte varias veces.', icon: <span className="toast-icon is-review-required" aria-hidden="true"><ScanEye size={16} /></span>, action: { label: 'Ver avisos', onClick: () => setShowNotices(true) } })
      if (preferences.desktop && 'Notification' in window && Notification.permission === 'granted') {
        const desktopNotice = new Notification(`${fresh.length} PR requieren tu atención`, { body: 'Abre PR Control Room para revisar la cola priorizada.', icon: '/icons/pwa-192.png', tag: `review-batch-${detectedAt}` })
        desktopNotice.onclick = () => { window.focus(); setShowNotices(true); desktopNotice.close() }
      }
    }
    if (preferences.sound && audioContextRef.current) playDashboardSound(audioContextRef.current)
    setNotices((current) => {
      const merged = Array.from(new Map([...fresh, ...current].map((notice) => [notice.id, notice])).values()).slice(0, 40)
      return merged
    })
  }, [allPrs, audioContextRef, initialSyncComplete, latestSync, locateNotice, preferences.desktop, preferences.sound, repos, reviewerName, reviewerUuid, session, successfulRepositoryKeys, syncVersion])

  useEffect(() => {
    if (!initialSyncComplete) return
    setNotices((current) => {
      const next = current.map((notice) => notice.read || !noticePresentations.get(notice.id)?.resolved ? notice : { ...notice, read: true })
      if (next.every((notice, index) => notice === current[index])) return current
      return next
    })
  }, [initialSyncComplete, noticePresentations])

  const deleteNotice = useCallback((id: string) => {
    setNotices((current) => {
      const next = current.filter((notice) => notice.id !== id)
      return next
    })
  }, [])
  const clearNotices = useCallback(() => {
    setNotices([])
  }, [])
  const toggleNotices = useCallback(() => setShowNotices((current) => !current), [])
  const closeNotices = useCallback(() => setShowNotices(false), [])
  const playSound = useCallback(() => {
    if (audioContextRef.current) playDashboardSound(audioContextRef.current)
  }, [audioContextRef])

  return {
    notices,
    noticePresentations,
    unread: notices.filter((notice) => !notice.read).length,
    showNotices,
    notificationTriggerRef,
    markNoticeRead,
    locateNotice,
    deleteNotice,
    clearNotices,
    toggleNotices,
    closeNotices,
    playSound,
  }
}
