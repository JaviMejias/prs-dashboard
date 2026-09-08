import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, CalendarDays, Check, ChevronDown, ChevronRight, CircleAlert, EyeOff, ExternalLink, Files, FolderGit2, GitCommitHorizontal, GitPullRequest, LogOut, MessageCircle, Minus, Monitor, Plus, RefreshCw, Settings2, ShieldCheck, Trash2, UserRound, Volume2, X } from 'lucide-react'
import { toast } from 'sonner'
import { classifyPr, getLifecycleStatus, getPullRequests, getReviewerState, getStats, isFreshPullRequest, verifyUser } from './lib/bitbucket'
import { clearSession, defaultNotificationPreferences, getIgnoreRules, getNotificationPreferences, getNotices, getRepos, getSession, getSnapshot, saveIgnoreRules, saveNotices, saveNotificationPreferences, saveRepos, saveSession, saveSnapshot } from './lib/storage'
import type { IgnoreRules, LifecycleStatus, Notice, NotificationPreferences, PrStatus, PullRequest, RepoConfig, ReviewerState, Session } from './types'

const labels: Record<PrStatus, string> = { unreviewed: 'Revisar', changes: 'Revisar · cambios nuevos', waiting: 'Esperando al dev', current: 'Revisado', merged: 'Fusionado', declined: 'Rechazado' }
const reviewerLabels: Record<ReviewerState, string> = { approved: 'aprobó', waiting: 'pidió cambios', reviewed: 'revisó', changes: 'revisó · hubo cambios' }
const trackedReviewers: Array<{ displayName: string; shortName: string; uuid?: string }> = [{ displayName: 'Diego Gustavo Cuevas Montes', shortName: 'Diego' }, { displayName: 'Iván Reyes', shortName: 'Iván' }]
const priority: Record<PrStatus, number> = { unreviewed: 0, changes: 0, waiting: 1, current: 2, merged: 3, declined: 4 }
const reviewLabel = (pr: PullRequest, status: PrStatus) => isIgnoredPullRequest(pr) ? 'No revisar' : status === 'unreviewed' && isFreshPullRequest(pr) ? 'Nuevo PR' : labels[status]
const normalizeForRule = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim()
const pullRequestKey = (pr: PullRequest) => `${pr.repo.workspace}/${pr.repo.repo}#${pr.id}`
const isIgnoredPullRequest = (pr: PullRequest) => { const rules = getIgnoreRules(); const author = normalizeForRule(pr.author?.display_name || pr.author?.nickname || ''); return rules.pullRequests.includes(pullRequestKey(pr)) || rules.authors.some((item) => normalizeForRule(item) === author) }
const comparePullRequests = (first: PullRequest, second: PullRequest, myUuid?: string) => { const firstPriority = priority[classifyPr(first, myUuid)]; const secondPriority = priority[classifyPr(second, myUuid)]; if (firstPriority !== secondPriority) return firstPriority - secondPriority; return new Date(second.updated_on).getTime() - new Date(first.updated_on).getTime() }
const relative = (date: string) => { const seconds = Math.round((Date.now() - new Date(date).getTime()) / 1000); if (seconds < 60) return 'ahora'; if (seconds < 3600) return `hace ${Math.round(seconds / 60)} min`; if (seconds < 86400) return `hace ${Math.round(seconds / 3600)} h`; return `hace ${Math.round(seconds / 86400)} d` }
const midnightTomorrow = () => { const date = new Date(); date.setHours(24, 0, 0, 0); return date.getTime() }

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState(''); const [token, setToken] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { const draft = { email: email.trim(), token, expiresAt: midnightTomorrow() }; const user = await verifyUser(draft); const session = { ...draft, uuid: user.uuid, displayName: user.display_name }; saveSession(session); onLogin(session) } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo verificar la cuenta.') } finally { setBusy(false) } }
  return <main className="auth-shell"><div className="auth-grid" /><section className="auth-card"><div className="eyebrow"><span className="signal" /> BITBUCKET / CONTROL ROOM</div><h1>El pulso de tus<br /><em>pull requests.</em></h1><p className="lead">Un solo tablero para saber qué revisar, qué cambió y dónde está esperando el equipo.</p><form onSubmit={submit}><label>Correo Atlassian<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.com" /></label><label>API token<input type="password" required value={token} onChange={(e) => setToken(e.target.value)} placeholder="••••••••••••••••" /></label>{error && <div className="form-error"><CircleAlert size={15} /> {error}</div>}<button className="primary full" disabled={busy}>{busy ? <><RefreshCw className="spin" size={16} /> Verificando…</> : <><ShieldCheck size={16} /> Conectar con Bitbucket</>}</button></form><p className="privacy"><ShieldCheck size={13} /> El token se guarda solo en este navegador y se envía directamente a Bitbucket.</p></section><div className="auth-mark"><GitPullRequest size={18} /> PRCR <span>v1.0</span></div></main>
}

