import { BookOpen, Copy, Download, FileSearch, Pencil } from 'lucide-react'
import { resolveRulesForRepository } from '../lib/rulepacks'
import { projectKey, technologyReference } from '../lib/projectPreparation'
import { openProjectSession } from '../lib/projectSession'
import type { RepoConfig, ReviewRule } from '../types'

export default function PreparationProjectCard({ repo, rules, context, onEdit, onCopy, onDiscover, onDownload }: { repo: RepoConfig; rules: ReviewRule[]; context: string; onEdit: () => void; onCopy: () => void; onDiscover: () => void; onDownload: () => void }) {
  const associated = resolveRulesForRepository(repo, rules)
  return <article className="preparation-project" aria-label={`Proyecto ${repo.repo}`}>
    <header><div><small>{repo.workspace}</small><h2>{repo.repo}</h2></div><span className="preparation-project-state"><BookOpen size={14} />{repo.profile?.summary ? 'Contexto guardado' : 'Contexto por completar'}</span></header>
    <p className="preparation-project-summary">{repo.profile?.summary || 'Todavía no hay contexto general guardado. Escríbelo o pide a Codex un reconocimiento breve del proyecto.'}</p>
    <div className="preparation-project-technologies">{(repo.technologies || []).map((item) => <span key={item.id}>{item.name} <strong>{item.version || 'No determinada'}</strong></span>)}{!repo.technologies?.length && <small>Sin versiones registradas</small>}</div>
    <div className="preparation-project-meta"><span>{repo.profile?.usePersonalPreferences === false ? 'Sin preferencias personales' : 'Con tus preferencias personales'}</span><span>{associated.rules.length} reglas avanzadas activas</span></div>
    {associated.unavailable.length > 0 && <p role="status" className="preparation-notice">Referencias pendientes: {associated.unavailable.join(', ')}</p>}
    <div className="preparation-actions"><button type="button" className="button button-primary" onClick={onEdit}><Pencil size={15} /> Editar ficha</button><button type="button" className="button button-secondary" onClick={onDiscover}><FileSearch size={15} /> Conocer proyecto</button><button type="button" className="button button-secondary" onClick={() => openProjectSession(repo)}><Copy size={15} /> Contexto inicial / Nuevo chat</button><button type="button" className="button button-ghost" onClick={onCopy}><Copy size={15} /> Copiar contexto completo</button><button type="button" className="button button-ghost" onClick={onDownload}><Download size={15} /> Descargar AGENTS.md</button></div>
    <p className="preparation-flow-hint">Conocer proyecto copia una instrucción para Codex. Después, pega su respuesta en Editar ficha → Pegar el resultado de Codex y revísala antes de guardar.</p>
    <details className="preparation-context-preview"><summary>Vista previa del contexto de {projectKey(repo)}</summary><pre>{context}</pre></details>
    <details className="preparation-references"><summary>Referencias de las versiones</summary><p>Confirma la versión real en los manifiestos y lockfiles. Una referencia no demuestra que todo el código sea compatible.</p><ul>{(repo.technologies || []).map((item) => {
      const reference = technologyReference(item)
      return <li key={item.id}><strong>{item.name} {item.version}</strong>{reference ? <a href={reference.url} target="_blank" rel="noreferrer">{reference.label}</a> : <span>Sin fuente guardada; añádela en la ficha o verifícala con Codex.</span>}{item.evidence && <small>Evidencia: {item.evidence}</small>}</li>
    })}</ul></details>
  </article>
}
