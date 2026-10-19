import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { m, useReducedMotion } from 'framer-motion'
import { AlertTriangle, BookOpen, Check, Clipboard, Code2, FileCode2, GitCommitHorizontal, MessageCircle, RefreshCw, X } from 'lucide-react'
import { useModalDialog } from '../hooks/useDismissableLayer'
import { useReviewContextExport } from '../hooks/useReviewContextExport'
import type { GitReviewInstruction } from '../lib/gitWorkflow'
import type { PullRequest, ReviewContext, Session } from '../types'

function ReviewContextPreview({ context, codexPreparation, json }: { context: ReviewContext; codexPreparation: string; json: string }) {
  const commits = context.unavailable.includes('commits') ? '—' : context.commits.length
  const files = context.unavailable.includes('changed files') ? '—' : context.changedFiles.length
  const comments = context.unavailable.includes('comments') ? '—' : context.comments.length
  const diffstat = context.unavailable.includes('changed files') ? 'No disponible' : `+${context.diffstat.additions} / -${context.diffstat.deletions}`
  return <>
    <div className="context-summary" aria-label="Resumen del contexto">
      <span><GitCommitHorizontal size={15} /><strong>{commits}</strong> commits</span>
      <span><FileCode2 size={15} /><strong>{files}</strong> archivos</span>
      <span><MessageCircle size={15} /><strong>{comments}</strong> comentarios</span>
      <span><Code2 size={15} /><strong>{diffstat}</strong> diffstat</span>
      <span><BookOpen size={15} /><strong>{context.rules.length}</strong> reglas</span>
    </div>
    <section className="context-rulepacks" aria-labelledby="context-rulepacks-title">
      <div className="context-section-heading"><BookOpen size={17} /><div><h3 id="context-rulepacks-title">Reglas de revisión aplicables</h3><p>Reglas explícitas de la biblioteca local, ordenadas para este repositorio.</p></div></div>
      {context.rules.length ? context.rules.map((rule) => <details className="context-rulepack" key={rule.reference}><summary><strong>{rule.name}</strong><span>{rule.category}{rule.version ? ` · ${rule.version}` : ''}</span></summary><p>{rule.description}</p><pre>{rule.content}</pre></details>) : <p className="context-no-rulepacks">Sin reglas configuradas para este repositorio.</p>}
    </section>
    <details className="context-preview" open>
      <summary>Vista previa de la guía para Codex</summary>
      <pre>{codexPreparation}</pre>
    </details>
    <details className="context-json-preview">
      <summary>Ver JSON estructurado</summary>
      <pre>{json}</pre>
    </details>
  </>
}

function ReviewContextWarning({ unavailable }: { unavailable: string[] }) {
  if (!unavailable.length) return null
  return <div className="context-warning" role="status"><AlertTriangle size={16} /><span>No disponible: {unavailable.join(', ')}. {unavailable.includes('comments') ? 'Actualiza el contexto para recuperar las conversaciones antes de copiar la guía para Codex.' : 'Las limitaciones se incluyen en el texto copiado.'}</span></div>
}

export default function ReviewContextDialog({ pr, session, instruction, additionalContext, onClose }: { pr: PullRequest; session: Session; instruction: GitReviewInstruction; additionalContext: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const close = useCallback(onClose, [onClose])
  useModalDialog(true, dialogRef, close)
  const [includeProject, setIncludeProject] = useState(false)
  const { query, context, markdown, json, rulesMarkdown, codexPreparation, canCopy, canCopyGuide, copying, copyError, copy } = useReviewContextExport(pr, session, instruction, additionalContext, includeProject ? 'full' : 'compact')

  return createPortal((
    <div className="dialog-backdrop review-context-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <m.section
        ref={dialogRef}
        className="settings-dialog review-context-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-context-title"
        tabIndex={-1}
        initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
        transition={{ duration: reduceMotion ? 0.08 : 0.2 }}
      >
        <header className="overlay-heading settings-heading review-context-heading">
          <div><span className="section-kicker">Preparación para revisión</span><h2 id="review-context-title">Contexto del PR #{pr.id}</h2><p>{pr.title}</p></div>
          <button type="button" className="icon-button" aria-label="Cerrar contexto de revisión" onClick={onClose}><X size={20} /></button>
        </header>
        <div className="review-context-body">
          {query.isLoading && <div className="context-loading" role="status"><RefreshCw size={20} className="spin" /><strong>Construyendo contexto</strong><span>Cargando commits, archivos, comentarios y actividad de este PR…</span></div>}
          {query.isError && <div className="context-error" role="alert"><AlertTriangle size={18} /><span><strong>No pudimos cargar el contexto detallado</strong><small>Puedes reintentar sin afectar la cola.</small></span><button type="button" className="button button-secondary" onClick={() => void query.refetch()}><RefreshCw size={15} /> Reintentar</button></div>}
          {context && <>
            <button type="button" className="button button-secondary" disabled={query.isFetching} aria-busy={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> Actualizar contexto</button>
            <ReviewContextWarning unavailable={context.unavailable} />
            <label className="preparation-check context-guide-mode"><input type="checkbox" checked={includeProject} disabled={copying} onChange={(event) => setIncludeProject(event.target.checked)} /> Incluir contexto completo del proyecto en la guía</label>
            <p className="review-context-hint">Por defecto se copian solo el PR y sus conversaciones. Activa esta opción para una revisión autocontenida; la ficha y las reglas volverán a incluirse.</p>
            {copyError && <div className="context-error" role="alert">{copyError}</div>}
            <ReviewContextPreview context={context} codexPreparation={codexPreparation} json={json} />
          </>}
        </div>
        <footer className="settings-footer review-context-footer">
          <button type="button" className="button button-secondary" onClick={() => void copy(rulesMarkdown, 'Reglas')} disabled={!canCopy}><BookOpen size={16} /> Copiar reglas</button>
          <button type="button" className="button button-primary" onClick={() => void copy(codexPreparation, 'Guía para Codex')} disabled={!canCopyGuide} aria-busy={copying}><Code2 size={16} /> Copiar para Codex</button>
          <button type="button" className="button button-secondary" onClick={() => void copy(json, 'JSON')} disabled={!canCopy}><Code2 size={16} /> Copiar JSON</button>
          <button type="button" className="button button-secondary" onClick={() => void copy(markdown, 'Contexto Markdown')} disabled={!canCopy}><Clipboard size={16} /> Copiar contexto</button>
          <button type="button" className="button button-ghost" onClick={onClose}><Check size={16} /> Cerrar</button>
        </footer>
      </m.section>
    </div>
  ), document.body)
}
