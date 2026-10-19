import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Copy, RefreshCw } from 'lucide-react'
import PreparationDialog, { PreparationError } from './PreparationDialog'
import { usePreparationData } from '../hooks/usePreparationSettings'
import { buildProjectSessionContext, contextRevision, localReviewDay, openProjectSession, projectContextRevision, shouldRemindContext } from '../lib/projectSession'
import { getContextReminder, saveContextReminder } from '../lib/storage'
import { resolveRulesForRepository } from '../lib/rulepacks'
import { projectKey } from '../lib/projectPreparation'
import { sessionCacheKey } from '../lib/queryIdentity'
import type { ContextReminder } from '../lib/projectSession'
import type { RepoConfig, Session } from '../types'

type ProjectSession = { repo: RepoConfig; revision: string; text: string; ruleCount: number }

function ProjectSessionDialog({ projects, initialProject, onClose }: { projects: ProjectSession[]; initialProject?: string; onClose: () => void }) {
  const [selection, setSelection] = useState(initialProject || projectKey(projects[0].repo))
  const project = projects.find((item) => projectKey(item.repo) === selection) || projects[0]
  const [error, setError] = useState('')
  const [copiedVersion, setCopiedVersion] = useState('')
  const [copying, setCopying] = useState(false)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const copy = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setCopying(true)
    setError('')
    try {
      await navigator.clipboard.writeText(project.text)
      if (mounted.current) setCopiedVersion(`${projectKey(project.repo)}:${project.revision}`)
    } catch {
      if (mounted.current) setError('No se pudo copiar. Permite el portapapeles o selecciona el texto en la vista previa. El contexto sigue disponible.')
    } finally {
      inFlight.current = false
      if (mounted.current) setCopying(false)
    }
  }
  return <PreparationDialog title="Contexto para tu agente" className="project-session-dialog" description="Recordatorio de jornada · también úsalo al abrir un chat nuevo" onClose={onClose}>
    <div className="preparation-dialog-body project-session-body">
      <p>Comparte el contexto inicial una vez por chat y proyecto. Después, copia solo la guía de cada PR. Si el agente pierde el contexto, vuelve a compartirlo desde aquí.</p>
      <label className="project-session-select">Proyecto<select data-autofocus value={projectKey(project.repo)} disabled={copying} onChange={(event) => { setSelection(event.target.value); setError('') }}>{projects.map((item) => <option key={projectKey(item.repo)} value={projectKey(item.repo)}>{projectKey(item.repo)}</option>)}</select></label>
      <div className="project-session-version"><code>{project.revision}</code><span>{project.text.length.toLocaleString('es-CL')} caracteres · sin datos de PR</span></div>
      {!project.repo.profile?.summary && <p className="preparation-notice">La ficha general todavía no está completa. El agente recibirá esa limitación; puedes completarla en Preparar.</p>}
      {project.ruleCount > 0 && <p className="preparation-notice">El resumen incluye el índice de {project.ruleCount} reglas avanzadas, no su texto completo. Para una regla necesaria, comparte “Copiar contexto completo” desde Preparar o usa el AGENTS.md que descargaste.</p>}
      <p>El aviso reaparece cada día local y si cambia el contexto guardado. No detectamos otros chats ni comprobamos la memoria del agente. Cerrar el aviso solo lo pospone hasta el próximo día o cambio.</p>
      {copiedVersion === `${projectKey(project.repo)}:${project.revision}` ? <p role="status" className="preparation-notice">Contexto inicial copiado. Pégalo en el chat del agente; copiarlo no lo envía automáticamente.</p> : copiedVersion && <p role="status" className="preparation-notice">El proyecto seleccionado o su contexto cambiaron. Copia la versión actual antes de usarla.</p>}
      <PreparationError message={error} />
      <details className="preparation-context-preview" open={Boolean(error)}><summary>Ver y seleccionar el contexto inicial</summary><pre>{project.text}</pre></details>
    </div>
    <footer className="settings-footer project-session-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cerrar por hoy</button><button type="button" className="button button-primary" disabled={copying} aria-busy={copying} onClick={() => void copy()}>{copying ? <RefreshCw size={16} className="spin" /> : <Copy size={16} />}Copiar contexto inicial</button></footer>
  </PreparationDialog>
}

export default function ProjectSessionLauncher({ session, setRepos }: { session: Session; setRepos: (repos: RepoConfig[]) => void }) {
  const data = usePreparationData(setRepos)
  const account = sessionCacheKey(session)
  const [seen, setSeen] = useState<ContextReminder | null>(() => getContextReminder(account))
  const [environment, setEnvironment] = useState(reminderEnvironment)
  const [manualRequest, setManualRequest] = useState<{ project?: string } | null>(null)
  const [storageError, setStorageError] = useState(false)
  const projects = useMemo(() => data.repositories.map((repo) => {
    const { rules, unavailable } = resolveRulesForRepository(repo, data.customRules)
    return { repo, revision: projectContextRevision(repo, rules, data.personalPreferences, unavailable), text: buildProjectSessionContext(repo, rules, data.personalPreferences, unavailable), ruleCount: rules.length }
  }), [data])
  const revision = contextRevision(projects.map((project) => `${projectKey(project.repo)}:${project.revision}`).sort().join('\n'))
  const { day } = environment
  const open = manualRequest !== null || (environment.available && shouldRemindContext(seen, day, revision))
  const close = useCallback(() => {
    const reminder = { day, revision }
    setSeen(reminder)
    setStorageError(!saveContextReminder(account, reminder))
    setManualRequest(null)
  }, [account, day, revision])
  useEffect(() => {
    const check = () => setEnvironment(reminderEnvironment())
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === `prcr:context-reminder:${encodeURIComponent(account)}`) setSeen((current) => getContextReminder(account) || current)
      if (event.key === null || event.key === 'prcr:preparation-v1' || event.key?.startsWith('prcr:context-reminder:')) check()
    }
    const onOpen = (event: Event) => setManualRequest({ project: (event as CustomEvent<string | undefined>).detail })
    const timer = window.setInterval(() => setEnvironment(reminderEnvironment()), 60_000)
    window.addEventListener('focus', check)
    window.addEventListener('storage', onStorage)
    window.addEventListener('prcr:open-project-session', onOpen)
    window.addEventListener('prcr:preparation-changed', check)
    document.addEventListener('visibilitychange', check)
    return () => { clearInterval(timer); window.removeEventListener('focus', check); window.removeEventListener('storage', onStorage); window.removeEventListener('prcr:open-project-session', onOpen); window.removeEventListener('prcr:preparation-changed', check); document.removeEventListener('visibilitychange', check) }
  }, [account])
  return <>
    <div className="project-session-bar"><div><BookOpen size={17} /><span>Contexto general una vez por chat; cada PR lleva solo su revisión.</span></div><button type="button" className="button button-secondary" disabled={!projects.length} onClick={() => openProjectSession()}>Nuevo chat / Contexto inicial</button>{storageError && <p role="status">No se pudo guardar el recordatorio. No volverá a abrirse en esta pantalla, pero puede reaparecer al recargar.</p>}</div>
    {open && projects.length > 0 && <ProjectSessionDialog projects={projects} initialProject={manualRequest?.project} onClose={close} />}
  </>
}

function reminderEnvironment() {
  return { day: localReviewDay(), available: document.visibilityState !== 'hidden' && !document.querySelector('[aria-modal="true"]:not(.project-session-dialog)') }
}