function Stats({ pr, session, expanded }: { pr: PullRequest; session: Session; expanded: boolean }) {
  const query = useQuery({ queryKey: ['stats', pr.id, pr.updated_on], queryFn: () => getStats(pr, session), enabled: expanded })
  const metadata = <><span className="stat-item"><MessageCircle size={13} /><strong>{pr.comment_count || 0}</strong> comentarios</span><span className="stat-item"><CalendarDays size={13} />Creado <strong>{new Date(pr.created_on).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></span><span className="stat-item"><RefreshCw size={12} />Actualizado <strong>{relative(pr.updated_on)}</strong></span></>
  if (!expanded) return <div className="stats stats-preview">{metadata}</div>
  if (query.isLoading) return <div className="stats muted">{metadata}<span>Cargando commits y archivos…</span></div>
  if (query.isError) return <div className="stats muted">{metadata}<span>No pudimos cargar commits y archivos.</span></div>
  const stats = query.data!
  return <div className="stats">{metadata}<span className="stats-divider" /><span className="stat-item"><GitCommitHorizontal size={13} /><strong>{stats.commits}</strong> commits</span><span className="stat-item"><Files size={13} /><strong>{stats.files}</strong> archivos</span><span className="stat-item added"><Plus size={13} /><strong>{stats.added}</strong> añadidos</span><span className="stat-item removed"><Minus size={13} /><strong>{stats.removed}</strong> eliminados</span></div>
}
function ReviewerSignals({ pr, session }: { pr: PullRequest; session: Session }) {
  const people = [{ displayName: session.displayName || session.email, shortName: 'Tú', uuid: session.uuid }, ...trackedReviewers]
  const signals = people
    .map((reviewer) => ({ ...reviewer, state: getReviewerState(pr, reviewer.displayName, reviewer.uuid) }))
    .filter((reviewer): reviewer is typeof reviewer & { state: ReviewerState } => reviewer.state !== null)

  if (!signals.length) return <span className="reviewer-empty">Sin actividad registrada</span>

  return <div className="reviewer-signals">{signals.map((reviewer) => <span className={`reviewer-signal reviewer-${reviewer.state}${reviewer.shortName === 'Iván' ? ' reviewer-rare' : ''}`} key={reviewer.displayName} title={reviewer.displayName}><strong>{reviewer.shortName}</strong><small>{reviewerLabels[reviewer.state]}</small></span>)}</div>
}

const PrRow = forwardRef<HTMLElement, { pr: PullRequest; session: Session }>(function PrRow({ pr, session }, ref) {
  const [expanded, setExpanded] = useState(false)
  const status = classifyPr(pr, session.uuid)
  const sourceRepositoryUrl = pr.source?.repository?.links?.html?.href

  return (
    <motion.article ref={ref} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className={`pr-row status-${status}`}>
      <button className="chevron" aria-label={expanded ? 'Ocultar estadísticas' : 'Mostrar estadísticas'} onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>
      <div className="pr-main">
        <div className="pr-top"><span className="repo-name">{pr.repo.repo}</span><span className="pr-id">#{pr.id}</span><span className="updated">Actualizado {relative(pr.updated_on)}</span></div>
        <a className="pr-title" href={pr.links?.html?.href} target="_blank" rel="noreferrer"><h3>{pr.title}</h3><ExternalLink size={15} /></a>
        <div className="pr-meta">
          <span className="author">{pr.author?.display_name || pr.author?.nickname || 'Autor desconocido'}</span>
          <span className="branch">{pr.source?.branch?.name || '?'} <span>→</span> {pr.destination?.branch?.name || '?'}</span>
          {sourceRepositoryUrl && <a className="source-repo" href={sourceRepositoryUrl} target="_blank" rel="noreferrer" title={pr.source?.repository?.full_name || 'Abrir repositorio origen'}><FolderGit2 size={13} /> Repositorio origen</a>}
        </div>
      </div>
      <div className="review-column"><span className="column-label">Equipo</span><ReviewerSignals pr={pr} session={session} /></div>
      <div className="action-column"><span className="column-label">Tu estado</span><span className="status-badge"><i />{reviewLabel(pr, status)}</span><a className="open-pr" href={pr.links?.html?.href} target="_blank" rel="noreferrer">Abrir PR <ExternalLink size={13} /></a></div>
      <Stats pr={pr} session={session} expanded={expanded} />
    </motion.article>
  )
})

function App() { const [session, setSession] = useState<Session | null>(() => { const value = getSession(); return value && value.expiresAt > Date.now() ? value : null }); const [repos, setRepos] = useState<RepoConfig[]>(getRepos); const [filterRepo, setFilterRepo] = useState('all'); const [filterState, setFilterState] = useState<'OPEN' | 'MERGED' | 'DECLINED' | 'ALL'>('OPEN'); const [notices, setNotices] = useState<Notice[]>(getNotices); const [showNotices, setShowNotices] = useState(false); const [showSettings, setShowSettings] = useState(false); const snapshotRef = useRef<Record<string, string>>(getSnapshot())
  useEffect(() => { if (!session) return; const timer = window.setInterval(() => { if (Date.now() >= session.expiresAt) { clearSession(); setSession(null); toast('La sesión expiró.'); } }, 60_000); return () => clearInterval(timer) }, [session])
  const queries = useQueries({ queries: session ? repos.map((repo) => ({ queryKey: ['prs', repo.workspace, repo.repo], queryFn: () => getPullRequests(repo, session), refetchInterval: 25_000, staleTime: 10_000 })) : [] }); const allPrs = useMemo(() => Array.from(new Map(queries.flatMap((query) => query.data || []).map((pr) => [`${pr.repo.workspace}/${pr.repo.repo}#${pr.id}`, pr])).values()), [queries]); const fetching = queries.some((q) => q.isFetching); const fetchedRepositories = queries.filter((q) => q.isFetched).length; const initialLoading = queries.length > 0 && fetchedRepositories < queries.length; const error = queries.find((q) => q.isError)?.error; const initialSyncComplete = queries.length > 0 && queries.every((q) => q.isFetched); const syncVersion = queries.map((q) => q.dataUpdatedAt).join(':')
  useEffect(() => { if (!initialSyncComplete) return; const previous = snapshotRef.current; const hasBaseline = Object.keys(previous).length > 0; const next = { ...previous }; const fresh: Notice[] = []; allPrs.forEach((pr) => { const key = `${pr.repo.workspace}/${pr.repo.repo}#${pr.id}`; if (hasBaseline && pr.state === 'OPEN' && previous[key] && previous[key] !== pr.updated_on) fresh.push({ id: `${key}-${pr.updated_on}`, text: `Actualización en PR #${pr.id}: ${pr.title}`, createdAt: Date.now(), read: false }); else if (hasBaseline && pr.state === 'OPEN' && !previous[key]) fresh.push({ id: `${key}-${pr.updated_on}`, text: `PR nuevo abierto: #${pr.id} ${pr.title}`, createdAt: Date.now(), read: false }); next[key] = pr.updated_on }); snapshotRef.current = next; saveSnapshot(next); if (!fresh.length) return; fresh.slice(0, 3).forEach((notice) => toast(notice.text, { id: notice.id })); if (fresh.length > 3) toast(`${fresh.length - 3} novedades adicionales`, { id: `pr-summary-${syncVersion}`, description: 'Revísalas en el centro de notificaciones.' }); setNotices((current) => { const merged = [...fresh, ...current].slice(0, 40); saveNotices(merged); return merged }) }, [allPrs, initialSyncComplete, syncVersion])
  const visible = allPrs.filter((pr) => (filterRepo === 'all' || `${pr.repo.workspace}/${pr.repo.repo}` === filterRepo) && (filterState === 'ALL' || pr.state === filterState)).sort((first, second) => comparePullRequests(first, second, session?.uuid)); const reviewCount = visible.filter((pr) => ['unreviewed', 'changes'].includes(classifyPr(pr, session?.uuid))).length; const unread = notices.filter((n) => !n.read).length; const refresh = () => { queries.forEach((q) => q.refetch()); toast.success('Actualizando pull requests') }
  if (!session) return <Login onLogin={setSession} />
  return <div className="app-shell"><header className="topbar"><div className="brand"><div className="brand-icon"><GitPullRequest size={18} /></div><div><strong>PR CONTROL ROOM</strong><small>BITBUCKET CLOUD</small></div></div><div className="top-actions"><div className="connection"><span className="signal" /> CONECTADO <span className="last-refresh">· {fetching ? 'sincronizando' : 'en vivo'}</span></div><button className="icon-button" onClick={refresh} title="Actualizar"><RefreshCw size={17} className={fetching ? 'spin' : ''} /></button><div className="notification-wrap"><button className="icon-button bell" onClick={() => { setShowNotices(!showNotices); if (!showNotices) { const read = notices.map((n) => ({ ...n, read: true })); setNotices(read); saveNotices(read) } }}><Bell size={17} />{unread > 0 && <b>{unread}</b>}</button>{showNotices && <div className="popover notices"><div className="popover-head"><strong>Actividad reciente</strong><button onClick={() => setShowNotices(false)}><X size={15} /></button></div>{notices.length ? notices.slice(0, 8).map((n) => <div className="notice" key={n.id}><i /> <span>{n.text}<small>{relative(new Date(n.createdAt).toISOString())}</small></span></div>) : <p className="empty-small">Sin novedades todavía.</p>}</div>}</div><button className="user-pill" onClick={() => setShowSettings(true)}><span>{(session.displayName || session.email)[0].toUpperCase()}</span>{session.displayName || session.email}</button></div></header><main className="content"><section className="page-heading"><div><div className="eyebrow">OVERVIEW <span>/{new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}</span></div><h1>Tu cola de revisión.</h1><p><strong>{reviewCount} requieren tu revisión</strong> · {visible.length} pull requests · {repos.length} repositorios</p></div><button className="secondary" onClick={() => setShowSettings(true)}><Settings2 size={15} /> Configurar repos</button></section><nav className="filters"><div className="repo-filters"><button className={filterRepo === 'all' ? 'active' : ''} onClick={() => setFilterRepo('all')}>Todos <span>{allPrs.length}</span></button>{repos.map((repo) => { const key = `${repo.workspace}/${repo.repo}`; return <button key={key} className={filterRepo === key ? 'active' : ''} onClick={() => setFilterRepo(key)}>{repo.repo}</button> })}</div><div className="state-filters">{([['OPEN', 'Abiertos'], ['MERGED', 'Fusionados'], ['DECLINED', 'Rechazados'], ['ALL', 'Todos']] as const).map(([value, text]) => <button className={filterState === value ? 'active' : ''} key={value} onClick={() => setFilterState(value)}>{text}</button>)}</div></nav>{error && <div className="banner-error"><CircleAlert size={16} /> {error instanceof Error ? error.message : 'No se pudo cargar Bitbucket.'}<button onClick={refresh}>Reintentar</button></div>}{initialLoading && <div className="loading-panel" role="status"><div><RefreshCw className="spin" size={18} /><span><strong>Cargando pull requests…</strong><small>{fetchedRepositories} de {queries.length} repositorios sincronizados</small></span></div><div className="loading-track"><i style={{ width: `${queries.length ? Math.max(8, fetchedRepositories / queries.length * 100) : 8}%` }} /></div></div>}<section className="list-head"><span>{filterState === 'OPEN' ? 'Pull requests · más recientes primero' : 'Pull requests'}</span><span>Revisión del equipo</span><span>Tu estado</span></section><div className="pr-list"><AnimatePresence mode="popLayout">{visible.map((pr) => <PrRow key={`${pr.repo.workspace}/${pr.repo.repo}-${pr.id}`} pr={pr} session={session} />)}</AnimatePresence>{initialLoading && !allPrs.length && <><div className="pr-skeleton" /><div className="pr-skeleton" /><div className="pr-skeleton" /></>}{!initialLoading && !visible.length && <div className="empty"><GitPullRequest size={24} /><p>No hay pull requests en este filtro.</p><small>Cuando aparezcan, los verás aquí.</small></div>}</div></main>{showSettings && <Settings repos={repos} setRepos={setRepos} onClose={() => setShowSettings(false)} onLogout={() => { clearSession(); setSession(null) }} />}</div> }

const lifecycleLabelsV2: Record<LifecycleStatus, string> = { OPEN: 'Abierto', DRAFT: 'Borrador', QUEUED: 'En cola', MERGED: 'Fusionado', DECLINED: 'Rechazado' }
const lifecycleFilterLabelsV2: Record<'ALL' | LifecycleStatus, string> = { ALL: 'Todos', OPEN: 'Abiertos', DRAFT: 'Borradores', QUEUED: 'En cola', MERGED: 'Fusionados', DECLINED: 'Rechazados' }
const reviewerPeopleV2 = trackedReviewers
const dashboardInitials = (name: string) => { const parts = name.trim().split(/\s+/).filter(Boolean); return parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() : parts[0]?.slice(0, 2).toUpperCase() || '??' }
const dashboardTone = (name: string) => `tone-${Array.from(name).reduce((total, character) => total + character.charCodeAt(0), 0) % 6}`
const dashboardName = (name?: string, fallback = 'Usuario desconocido') => name?.trim() || fallback
const reviewPriorityV2: Record<PrStatus, number> = { unreviewed: 0, changes: 0, waiting: 1, current: 2, merged: 3, declined: 4 }
const matchesReviewFilterV2 = (pr: PullRequest, filter: 'ALL' | 'ATTENTION' | 'WAITING' | 'REVIEWED', uuid?: string) => { if (filter !== 'ALL' && isIgnoredPullRequest(pr)) return false; if (filter === 'ALL') return true; const status = classifyPr(pr, uuid); if (filter === 'ATTENTION') return status === 'unreviewed' || status === 'changes'; if (filter === 'WAITING') return status === 'waiting'; return status === 'current' }

function DashboardAvatar({ name, state, large = false }: { name: string; state?: ReviewerState | null; large?: boolean }) {
  return <span className={`dashboard-avatar ${large ? 'large' : ''} ${dashboardTone(name)} ${state ? `avatar-${state}` : ''}`} title={name} aria-label={name}>{dashboardInitials(name)}</span>
}

function DashboardIgnoreActions({ pr }: { pr: PullRequest }) {
  const authorName = dashboardName(pr.author?.display_name || pr.author?.nickname)
  const ignored = isIgnoredPullRequest(pr)
  const updateRule = (scope: 'pr' | 'author') => {
    const rules = getIgnoreRules()
    const next: IgnoreRules = { authors: [...rules.authors], pullRequests: [...rules.pullRequests] }
    if (ignored) {
      next.authors = next.authors.filter((item) => normalizeForRule(item) !== normalizeForRule(authorName))
      next.pullRequests = next.pullRequests.filter((item) => item !== pullRequestKey(pr))
    } else if (scope === 'author' && !next.authors.some((item) => normalizeForRule(item) === normalizeForRule(authorName))) {
      next.authors.push(authorName)
    } else if (scope === 'pr' && !next.pullRequests.includes(pullRequestKey(pr))) {
      next.pullRequests.push(pullRequestKey(pr))
    }
    saveIgnoreRules(next)
    window.dispatchEvent(new Event('prcr:ignore-rules-changed'))
    toast.success(ignored ? 'PR incluido nuevamente en tu cola.' : scope === 'author' ? `Se ocultarán los PR de ${authorName}.` : 'PR marcado como no revisar. Lo encontrarás en QA > Todos.')
  }

  return <div className="ignore-actions" aria-label="Acciones de revisión">
    {ignored ? <button className="ignore-action restore" onClick={() => updateRule('pr')} title="Volver a mostrar este pull request"><Check size={13} /> Reactivar PR</button> : <><button className="ignore-action" onClick={() => updateRule('pr')} title="Ocultar solo este pull request"><EyeOff size={13} /> No revisar este PR</button><button className="ignore-action" onClick={() => updateRule('author')} title={`Ocultar todos los PR de ${authorName}`}><UserRound size={13} /> Ignorar autor</button></>}
  </div>
}

function DashboardReviewers({ pr, session, expanded, onToggle }: { pr: PullRequest; session: Session; expanded: boolean; onToggle: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const people = [{ displayName: dashboardName(session.displayName, session.email), label: 'Tú', uuid: session.uuid }, ...reviewerPeopleV2.map((person) => ({ ...person, label: person.shortName }))]
  const signals = people.map((person) => ({ ...person, state: getReviewerState(pr, person.displayName, person.uuid) }))
  const active = signals.filter((person) => person.state).length
  useEffect(() => {
    if (!expanded) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) onToggle()
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [expanded, onToggle])

  return <div className="dashboard-reviewers" ref={containerRef}>
    <button className="dashboard-reviewer-toggle" onClick={onToggle} aria-expanded={expanded}><span className="dashboard-avatar-stack">{signals.map((person) => <DashboardAvatar key={person.displayName} name={person.displayName} state={person.state} />)}</span><span><strong>{active ? `${active} con actividad` : 'Sin revisiones'}</strong><small>Ver equipo revisor</small></span><ChevronDown size={14} className={expanded ? 'rotate' : ''} /></button>
    <AnimatePresence initial={false}>{expanded && <motion.div className="dashboard-reviewer-popover" initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.16 }}>{signals.map((person) => <div className="dashboard-reviewer-detail" key={person.displayName}><DashboardAvatar name={person.displayName} state={person.state} /><span><strong>{person.label}</strong><small>{person.state ? reviewerLabels[person.state] : 'sin actividad registrada'}</small></span><i className={person.state ? `dot-${person.state}` : ''} /></div>)}</motion.div>}</AnimatePresence>
    <DashboardIgnoreActions pr={pr} />
  </div>
}

