import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { BellRing, Check, CircleAlert, GitPullRequest, LogOut, Monitor, Plus, RefreshCw, Send, Trash2, Volume2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useModalDialog } from '../hooks/useDismissableLayer'
import { PULL_REQUEST_POLL_INTERVAL_MS } from '../lib/notifications'
import { saveNotificationPreferences, saveRepos } from '../lib/storage'
import type { NotificationPreferences, RepoConfig } from '../types'
import { getBrowserPushDiagnostics, getPushServerDiagnostics, sendPushTest, type BrowserPushDiagnostics, type PushServerDiagnostics } from '../lib/push'
import type { Session } from '../types'

export default function SettingsDialog({
  repos,
  setRepos,
  preferences,
  setPreferences,
  triggerRef,
  requestDesktop,
  disableDesktop,
  session,
  testSound,
  onClose,
  onLogout,
}: {
  repos: RepoConfig[]
  setRepos: (repos: RepoConfig[]) => void
  preferences: NotificationPreferences
  setPreferences: (preferences: NotificationPreferences) => void
  triggerRef: RefObject<HTMLButtonElement>
  requestDesktop: () => void
  disableDesktop: () => void
  session: Session | null
  testSound: () => void
  onClose: () => void
  onLogout: () => void
}) {
  const [draft, setDraft] = useState<RepoConfig>({ workspace: '', repo: '' })
  const [browserDiagnostics, setBrowserDiagnostics] = useState<BrowserPushDiagnostics | null>(null)
  const [serverDiagnostics, setServerDiagnostics] = useState<PushServerDiagnostics | null>(null)
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false)
  const dialogRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const close = useCallback(onClose, [onClose])
  useModalDialog(true, dialogRef, close, triggerRef)

  const refreshDiagnostics = async () => {
    setDiagnosticsBusy(true)
    const [browser, server] = await Promise.allSettled([getBrowserPushDiagnostics(), getPushServerDiagnostics()])
    if (browser.status === 'fulfilled') setBrowserDiagnostics(browser.value)
    if (server.status === 'fulfilled') setServerDiagnostics(server.value)
    setDiagnosticsBusy(false)
  }

  const testPush = async () => {
    try { const result = await sendPushTest(); toast.success(`Push enviado a ${result.sent} dispositivo${result.sent === 1 ? '' : 's'}`); await refreshDiagnostics() }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : 'No se pudo enviar el Push de prueba.') }
  }
  useEffect(() => { void refreshDiagnostics() }, [])

  const addRepo = () => {
    const repo = { workspace: draft.workspace.trim(), repo: draft.repo.trim() }
    if (!repo.workspace || !repo.repo) {
      toast.error('Completa el workspace y el repositorio.')
      return
    }
    if (repos.some((item) => `${item.workspace}/${item.repo}`.toLocaleLowerCase() === `${repo.workspace}/${repo.repo}`.toLocaleLowerCase())) {
      toast.error('Ese repositorio ya está agregado.')
      return
    }
    const next = [...repos, repo]
    setRepos(next)
    saveRepos(next)
    setDraft({ workspace: '', repo: '' })
    toast.success(`${repo.repo} agregado`, { description: 'Ya forma parte de la cola monitorizada.' })
  }

  const removeRepo = (index: number) => {
    const previous = repos
    const removed = repos[index]
    const next = repos.filter((_, itemIndex) => itemIndex !== index)
    setRepos(next)
    saveRepos(next)
    toast.success(`${removed.repo} dejó de monitorizarse`, {
      action: {
        label: 'Deshacer',
        onClick: () => {
          setRepos(previous)
          saveRepos(previous)
        },
      },
    })
  }

  const togglePreference = (key: keyof NotificationPreferences) => {
    if (key === 'sound' && !preferences.sound) {
      testSound()
      return
    }
    const next = { ...preferences, [key]: !preferences[key] }
    setPreferences(next)
    saveNotificationPreferences(next)
  }

  return (
    <motion.div
      className="dialog-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0.08 : 0.18 }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.section
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
        transition={{ duration: reduceMotion ? 0.08 : 0.2 }}
      >
        <header className="overlay-heading settings-heading">
          <div><span className="section-kicker">Configuración</span><h2 id="settings-title">Preferencias del control room</h2></div>
          <button type="button" className="icon-button" aria-label="Cerrar configuración" onClick={onClose}><X size={20} /></button>
        </header>

        <div className="settings-body">
          <section className="settings-section" aria-labelledby="repos-heading">
            <div className="settings-section-heading"><span className="settings-section-icon"><GitPullRequest size={18} /></span><div><h3 id="repos-heading">Repositorios monitorizados</h3><p>Controla qué repositorios alimentan tu cola.</p></div></div>
            <div className="repo-list">
              {repos.length ? repos.map((repo, index) => (
                <div className="repo-item" key={`${repo.workspace}/${repo.repo}`}>
                  <span className="repo-item-icon"><GitPullRequest size={16} /></span>
                  <span><small>{repo.workspace}</small><strong>{repo.repo}</strong></span>
                  <button type="button" className="icon-button" onClick={() => removeRepo(index)} aria-label={`Dejar de monitorizar ${repo.repo}`}><Trash2 size={17} /></button>
                </div>
              )) : <p className="settings-list-empty">Todavía no hay repositorios monitorizados.</p>}
            </div>
            <form className="add-repo-form" noValidate onSubmit={(event) => { event.preventDefault(); addRepo() }}>
              <label className="field" htmlFor="repo-workspace"><span>Workspace</span><input id="repo-workspace" value={draft.workspace} onChange={(event) => setDraft({ ...draft, workspace: event.target.value })} placeholder="kontroller_test" /></label>
              <label className="field" htmlFor="repo-slug"><span>Repositorio</span><input id="repo-slug" value={draft.repo} onChange={(event) => setDraft({ ...draft, repo: event.target.value })} placeholder="providers_api" /></label>
              <button className="button button-secondary" type="submit"><Plus size={16} /> Agregar</button>
            </form>
          </section>

          <section className="settings-section" aria-labelledby="notifications-heading">
            <div className="settings-section-heading"><span className="settings-section-icon"><BellRing size={18} /></span><div><h3 id="notifications-heading">Notificaciones</h3><p>Solo PR nuevos o turnos de revisión · consulta cada {PULL_REQUEST_POLL_INTERVAL_MS / 60_000} min.</p></div></div>
            <div className="preference-list">
              <div className="preference-row"><span className="preference-icon"><Monitor size={18} /></span><span><strong>Notificaciones del sistema</strong><small>Avisa aunque la PWA esté minimizada o cerrada.</small></span><div className="preference-controls"><button type="button" className={`switch ${preferences.desktop ? 'is-on' : ''}`} role="switch" aria-label="Notificaciones del sistema" aria-checked={preferences.desktop} onClick={preferences.desktop ? disableDesktop : requestDesktop}><span /></button></div></div>
              <div className="preference-row"><span className="preference-icon"><Volume2 size={18} /></span><span><strong>Sonido</strong><small>Suena una vez cuando aparece una acción para ti.</small></span><div className="preference-controls"><button type="button" className="text-button test-sound" onClick={testSound}><Volume2 size={15} /> Probar</button><button type="button" className={`switch ${preferences.sound ? 'is-on' : ''}`} role="switch" aria-label="Sonido" aria-checked={preferences.sound} onClick={() => togglePreference('sound')}><span /></button></div></div>
              <div className="preference-row"><span className="preference-icon"><BellRing size={18} /></span><span><strong>Título de la pestaña</strong><small>Muestra el número de novedades sin leer.</small></span><div className="preference-controls"><button type="button" className={`switch ${preferences.title ? 'is-on' : ''}`} role="switch" aria-label="Título de la pestaña" aria-checked={preferences.title} onClick={() => togglePreference('title')}><span /></button></div></div>
            </div>
          </section>

          <section className="settings-section push-diagnostics" aria-labelledby="push-diagnostics-heading">
            <div className="settings-section-heading"><span className="settings-section-icon"><CircleAlert size={18} /></span><div><h3 id="push-diagnostics-heading">Diagnóstico Push</h3><p>Verifica el navegador, el Service Worker y los dispositivos registrados.</p></div></div>
            <div className="diagnostics-actions"><button type="button" className="button button-secondary" onClick={() => void refreshDiagnostics()} disabled={diagnosticsBusy}><RefreshCw size={16} className={diagnosticsBusy ? 'spin' : ''} /> Actualizar diagnóstico</button>{serverDiagnostics?.activeDevices ? <button type="button" className="button button-primary" onClick={() => void testPush()}><Send size={16} /> Enviar Push de prueba</button> : null}</div>
            {(browserDiagnostics || serverDiagnostics) && <div className="diagnostics-grid">
              {browserDiagnostics && <div className="diagnostics-card"><strong>Navegador</strong><span>Contexto seguro <b>{browserDiagnostics.secureContext ? 'Sí' : 'No'}</b></span><span>Permiso <b>{browserDiagnostics.notificationPermission}</b></span><span>Push API <b>{browserDiagnostics.pushSupported ? 'Disponible' : 'No disponible'}</b></span><span>Service Worker <b>{browserDiagnostics.serviceWorkerActive ? 'Activo' : 'No activo'}</b></span><span>Scope <b>{browserDiagnostics.scope ?? '—'}</b></span><span>Endpoint <b>{browserDiagnostics.subscription?.endpoint ?? 'Sin suscripción'}</b></span><span>Último Push <b>{browserDiagnostics.lastPushReceivedAt ? new Date(browserDiagnostics.lastPushReceivedAt).toLocaleString('es-CL') : '—'}</b></span></div>}
              {serverDiagnostics && <div className="diagnostics-card"><strong>Servidor</strong><span>Autenticación <b>{serverDiagnostics.authenticated ? 'Activa' : 'No autenticado'}</b></span><span>Usuario <b>{serverDiagnostics.user?.displayName ?? session?.displayName ?? '—'}</b></span><span>Dispositivos activos <b>{serverDiagnostics.activeDevices}</b></span>{serverDiagnostics.devices.map((device) => <span key={device.id}>{device.device_label ?? 'Dispositivo'} <b>{device.revoked_at ? 'Revocado' : `Visto ${new Date(device.last_seen_at).toLocaleString('es-CL')}`}</b></span>)}</div>}
            </div>}
          </section>

          <section className="settings-section settings-session" aria-labelledby="session-heading">
            <div className="settings-section-heading"><span className="settings-section-icon settings-session-icon"><LogOut size={18} /></span><div><h3 id="session-heading">Sesión</h3><p>Desconecta esta cuenta del navegador actual.</p></div></div>
            <div className="session-action">
              <span><strong>Cuenta de Bitbucket</strong><small>Podrás volver a conectarte con tus credenciales.</small></span>
              <button type="button" className="button button-ghost button-danger" onClick={onLogout}><LogOut size={16} /> Cerrar sesión</button>
            </div>
          </section>
        </div>

        <footer className="settings-footer">
          <button type="button" className="button button-primary" data-autofocus onClick={onClose}><Check size={17} /> Cerrar configuración</button>
        </footer>
      </motion.section>
    </motion.div>
  )
}
