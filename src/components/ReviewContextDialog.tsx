import { useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, BookOpen, Check, Clipboard, Code2, FileCode2, GitCommitHorizontal, MessageCircle, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { useModalDialog } from '../hooks/useDismissableLayer'
import { getReviewContextDetails } from '../lib/bitbucket'
import { buildApplicableRulesMarkdown, buildCodexPreparation, buildReviewContext, buildReviewContextJson, buildReviewContextMarkdown } from '../lib/reviewContext'
import { resolveRulepacksForRepository } from '../lib/rulepacks'
import { getCustomRules } from '../lib/storage'
import type { PullRequest, Session } from '../types'

export default function ReviewContextDialog({ pr, session, onClose }: { pr: PullRequest; session: Session; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const close = useCallback(onClose, [onClose])
  useModalDialog(true, dialogRef, close)
  const query = useQuery({
    queryKey: ['review-context', pr.repo.workspace, pr.repo.repo, pr.id, pr.updated_on],
    queryFn: () => getReviewContextDetails(pr, session),
    staleTime: 60_000,
  })
  const customRules = useMemo(() => getCustomRules(), [])
  const resolvedRulepacks = useMemo(() => resolveRulepacksForRepository(pr.repo, customRules), [customRules, pr.repo])
  const context = useMemo(() => query.data ? buildReviewContext(pr, session, { ...query.data, unavailable: [...query.data.unavailable, ...resolvedRulepacks.unavailable] }, resolvedRulepacks.rulepacks, resolvedRulepacks.rules) : null, [pr, query.data, resolvedRulepacks, session])
  const markdown = context ? buildReviewContextMarkdown(context) : ''
  const json = context ? buildReviewContextJson(context) : ''
  const rulesMarkdown = context ? buildApplicableRulesMarkdown(context) : ''
  const codexPreparation = context ? buildCodexPreparation(context) : ''

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${label} copiado`, { description: 'Ya puedes pegarlo directamente en Codex.' })
    } catch {
      toast.error('No se pudo copiar el contexto', { description: 'Revisa los permisos del portapapeles del navegador.' })
    }
  }

  return createPortal((
    <div className="dialog-backdrop review-context-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <motion.section
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
            {context.unavailable.length > 0 && <div className="context-warning" role="status"><AlertTriangle size={16} /><span>No disponible: {context.unavailable.join(', ')}. El resto del contexto sí puede copiarse.</span></div>}
            <div className="context-summary" aria-label="Resumen del contexto">
              <span><GitCommitHorizontal size={15} /><strong>{context.commits.length}</strong> commits</span>
              <span><FileCode2 size={15} /><strong>{context.changedFiles.length}</strong> archivos</span>
              <span><MessageCircle size={15} /><strong>{context.comments.length}</strong> comentarios</span>
              <span><Code2 size={15} /><strong>+{context.diffstat.additions} / -{context.diffstat.deletions}</strong> diffstat</span>
              <span><BookOpen size={15} /><strong>{context.rules.length}</strong> reglas</span>
            </div>
            <section className="context-rulepacks" aria-labelledby="context-rulepacks-title">
              <div className="context-section-heading"><BookOpen size={17} /><div><h3 id="context-rulepacks-title">Applicable review rules</h3><p>Reglas explícitas de la biblioteca local, ordenadas para este repositorio.</p></div></div>
              {context.rules.length ? context.rules.map((rule) => <details className="context-rulepack" key={rule.reference} open><summary><strong>{rule.name}</strong><span>{rule.category}{rule.version ? ` · ${rule.version}` : ''}</span></summary><p>{rule.description}</p><pre>{rule.content}</pre></details>) : <p className="context-no-rulepacks">Sin reglas configuradas para este repositorio.</p>}
            </section>
            <details className="context-preview" open>
              <summary>Vista previa Markdown</summary>
              <pre>{markdown}</pre>
            </details>
            <details className="context-json-preview">
              <summary>Ver JSON estructurado</summary>
              <pre>{json}</pre>
            </details>
          </>}
        </div>
        <footer className="settings-footer review-context-footer">
          <button type="button" className="button button-secondary" onClick={() => void copy(rulesMarkdown, 'Reglas')} disabled={!context}><BookOpen size={16} /> Copiar reglas</button>
          <button type="button" className="button button-primary" onClick={() => void copy(codexPreparation, 'Preparación para Codex')} disabled={!context}><Code2 size={16} /> Preparar para Codex</button>
          <button type="button" className="button button-secondary" onClick={() => void copy(json, 'JSON')} disabled={!context}><Code2 size={16} /> Copiar JSON</button>
          <button type="button" className="button button-secondary" onClick={() => void copy(markdown, 'Contexto Markdown')} disabled={!context}><Clipboard size={16} /> Copiar contexto</button>
          <button type="button" className="button button-ghost" onClick={onClose}><Check size={16} /> Cerrar</button>
        </footer>
      </motion.section>
    </div>
  ), document.body)
}