const DashboardPrRow = forwardRef<HTMLElement, { pr: PullRequest; session: Session }>(function DashboardPrRow({ pr, session }, ref) {
  const [expanded, setExpanded] = useState(true)
  const [reviewersExpanded, setReviewersExpanded] = useState(false)
  const reviewStatus = classifyPr(pr, session.uuid)
  const lifecycle = getLifecycleStatus(pr)
  const authorName = dashboardName(pr.author?.display_name || pr.author?.nickname)
  const sourceRepositoryUrl = pr.source?.repository?.links?.html?.href
  const authorContent = sourceRepositoryUrl ? <a className="author author-link" href={sourceRepositoryUrl} target="_blank" rel="noreferrer" title={pr.source?.repository?.full_name || 'Abrir repositorio origen'}>{authorName}<ExternalLink size={11} /></a> : <span className="author">{authorName}</span>
  return <motion.article ref={ref} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className={`dashboard-pr-row review-${reviewStatus} lifecycle-${lifecycle.toLowerCase()}`}><div className="dashboard-pr-main"><div className="dashboard-pr-identity"><DashboardAvatar name={authorName} large /><div className="dashboard-pr-copy"><div className="dashboard-pr-top"><span className="repo-name">{pr.repo.repo}</span><span className="pr-id">#{pr.id}</span></div><a className="dashboard-pr-title" href={pr.links?.html?.href} target="_blank" rel="noreferrer"><h3>{pr.title}</h3><ExternalLink size={15} /></a><div className="dashboard-pr-meta">{authorContent}<span className="branch">{pr.source?.branch?.name || '?'} <span>→</span> {pr.destination?.branch?.name || '?'}</span></div></div></div><div className="dashboard-date"><span>Creado <strong>{new Date(pr.created_on).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></span><span>·</span><span>Actualizado {relative(pr.updated_on)}</span></div></div><div className="dashboard-review-column"><span className="column-label">Revisores</span><DashboardReviewers pr={pr} session={session} expanded={reviewersExpanded} onToggle={() => setReviewersExpanded((value) => !value)} /></div><div className="dashboard-action-column"><span className={`lifecycle-chip lifecycle-${lifecycle.toLowerCase()}`}><i />{lifecycleLabelsV2[lifecycle]}</span><span className={`review-badge review-${reviewStatus}`}><i />{reviewLabel(pr, reviewStatus)}</span></div><Stats pr={pr} session={session} expanded /></motion.article>
})

