import { useCallback, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { BellRing, Check, GitBranch, GitPullRequest, LogOut, Monitor, Plus, Trash2, Volume2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useModalDialog } from '../hooks/useDismissableLayer'
import { PULL_REQUEST_POLL_INTERVAL_MS } from '../lib/notifications'
import { saveGitWorkflowSettings, saveNotificationPreferences, saveRepos } from '../lib/storage'
import type { GitWorkflowSettings, NotificationPreferences, RepoConfig } from '../types'

export default function SettingsDialog({
  repos,
  setRepos,
  preferences,
  setPreferences,
  gitWorkflowSettings,
  setGitWorkflowSettings,
  triggerRef,
  requestDesktop,
  testSound,
  onClose,
  onLogout,
}: {
  repos: RepoConfig[]
  setRepos: (repos: RepoConfig[]) => void
  preferences: NotificationPreferences
  setPreferences: (preferences: NotificationPreferences) => void
  gitWorkflowSettings: GitWorkflowSettings
  setGitWorkflowSettings: (settings: GitWorkflowSettings) => void
  triggerRef: RefObject<HTMLButtonElement>
  requestDesktop: () => void
  testSound: () => void
  onClose: () => void
  onLogout: () => void
}) {
  const [draft, setDraft] = useState<RepoConfig>({ workspace: '', repo: '' })
  const [developerDraft, setDeveloperDraft] = useState({ displayName: '', remote: '' })
  const [repositoryDraft, setRepositoryDraft] = useState({ repository: '', remote: '' })
  const dialogRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const close = useCallback(onClose, [onClose])
  useModalDialog(true, dialogRef, close, triggerRef)

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

  const updateWorkflow = (next: GitWorkflowSettings) => {
    setGitWorkflowSettings(next)
    saveGitWorkflowSettings(next)
  }

  const addDeveloperRemote = () => {
    const displayName = developerDraft.displayName.trim()
    const remote = developerDraft.remote.trim()
    if (!displayName || !remote) return toast.error('Completa el nombre y el remoto del desarrollador.')
    const next = { ...gitWorkflowSettings, developerRemotes: [...gitWorkflowSettings.developerRemotes, { id: `${Date.now()}`, displayName, remote }] }
    updateWorkflow(next)
    setDeveloperDraft({ displayName: '', remote: '' })
  }

  const addRepositoryRemote = () => {
    const repository = repositoryDraft.repository.trim()
    const remote = repositoryDraft.remote.trim()
    if (!repository || !remote) return toast.error('Completa el repositorio y su remoto.')
    const next = { ...gitWorkflowSettings, repositoryRemotes: [...gitWorkflowSettings.repositoryRemotes, { id: `${Date.now()}`, repository, remote }] }
    updateWorkflow(next)
    setRepositoryDraft({ repository: '', remote: '' })
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

          <section className="settings-section git-workflow-settings" aria-labelledby="git-workflow-heading">
            <div className="settings-section-heading"><span className="settings-section-icon"><GitBranch size={18} /></span><div><h3 id="git-workflow-heading">Flujo local de revisión</h3><p>Genera instrucciones para revisar cada PR desde tus remotos locales.</p></div></div>
            <div className="git-command-help"><code>git sync-remotes</code><span>La app no puede ejecutar comandos en tu computador. Úsalo antes de copiar una instrucción.</span></div>
            <div className="workflow-mapping-group"><div className="mapping-heading"><strong>Desarrolladores y remotos</strong><small>Asocia el autor de Bitbucket con el remoto que tienes en tu clon.</small></div>
              <div className="mapping-list">{gitWorkflowSettings.developerRemotes.map((item) => <div className="mapping-row" key={item.id}><input aria-label="Nombre del desarrollador" value={item.displayName} onChange={(event) => updateWorkflow({ ...gitWorkflowSettings, developerRemotes: gitWorkflowSettings.developerRemotes.map((entry) => entry.id === item.id ? { ...entry, displayName: event.target.value } : entry) })} /><span>→</span><input aria-label="Remoto local" value={item.remote} onChange={(event) => updateWorkflow({ ...gitWorkflowSettings, developerRemotes: gitWorkflowSettings.developerRemotes.map((entry) => entry.id === item.id ? { ...entry, remote: event.target.value } : entry) })} /><button type="button" className="icon-button" aria-label={`Eliminar remoto de ${item.displayName}`} onClick={() => updateWorkflow({ ...gitWorkflowSettings, developerRemotes: gitWorkflowSettings.developerRemotes.filter((entry) => entry.id !== item.id) })}><Trash2 size={15} /></button></div>)}</div>
              <form className="mapping-add" onSubmit={(event) => { event.preventDefault(); addDeveloperRemote() }}><input value={developerDraft.displayName} onChange={(event) => setDeveloperDraft({ ...developerDraft, displayName: event.target.value })} placeholder="Nombre del desarrollador" /><input value={developerDraft.remote} onChange={(event) => setDeveloperDraft({ ...developerDraft, remote: event.target.value })} placeholder="remoto" /><button className="button button-secondary" type="submit"><Plus size={15} /> Agregar</button></form>
            </div>
            <div className="workflow-mapping-group"><div className="mapping-heading"><strong>Repositorios destino</strong><small>Define el remoto local de cada repositorio de Bitbucket.</small></div>
              <div className="mapping-list">{gitWorkflowSettings.repositoryRemotes.map((item) => <div className="mapping-row" key={item.id}><input aria-label="Repositorio Bitbucket" value={item.repository} onChange={(event) => updateWorkflow({ ...gitWorkflowSettings, repositoryRemotes: gitWorkflowSettings.repositoryRemotes.map((entry) => entry.id === item.id ? { ...entry, repository: event.target.value } : entry) })} /><span>→</span><input aria-label="Remoto destino" value={item.remote} onChange={(event) => updateWorkflow({ ...gitWorkflowSettings, repositoryRemotes: gitWorkflowSettings.repositoryRemotes.map((entry) => entry.id === item.id ? { ...entry, remote: event.target.value } : entry) })} /><button type="button" className="icon-button" aria-label={`Eliminar mapeo de ${item.repository}`} onClick={() => updateWorkflow({ ...gitWorkflowSettings, repositoryRemotes: gitWorkflowSettings.repositoryRemotes.filter((entry) => entry.id !== item.id) })}><Trash2 size={15} /></button></div>)}</div>
              <form className="mapping-add" onSubmit={(event) => { event.preventDefault(); addRepositoryRemote() }}><input value={repositoryDraft.repository} onChange={(event) => setRepositoryDraft({ ...repositoryDraft, repository: event.target.value })} placeholder="workspace/repositorio" /><input value={repositoryDraft.remote} onChange={(event) => setRepositoryDraft({ ...repositoryDraft, remote: event.target.value })} placeholder="origin" /><button className="button button-secondary" type="submit"><Plus size={15} /> Agregar</button></form>
            </div>
            <button type="button" className={`workflow-sync-toggle${gitWorkflowSettings.syncRemotesConfirmed ? ' is-checked' : ''}`} onClick={() => updateWorkflow({ ...gitWorkflowSettings, syncRemotesConfirmed: !gitWorkflowSettings.syncRemotesConfirmed })} aria-pressed={gitWorkflowSettings.syncRemotesConfirmed}><span>{gitWorkflowSettings.syncRemotesConfirmed ? '✓' : ''}</span> Ya ejecuté <code>git sync-remotes</code> en mi equipo</button>
          </section>

          <section className="settings-section" aria-labelledby="notifications-heading">
            <div className="settings-section-heading"><span className="settings-section-icon"><BellRing size={18} /></span><div><h3 id="notifications-heading">Notificaciones</h3><p>Solo PR nuevos o turnos de revisión · consulta cada {PULL_REQUEST_POLL_INTERVAL_MS / 60_000} min.</p></div></div>
            <div className="preference-list">
              <div className="preference-row"><span className="preference-icon"><Monitor size={18} /></span><span><strong>Notificaciones del sistema</strong><small>Avisa aunque la pestaña esté en segundo plano.</small></span><div className="preference-controls"><button type="button" className={`switch ${preferences.desktop ? 'is-on' : ''}`} role="switch" aria-label="Notificaciones del sistema" aria-checked={preferences.desktop} onClick={preferences.desktop ? () => togglePreference('desktop') : requestDesktop}><span /></button></div></div>
              <div className="preference-row"><span className="preference-icon"><Volume2 size={18} /></span><span><strong>Sonido</strong><small>Suena una vez cuando aparece una acción para ti.</small></span><div className="preference-controls"><button type="button" className="text-button test-sound" onClick={testSound}><Volume2 size={15} /> Probar</button><button type="button" className={`switch ${preferences.sound ? 'is-on' : ''}`} role="switch" aria-label="Sonido" aria-checked={preferences.sound} onClick={() => togglePreference('sound')}><span /></button></div></div>
              <div className="preference-row"><span className="preference-icon"><BellRing size={18} /></span><span><strong>Título de la pestaña</strong><small>Muestra el número de novedades sin leer.</small></span><div className="preference-controls"><button type="button" className={`switch ${preferences.title ? 'is-on' : ''}`} role="switch" aria-label="Título de la pestaña" aria-checked={preferences.title} onClick={() => togglePreference('title')}><span /></button></div></div>
            </div>
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
