import { useCallback, useRef, useState, type ComponentProps } from 'react'
import { Download, Plus, Settings2, Undo2, Upload, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import AuthorsView from './AuthorsView'
import PreparationProjectCard from './PreparationProjectCard'
import ProjectProfileEditor from './ProjectProfileEditor'
import PreparationPreferencesDialog from './PreparationPreferencesDialog'
import PreparationBackupDialog from './PreparationBackupDialog'
import PreparationAddProject from './PreparationAddProject'
import { usePreparationSettings } from '../hooks/usePreparationSettings'
import { createPreparationBackup, parsePreparationBackup, type PreparationBackup } from '../lib/preparationBackup'
import { buildProjectDiscoveryPrompt, MAX_PREPARATION_FILE_BYTES, projectKey } from '../lib/projectPreparation'
import { downloadPreparationFile } from '../lib/preparationFiles'
import { buildRepositoryCodexConfiguration } from '../lib/reviewContext'
import { resolveRulesForRepository } from '../lib/rulepacks'
import type { PersonalReviewPreferences, RepoConfig, StoredPreparation } from '../types'

type Props = ComponentProps<typeof AuthorsView>
type Modal = { type: 'project'; repo: RepoConfig } | { type: 'preferences'; preferences: PersonalReviewPreferences } | { type: 'add' } | { type: 'restore'; backup: PreparationBackup; original: StoredPreparation } | null

function PreparationModals({ modal, controller, onClose }: { modal: Modal; controller: ReturnType<typeof usePreparationSettings>; onClose: () => void }) {
  if (!modal) return null
  if (modal.type === 'project') return <ProjectProfileEditor repo={modal.repo} onSave={(next) => controller.updateProject(next, modal.repo)} onClose={onClose} />
  if (modal.type === 'preferences') return <PreparationPreferencesDialog preferences={modal.preferences} onSave={(next) => controller.updatePreferences(next, modal.preferences)} onClose={onClose} />
  if (modal.type === 'add') return <PreparationAddProject onSave={controller.addProject} onClose={onClose} />
  return <PreparationBackupDialog current={modal.original} backup={modal.backup} onApply={(next) => controller.restore(next, modal.original)} onClose={onClose} />
}

function PreparationWorkspace(props: Props) {
  const controller = usePreparationSettings(props.setRepos)
  const { data } = controller
  const [modal, setModal] = useState<Modal>(null)
  const closeModal = useCallback(() => setModal(null), [])
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const readId = useRef(0)

  const copy = async (text: string, label: string) => {
    setError('')
    try { await navigator.clipboard.writeText(text); toast.success(label, { description: 'Ya puedes pegarlo en Codex dentro de la carpeta del proyecto.' }) }
    catch { setError('No se pudo copiar. Revisa los permisos del portapapeles. Puedes seleccionar el texto en la vista previa o descargar AGENTS.md.') }
  }
  const downloadBackup = () => {
    try {
      const text = JSON.stringify(createPreparationBackup(data), null, 2)
      if (new TextEncoder().encode(text).length > MAX_PREPARATION_FILE_BYTES) { setError('El respaldo supera 2 MB. Reduce textos duplicados o reglas muy extensas antes de exportar.'); return }
      parsePreparationBackup(text)
      downloadPreparationFile('pr-control-room-preparacion.json', text)
      setError('')
      toast.success('Descarga del respaldo iniciada', { description: 'Guárdalo fuera de este PC. No hay sincronización automática.' })
    } catch (reason) { setError(reason instanceof Error ? `No se pudo preparar el respaldo: ${reason.message}` : 'No se pudo iniciar la descarga. Permite las descargas en este navegador y reintenta.') }
  }
  const readBackup = async (file?: File) => {
    if (!file) return
    const requestId = ++readId.current
    setReading(true)
    setError('')
    try {
      if (file.size > MAX_PREPARATION_FILE_BYTES) throw new Error('El respaldo supera el límite de 2 MB.')
      const backup = parsePreparationBackup(await file.text())
      if (requestId !== readId.current) return
      setAdvancedOpen(false)
      setModal({ type: 'restore', backup, original: data })
    } catch (reason) { if (requestId === readId.current) setError(reason instanceof Error ? reason.message : 'No se pudo leer el archivo seleccionado.') }
    finally { if (requestId === readId.current) setReading(false) }
  }
  const downloadGuide = (repo: RepoConfig, context: string) => {
    try { downloadPreparationFile('AGENTS.md', context, 'text/markdown'); toast.success(`Descarga de la guía de ${repo.repo} iniciada`) }
    catch { setError('No se pudo descargar la guía. Permite las descargas del navegador y reintenta.') }
  }
  return <section className="preparation-workspace" aria-labelledby="preparation-heading">
    <header className="preparation-heading"><div><span className="section-kicker">Contexto portable</span><h1 id="preparation-heading">Preparar revisiones</h1><p>Guarda contexto, versiones y criterios una vez. Reutilízalos en cada PR.</p></div><button type="button" className="button button-primary" onClick={() => setModal({ type: 'add' })}><Plus size={16} /> Añadir proyecto</button></header>
    <div className="preparation-toolbar"><button type="button" className="button button-secondary" onClick={() => setModal({ type: 'preferences', preferences: data.personalPreferences })}><UserRound size={16} /> Mis preferencias</button><button type="button" className="button button-secondary" onClick={downloadBackup}><Download size={16} /> Descargar respaldo</button><button type="button" className="button button-secondary preparation-restore-button" disabled={reading} aria-busy={reading} onClick={() => fileRef.current?.click()}><Upload size={16} />{reading ? 'Leyendo respaldo…' : 'Restaurar respaldo'}</button>{data.previous && <button type="button" className="button button-ghost" onClick={() => { if (!controller.undoRestore()) setError('No se pudo deshacer la restauración. No se modificó la configuración actual.') }}><Undo2 size={15} /> Deshacer última restauración</button>}<input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => { void readBackup(event.target.files?.[0]); event.currentTarget.value = '' }} /></div>
    <p className="preparation-local-note">Guardado solo en este navegador. Descarga un respaldo antes de cambiar de PC o formatear. No se incluyen la sesión ni la configuración Git; revisa los textos libres antes de compartirlos.</p>
    {error && <p role="alert" className="preparation-error">{error}</p>}
    <div className="preparation-project-list">{data.repositories.map((repo) => {
      const resolved = resolveRulesForRepository(repo, data.customRules)
      const context = buildRepositoryCodexConfiguration(repo, resolved.rules, resolved.unavailable)
      return <PreparationProjectCard key={projectKey(repo)} repo={repo} rules={data.customRules} context={context} onEdit={() => setModal({ type: 'project', repo })} onCopy={() => void copy(context, 'Contexto del proyecto copiado')} onDiscover={() => void copy(buildProjectDiscoveryPrompt(repo), 'Instrucción para conocer el proyecto copiada')} onDownload={() => downloadGuide(repo, context)} />
    })}</div>
    {!data.repositories.length && <div className="empty-state"><h2>Añade tu primer proyecto</h2><p>No necesitas una biblioteca de reglas para empezar: crea su ficha y completa el contexto.</p></div>}
    <section className="preparation-advanced"><button type="button" className="button button-ghost" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((value) => !value)}><Settings2 size={16} /> Git de este equipo, autores y reglas avanzadas</button>{advancedOpen && <div><p>Las opciones anteriores siguen disponibles. Los aliases Git pertenecen a este equipo y no se incluyen en el respaldo portable. Las reglas avanzadas se conservan; puedes activarlas o desactivarlas desde cada ficha.</p><AuthorsView {...props} repos={data.repositories} /></div>}</section>
    <PreparationModals modal={modal} controller={controller} onClose={closeModal} />
  </section>
}

export default function PreparationView(props: Props) {
  return props.showRules === false ? <AuthorsView {...props} /> : <PreparationWorkspace {...props} />
}