function playDashboardSound(context: AudioContext) { if (context.state === 'suspended') { void context.resume().then(() => playDashboardSound(context)); return } const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(740, context.currentTime); oscillator.frequency.exponentialRampToValueAtTime(980, context.currentTime + 0.12); gain.gain.setValueAtTime(0.0001, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.24, context.currentTime + 0.02); gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22); oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.24) }

function DashboardNoticePanel({ notices, onClose, onDelete, onClear }: { notices: Notice[]; onClose: () => void; onDelete: (id: string) => void; onClear: () => void }) {
  const [closing, setClosing] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (closing) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setClosing(true)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [closing])

  return <motion.div ref={panelRef} className="popover notices" initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={closing ? { opacity: 0, y: -7, scale: 0.97 } : { opacity: 1, y: 0, scale: 1 }} transition={{ duration: closing ? 0.14 : 0.18, ease: 'easeOut' }} onAnimationComplete={() => { if (closing) onClose() }}><div className="popover-head"><strong>Actividad reciente</strong><span className="notice-head-actions">{notices.length > 0 && <button className="notice-clear" onClick={onClear}>Borrar todo</button>}<button onClick={() => setClosing(true)} aria-label="Cerrar notificaciones"><X size={15} /></button></span></div>{notices.length ? notices.slice(0, 8).map((notice) => <div className="notice" key={notice.id}><i /><span>{notice.text}<small>{relative(new Date(notice.createdAt).toISOString())}</small></span><button className="notice-delete" onClick={() => onDelete(notice.id)} aria-label="Borrar notificación"><Trash2 size={13} /></button></div>) : <p className="empty-small">Sin novedades todavía.</p>}</motion.div>
}

