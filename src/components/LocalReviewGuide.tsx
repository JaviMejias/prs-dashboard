import { useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import { ChevronDown, Copy, FileJson, GitBranch, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useLocalReviewPreparation, type CopyState } from '../hooks/useLocalReviewPreparation'
import { displayName } from '../lib/dashboard'
import { buildGitReviewInstruction, getGitRemotesCommand, type GitReviewInstruction } from '../lib/gitWorkflow'
import ReviewContextDialog from './ReviewContextDialog'
import type { GitWorkflowSettings, PullRequest, Session } from '../types'

type Props = {
  pr: PullRequest
  session: Session
  settings: GitWorkflowSettings
  onSettingsChange: (settings: GitWorkflowSettings) => void
  onOpenSettings: () => void
}

function LocalRemoteSetup({ pr, settings, onSettingsChange, onOpenSettings, instruction }: Omit<Props, 'session'> & { instruction: GitReviewInstruction }) {
  const [remoteEditorOpen, setRemoteEditorOpen] = useState(false)
  const [remoteDraft, setRemoteDraft] = useState('')
  const authorName = displayName(pr.author?.display_name || pr.author?.nickname)
  const fieldId = `remote-${pr.repo.workspace}-${pr.repo.repo}-${pr.id}`
  const saveAuthorRemote = () => {
    const remote = remoteDraft.trim()
    if (!remote) {
      toast.error('Escribe el nombre del remoto local.')
      return
    }
    const existing = settings.developerRemotes.find((item) => item.displayName.trim().toLocaleLowerCase() === authorName.trim().toLocaleLowerCase())
    const developerRemotes = existing
      ? settings.developerRemotes.map((item) => item.id === existing.id ? { ...item, remote } : item)
      : [...settings.developerRemotes, { id: `inline-${Date.now()}`, displayName: authorName, remote }]
    onSettingsChange({ ...settings, developerRemotes })
    setRemoteEditorOpen(false)
    toast.success(`Remoto de ${authorName} configurado`)
  }

  return <>
    {!instruction.sourceRemote && <div className="inline-remote-editor">{remoteEditorOpen ? <form noValidate onSubmit={(event) => { event.preventDefault(); saveAuthorRemote() }}><label htmlFor={fieldId}>Remoto de {authorName}</label><div><input id={fieldId} autoFocus value={remoteDraft} onChange={(event) => setRemoteDraft(event.target.value)} placeholder="cosores" /><button type="submit" className="button button-secondary">Guardar</button><button type="button" className="text-button" onClick={() => setRemoteEditorOpen(false)}>Cancelar</button></div></form> : <button type="button" className="instruction-configure" onClick={() => setRemoteEditorOpen(true)}>Asignar remoto local para {authorName}</button>}</div>}
    {!instruction.isComplete && instruction.sourceRemote && <button type="button" className="instruction-configure" onClick={onOpenSettings}>Configura el remoto destino para completar esta instrucción</button>}
  </>
}

function ReviewCopyFeedback({ state, unavailable }: { state: CopyState; unavailable: string[] }) {
  return <div className="review-copy-feedback">
    {state.status === 'loading' && <p role="status">Cargando commits, archivos y conversaciones de este PR…</p>}
    {state.status === 'error' && <p className="review-copy-error" role="alert">{state.message}</p>}
    {state.status !== 'loading' && unavailable.length > 0 && <p role="status">Contexto parcial: no disponible {unavailable.join(', ')}. Puedes reintentarlo con Copiar para Codex.</p>}
  </div>
}

function LocalReviewRoute({ instruction }: { instruction: GitReviewInstruction }) {
  return <div className="workflow-route" aria-label="Ruta de revisión local">
    <div className="workflow-endpoint"><small>DESDE</small><strong>{instruction.sourceRemote || 'Remoto no configurado'}</strong><code title={instruction.sourceBranch}>{instruction.sourceBranch}</code></div>
    <span className="workflow-route-arrow" aria-hidden="true">→</span>
    <div className="workflow-endpoint"><small>HACIA</small><strong>{instruction.targetRemote || 'Remoto no configurado'}</strong><code title={instruction.targetBranch}>{instruction.targetBranch}</code></div>
  </div>
}

export default function LocalReviewGuide({ pr, session, settings, onSettingsChange, onOpenSettings }: Props) {
  const reduceMotion = useReducedMotion()
  const reveal = reduceMotion ? { y: 0, duration: 0.08 } : { y: -4, duration: 0.18 }
  const [open, setOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [additionalContext, setAdditionalContext] = useState('')
  const instruction = buildGitReviewInstruction(pr, session, settings)
  const { copyState, setCopyState, unavailable, copyPreparation } = useLocalReviewPreparation(pr, session, instruction, additionalContext)
  const fieldId = `review-notes-${pr.repo.workspace}-${pr.repo.repo}-${pr.id}`
  const busy = copyState.status === 'loading'

  const copySyncCommand = async () => {
    try {
      await navigator.clipboard.writeText(getGitRemotesCommand())
      toast.success('Comando copiado')
    } catch {
      setCopyState({ status: 'error', message: 'No se pudo copiar el comando. Revisa los permisos del portapapeles.' })
    }
  }

  return <div className={`git-review-instruction${instruction.isComplete ? '' : ' is-incomplete'}${open ? ' is-open' : ''}`}>
    <button type="button" className="git-review-instruction-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span className="git-review-instruction-heading"><span className="instruction-icon"><GitBranch size={15} /></span><span><small>REVISIÓN LOCAL</small><strong>Guía de revisión</strong></span></span>
      <span className="instruction-preview">{instruction.isRevisit ? 'Revisión de seguimiento' : 'Sin revisión registrada'}</span>
      <ChevronDown size={16} className={open ? 'rotate' : ''} />
    </button>
    <AnimatePresence initial={false}>
      {open && <m.div className="git-review-instruction-details" initial={{ opacity: 0, y: reveal.y }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reveal.y }} transition={{ duration: reveal.duration }}>
        <LocalReviewRoute instruction={instruction} />
        <p className="workflow-instruction-copy">{instruction.text}</p>
        <LocalRemoteSetup pr={pr} settings={settings} onSettingsChange={onSettingsChange} onOpenSettings={onOpenSettings} instruction={instruction} />
        <div className="review-manual-context">
          <label htmlFor={fieldId}>Contexto adicional para este PR (opcional)</label>
          <textarea className="resize-none" disabled={busy} id={fieldId} rows={4} value={additionalContext} onChange={(event) => setAdditionalContext(event.target.value)} aria-describedby={`${fieldId}-help`} placeholder="Por WhatsApp, el autor indicó que… / En la revisión anterior observé…" />
          <small id={`${fieldId}-help`}>Se incluye al copiar. No consultamos WhatsApp. La nota permanece al cerrar esta guía, pero se pierde al salir de la cola o recargar.</small>
        </div>
        <div className="instruction-actions">
          <button type="button" className="instruction-context" onClick={() => setContextOpen(true)}><FileJson size={14} /> Ver contexto</button>
          <button type="button" className="instruction-copy" onClick={() => void copyPreparation()} disabled={busy} aria-busy={busy}>{busy ? <RefreshCw size={14} className="spin" /> : <Copy size={14} />}{busy ? 'Preparando…' : 'Copiar para Codex'}</button>
          <button type="button" className={`sync-check${settings.syncRemotesConfirmed ? ' is-checked' : ''}`} onClick={() => onSettingsChange({ ...settings, syncRemotesConfirmed: !settings.syncRemotesConfirmed })} aria-pressed={settings.syncRemotesConfirmed}><span>{settings.syncRemotesConfirmed ? '✓' : ''}</span> Remotos actualizados</button>
          {!settings.syncRemotesConfirmed && <button type="button" className="sync-command" onClick={() => void copySyncCommand()}>Copiar git sync-remotes</button>}
        </div>
        <ReviewCopyFeedback state={copyState} unavailable={unavailable} />
      </m.div>}
    </AnimatePresence>
    <AnimatePresence>{contextOpen && <ReviewContextDialog pr={pr} session={session} instruction={instruction} additionalContext={additionalContext} onClose={() => setContextOpen(false)} />}</AnimatePresence>
  </div>
}