function DashboardSettings({ repos, setRepos, preferences, setPreferences, requestDesktop, testSound, onClose, onLogout }: { repos: RepoConfig[]; setRepos: (repos: RepoConfig[]) => void; preferences: NotificationPreferences; setPreferences: (preferences: NotificationPreferences) => void; requestDesktop: () => void; testSound: () => void; onClose: () => void; onLogout: () => void }) {
  const [draft, setDraft] = useState<RepoConfig>({ workspace: '', repo: '' })
  const add = () => { const repo = { workspace: draft.workspace.trim(), repo: draft.repo.trim() }; if (!repo.workspace || !repo.repo) return; if (repos.some((item) => `${item.workspace}/${item.repo}`.toLocaleLowerCase() === `${repo.workspace}/${repo.repo}`.toLocaleLowerCase())) { toast.error('Ese repositorio ya está agregado.'); return }; const next = [...repos, repo]; setRepos(next); saveRepos(next); setDraft({ workspace: '', repo: '' }) }
  const remove = (index: number) => { const next = repos.filter((_, itemIndex) => itemIndex !== index); setRepos(next); saveRepos(next) }
  const toggle = (key: keyof NotificationPreferences) => { if (key === 'sound' && !preferences.sound) { testSound(); return }; const next = { ...preferences, [key]: !preferences[key] }; setPreferences(next); saveNotificationPreferences(next) }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="settings-modal dashboard-settings"><div className="popover-head"><div><div className="eyebrow">CONFIGURACIÓN</div><h2>Preferencias del tablero</h2></div><button onClick={onClose}><X size={18} /></button></div><div className="settings-section"><h3>Repositorios monitorizados</h3><p className="modal-copy">Agrega los repositorios de Bitbucket que quieras tener en tu cola de revisión.</p><div className="repo-list">{repos.map((repo, index) => <div className="repo-config" key={`${repo.workspace}/${repo.repo}`}><span><GitPullRequest size={15} /> {repo.workspace} / <strong>{repo.repo}</strong></span><button onClick={() => remove(index)} aria-label="Eliminar repositorio"><Trash2 size={15} /></button></div>)}</div><div className="add-repo"><input placeholder="workspace" value={draft.workspace} onChange={(event) => setDraft({ ...draft, workspace: event.target.value })} /><span>/</span><input placeholder="repo slug" value={draft.repo} onChange={(event) => setDraft({ ...draft, repo: event.target.value })} /><button className="secondary" onClick={add}><Plus size={15} /> Agregar</button></div></div><div className="settings-section notifications-settings"><h3>Notificaciones</h3><label className="preference"><span className="preference-icon"><Monitor size={16} /></span><span><strong>Notificaciones del sistema</strong><small>Avísame aunque la pestaña esté en segundo plano.</small></span><button type="button" className={`switch ${preferences.desktop ? 'on' : ''}`} onClick={preferences.desktop ? () => toggle('desktop') : requestDesktop} aria-label="Activar notificaciones del sistema"><i /></button></label><label className="preference"><span className="preference-icon"><Volume2 size={16} /></span><span><strong>Sonido</strong><small>Reproduce un aviso cuando llega actividad nueva.</small></span><button type="button" className={`switch ${preferences.sound ? 'on' : ''}`} onClick={() => toggle('sound')} aria-label="Activar sonido"><i /></button></label><button className="test-sound" onClick={testSound}><Volume2 size={14} /> Probar sonido y activar</button><label className="preference"><span className="preference-icon"><UserRound size={16} /></span><span><strong>Título de la pestaña</strong><small>Muestra cuántas novedades están sin leer.</small></span><button type="button" className={`switch ${preferences.title ? 'on' : ''}`} onClick={() => toggle('title')} aria-label="Mostrar novedades en el título"><i /></button></label></div><div className="modal-footer"><button className="logout" onClick={onLogout}><LogOut size={15} /> Cerrar sesión</button><button className="primary" onClick={onClose}><Check size={15} /> Listo</button></div></section></div>
}

function DashboardFilterSelect({ label, value, valueLabel, options, onChange }: { label: 'Estados' | 'Repositorios' | 'QA'; value: string; valueLabel: string; options: Array<{ value: string; label: string; count?: number }>; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const Icon = label === 'Estados' ? ShieldCheck : label === 'Repositorios' ? GitPullRequest : UserRound

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [open])

  return <div className="filter-select" ref={containerRef}><button className="filter-select-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}><span className="filter-select-icon"><Icon size={14} /></span><span className="filter-select-copy"><small>{label}</small><strong>{valueLabel}</strong></span><ChevronDown size={15} className={open ? 'rotate' : ''} /></button><AnimatePresence initial={false}>{open && <motion.div className="filter-select-menu" initial={{ opacity: 0, y: -5, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.14 }}>{options.map((option) => <button className={value === option.value ? 'active' : ''} key={option.value} onClick={() => { onChange(option.value); setOpen(false) }}><span>{option.label}</span>{option.count !== undefined && <b>{option.count}</b>}</button>)}</motion.div>}</AnimatePresence></div>
}

function DashboardFilters({ filterLifecycle, setFilterLifecycle, filterRepo, setFilterRepo, filterReview, setFilterReview, statusCounts, repos, allPrs }: { filterLifecycle: 'ALL' | LifecycleStatus; setFilterLifecycle: (value: 'ALL' | LifecycleStatus) => void; filterRepo: string; setFilterRepo: (value: string) => void; filterReview: 'ALL' | 'ATTENTION' | 'WAITING' | 'REVIEWED'; setFilterReview: (value: 'ALL' | 'ATTENTION' | 'WAITING' | 'REVIEWED') => void; statusCounts: Record<'ALL' | LifecycleStatus, number>; repos: RepoConfig[]; allPrs: PullRequest[] }) {
  const lifecycleOptions = (Object.keys(lifecycleFilterLabelsV2) as Array<'ALL' | LifecycleStatus>).map((value) => ({ value, label: lifecycleFilterLabelsV2[value], count: statusCounts[value] }))
  const repositoryOptions = [{ value: 'all', label: 'Todos', count: allPrs.length }, ...repos.map((repo) => { const value = `${repo.workspace}/${repo.repo}`; return { value, label: repo.repo, count: allPrs.filter((pr) => `${pr.repo.workspace}/${pr.repo.repo}` === value).length } })]
  const reviewOptions = [{ value: 'ALL', label: 'Todos' }, { value: 'ATTENTION', label: 'Necesitan revisión' }, { value: 'WAITING', label: 'Esperando al dev' }, { value: 'REVIEWED', label: 'Revisados' }]
  const lifecycleLabel = lifecycleOptions.find((option) => option.value === filterLifecycle)?.label || 'Todos'
  const repositoryLabel = repositoryOptions.find((option) => option.value === filterRepo)?.label || 'Todos'
  const reviewLabel = reviewOptions.find((option) => option.value === filterReview)?.label || 'Todos'
  return <section className="filter-panel" aria-label="Filtros del tablero"><DashboardFilterSelect label="Estados" value={filterLifecycle} valueLabel={lifecycleLabel} options={lifecycleOptions} onChange={(value) => setFilterLifecycle(value as 'ALL' | LifecycleStatus)} /><DashboardFilterSelect label="Repositorios" value={filterRepo} valueLabel={repositoryLabel} options={repositoryOptions} onChange={setFilterRepo} /><DashboardFilterSelect label="QA" value={filterReview} valueLabel={reviewLabel} options={reviewOptions} onChange={(value) => setFilterReview(value as 'ALL' | 'ATTENTION' | 'WAITING' | 'REVIEWED')} /></section>
}

function Dashboard() {
  const [session, setSession] = useState<Session | null>(() => { const value = getSession(); return value && value.expiresAt > Date.now() ? value : null })
  const [repos, setRepos] = useState<RepoConfig[]>(getRepos)
  const [filterRepo, setFilterRepo] = useState('all')
  const [filterLifecycle, setFilterLifecycle] = useState<'ALL' | LifecycleStatus>('OPEN')
  const [filterReview, setFilterReview] = useState<'ALL' | 'ATTENTION' | 'WAITING' | 'REVIEWED'>('ATTENTION')
  const [visibleLimit, setVisibleLimit] = useState(20)
  const [notices, setNotices] = useState<Notice[]>(getNotices)
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => ({ ...defaultNotificationPreferences, ...getNotificationPreferences() }))
  const [showNotices, setShowNotices] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [, setIgnoreRevision] = useState(0)
  const snapshotRef = useRef<Record<string, string>>(getSnapshot())
  const audioContextRef = useRef<AudioContext | null>(null)
  useEffect(() => { if (!session) return; const timer = window.setInterval(() => { if (Date.now() >= session.expiresAt) { clearSession(); setSession(null); toast('La sesión expiró.') } }, 60_000); return () => clearInterval(timer) }, [session])
  useEffect(() => { if (!session || !preferences.sound || !window.AudioContext) return; const unlockSound = () => { const context = audioContextRef.current || new window.AudioContext(); audioContextRef.current = context; void context.resume(); window.removeEventListener('pointerdown', unlockSound) }; window.addEventListener('pointerdown', unlockSound, { once: true }); return () => window.removeEventListener('pointerdown', unlockSound) }, [session, preferences.sound])
  const queries = useQueries({ queries: session ? repos.map((repo) => ({ queryKey: ['prs-v2', repo.workspace, repo.repo], queryFn: () => getPullRequests(repo, session), refetchInterval: 25_000, staleTime: 10_000 })) : [] })
  const allPrs = useMemo(() => Array.from(new Map(queries.flatMap((query) => query.data || []).map((pr) => [`${pr.repo.workspace}/${pr.repo.repo}#${pr.id}`, pr])).values()), [queries])
  const fetching = queries.some((query) => query.isFetching)
  const fetchedRepositories = queries.filter((query) => query.isFetched).length
  const initialLoading = queries.length > 0 && fetchedRepositories < queries.length
  const error = queries.find((query) => query.isError)?.error
  const initialSyncComplete = queries.length > 0 && queries.every((query) => query.isFetched)
  const syncVersion = queries.map((query) => query.dataUpdatedAt).join(':')
  const updatePreferences = (next: NotificationPreferences) => { setPreferences(next); saveNotificationPreferences(next) }
  const testSound = () => { if (!window.AudioContext) { toast.error('Este navegador no permite reproducir sonidos aquí.'); return }; const context = audioContextRef.current || new window.AudioContext(); audioContextRef.current = context; void context.resume(); playDashboardSound(context); updatePreferences({ ...preferences, sound: true }); toast.success('Sonido activado') }
  const requestDesktop = async () => { if (!('Notification' in window)) { toast.error('Este navegador no soporta notificaciones del sistema.'); return }; const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission; if (permission === 'granted') { updatePreferences({ ...preferences, desktop: true }); toast.success('Notificaciones del sistema activadas') } else toast.error('El navegador no concedió permiso para las notificaciones.') }
  useEffect(() => { if (!initialSyncComplete) return; const previous = snapshotRef.current; const hasBaseline = Object.keys(previous).length > 0; const next = { ...previous }; const fresh: Notice[] = []; allPrs.forEach((pr) => { const key = `${pr.repo.workspace}/${pr.repo.repo}#${pr.id}`; if (hasBaseline && pr.state === 'OPEN' && previous[key] && previous[key] !== pr.updated_on) fresh.push({ id: `${key}-${pr.updated_on}`, text: `Actualización en PR #${pr.id}: ${pr.title}`, createdAt: Date.now(), read: false }); else if (hasBaseline && pr.state === 'OPEN' && !previous[key]) fresh.push({ id: `${key}-${pr.updated_on}`, text: `PR nuevo abierto: #${pr.id} ${pr.title}`, createdAt: Date.now(), read: false }); next[key] = pr.updated_on }); snapshotRef.current = next; saveSnapshot(next); if (!fresh.length) return; fresh.slice(0, 3).forEach((notice) => { toast(notice.text, { id: notice.id }); if (preferences.desktop && 'Notification' in window && Notification.permission === 'granted') new Notification('Nueva actividad en Bitbucket', { body: notice.text, tag: notice.id }) }); if (fresh.length > 3) toast(`${fresh.length - 3} novedades adicionales`, { description: 'Revísalas en el centro de notificaciones.' }); if (preferences.sound && audioContextRef.current) playDashboardSound(audioContextRef.current); setNotices((current) => { const merged = [...fresh, ...current].slice(0, 40); saveNotices(merged); return merged }) }, [allPrs, initialSyncComplete, preferences.desktop, preferences.sound, syncVersion])
  useEffect(() => { document.title = preferences.title && notices.some((notice) => !notice.read) ? `${notices.filter((notice) => !notice.read).length} nuevas · PR Dashboard` : 'PR Control Room · Bitbucket'; return () => { document.title = 'PR Control Room · Bitbucket' } }, [notices, preferences.title, session])
  useEffect(() => { setVisibleLimit(20) }, [filterRepo, filterLifecycle, filterReview])
  useEffect(() => { const refreshIgnoreRules = () => setIgnoreRevision((value) => value + 1); window.addEventListener('prcr:ignore-rules-changed', refreshIgnoreRules); return () => window.removeEventListener('prcr:ignore-rules-changed', refreshIgnoreRules) }, [])
  const repoPrs = allPrs.filter((pr) => filterRepo === 'all' || `${pr.repo.workspace}/${pr.repo.repo}` === filterRepo)
  const statusCounts = useMemo(() => repoPrs.reduce<Record<'ALL' | LifecycleStatus, number>>((counts, pr) => { counts[getLifecycleStatus(pr)] += 1; return counts }, { ALL: repoPrs.length, OPEN: 0, DRAFT: 0, QUEUED: 0, MERGED: 0, DECLINED: 0 }), [repoPrs])
  const sortedPrs = useMemo(() => repoPrs.filter((pr) => (filterLifecycle === 'ALL' || getLifecycleStatus(pr) === filterLifecycle) && matchesReviewFilterV2(pr, filterReview, session?.uuid)).sort((first, second) => { const firstPriority = reviewPriorityV2[classifyPr(first, session?.uuid)]; const secondPriority = reviewPriorityV2[classifyPr(second, session?.uuid)]; return firstPriority !== secondPriority ? firstPriority - secondPriority : new Date(second.updated_on).getTime() - new Date(first.updated_on).getTime() }), [repoPrs, filterLifecycle, filterReview, session?.uuid])
  const visiblePrs = sortedPrs.slice(0, visibleLimit)
  const reviewCount = repoPrs.filter((pr) => !isIgnoredPullRequest(pr) && ['unreviewed', 'changes'].includes(classifyPr(pr, session?.uuid))).length
  const unread = notices.filter((notice) => !notice.read).length
  const refresh = () => { queries.forEach((query) => void query.refetch()); toast.success('Actualizando pull requests') }
  const markNoticesRead = () => { const read = notices.map((notice) => ({ ...notice, read: true })); setNotices(read); saveNotices(read) }
  const deleteNotice = (id: string) => { const next = notices.filter((notice) => notice.id !== id); setNotices(next); saveNotices(next) }
  const clearNotices = () => { setNotices([]); saveNotices([]) }
  if (!session) return <Login onLogin={setSession} />
  return <div className="app-shell"><header className="topbar"><div className="brand"><div className="brand-icon"><GitPullRequest size={18} /></div><div><strong>PR CONTROL ROOM</strong><small>BITBUCKET CLOUD</small></div></div><div className="top-actions"><div className="connection"><span className="signal" /> CONECTADO <span className="last-refresh">· {fetching ? 'sincronizando' : 'en vivo'}</span></div><button className="icon-button" onClick={refresh} title="Actualizar"><RefreshCw size={17} className={fetching ? 'spin' : ''} /></button><div className="notification-wrap"><button className="icon-button bell" onClick={() => { setShowNotices((value) => !value); if (!showNotices) markNoticesRead() }} title="Notificaciones"><Bell size={17} />{unread > 0 && <b>{unread}</b>}</button>{showNotices && <DashboardNoticePanel notices={notices} onClose={() => setShowNotices(false)} onDelete={deleteNotice} onClear={clearNotices} />}</div><button className="user-pill" onClick={() => setShowSettings(true)}><DashboardAvatar name={dashboardName(session.displayName, session.email)} /> <span className="user-name">{session.displayName || session.email}</span></button></div></header><main className="content"><section className="page-heading"><div><div className="eyebrow">OVERVIEW <span>/{new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}</span></div><h1>Tu cola de revisión.</h1><p><strong>{reviewCount} requieren tu revisión</strong><span className="heading-context"> · {repos.length} repositorios monitorizados</span></p></div></section><DashboardFilters filterLifecycle={filterLifecycle} setFilterLifecycle={setFilterLifecycle} filterRepo={filterRepo} setFilterRepo={setFilterRepo} filterReview={filterReview} setFilterReview={setFilterReview} statusCounts={statusCounts} repos={repos} allPrs={allPrs} />{error && <div className="banner-error"><CircleAlert size={16} /> {error instanceof Error ? error.message : 'No se pudo cargar Bitbucket.'}<button onClick={refresh}>Reintentar</button></div>}{initialLoading && <div className="loading-panel" role="status"><div><RefreshCw className="spin" size={18} /><span><strong>Cargando pull requests…</strong><small>{fetchedRepositories} de {queries.length} repositorios sincronizados</small></span></div><div className="loading-track"><i style={{ width: `${queries.length ? Math.max(8, fetchedRepositories / queries.length * 100) : 8}%` }} /></div></div>}<div className="list-summary"><span><strong>{sortedPrs.length}</strong> resultados · más recientes primero</span><span>Se muestran {Math.min(visibleLimit, sortedPrs.length)} de {sortedPrs.length}</span></div><div className="pr-list"><AnimatePresence mode="popLayout">{visiblePrs.map((pr) => <DashboardPrRow key={`${pr.repo.workspace}/${pr.repo.repo}-${pr.id}`} pr={pr} session={session} />)}</AnimatePresence>{initialLoading && !allPrs.length && <><div className="pr-skeleton" /><div className="pr-skeleton" /><div className="pr-skeleton" /></>}{!initialLoading && !sortedPrs.length && <div className="empty"><GitPullRequest size={24} /><p>No hay pull requests en este filtro.</p><small>Prueba otra combinación de estado o repositorio.</small></div>}</div>{visibleLimit < sortedPrs.length && <button className="load-more" onClick={() => setVisibleLimit((limit) => limit + 20)}>Mostrar 20 más <span>({sortedPrs.length - visibleLimit} restantes)</span></button>}</main>{showSettings && <DashboardSettings repos={repos} setRepos={setRepos} preferences={preferences} setPreferences={updatePreferences} requestDesktop={requestDesktop} testSound={testSound} onClose={() => setShowSettings(false)} onLogout={() => { clearSession(); setSession(null) }} />}</div>
}

function Settings({ repos, setRepos, onClose, onLogout }: { repos: RepoConfig[]; setRepos: (repos: RepoConfig[]) => void; onClose: () => void; onLogout: () => void }) {
  const [draft, setDraft] = useState<RepoConfig>({ workspace: '', repo: '' })
  const add = () => {
    const repo = { workspace: draft.workspace.trim(), repo: draft.repo.trim() }
    if (!repo.workspace || !repo.repo) return
    if (repos.some((item) => `${item.workspace}/${item.repo}`.toLocaleLowerCase() === `${repo.workspace}/${repo.repo}`.toLocaleLowerCase())) {
      toast.error('Ese repositorio ya está agregado.')
      return
    }
    const next = [...repos, repo]
    setRepos(next)
    saveRepos(next)
    setDraft({ workspace: '', repo: '' })
  }
  const remove = (index: number) => {
    const next = repos.filter((_, itemIndex) => itemIndex !== index)
    setRepos(next)
    saveRepos(next)
  }

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="settings-modal"><div className="popover-head"><div><div className="eyebrow">CONFIGURACIÓN</div><h2>Repositorios monitorizados</h2></div><button onClick={onClose}><X size={18} /></button></div><p className="modal-copy">Agrega los repositorios de Bitbucket que quieras tener en tu cola de revisión.</p><div className="repo-list">{repos.map((repo, index) => <div className="repo-config" key={`${repo.workspace}/${repo.repo}`}><span><GitPullRequest size={15} /> {repo.workspace} / <strong>{repo.repo}</strong></span><button onClick={() => remove(index)} aria-label="Eliminar repositorio"><Trash2 size={15} /></button></div>)}</div><div className="add-repo"><input placeholder="workspace" value={draft.workspace} onChange={(event) => setDraft({ ...draft, workspace: event.target.value })} /><span>/</span><input placeholder="repo slug" value={draft.repo} onChange={(event) => setDraft({ ...draft, repo: event.target.value })} /><button className="secondary" onClick={add}><Plus size={15} /> Agregar</button></div><div className="modal-footer"><button className="logout" onClick={onLogout}><LogOut size={15} /> Cerrar sesión</button><button className="primary" onClick={onClose}><Check size={15} /> Listo</button></div></section></div>
}
export default Dashboard
