import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  BookOpen,
  Check,
  ChevronDown,
  Clipboard,
  Code2,
  Copy,
  Download,
  ExternalLink,
  GitBranch,
  GitFork,
  GitPullRequest,
  Link2,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  ShieldOff,
  Trash2,
  Upload,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import Avatar from './Avatar'
import { getCustomRules, getIgnoreRules, saveCustomRules, saveIgnoreRules, saveRepos } from '../lib/storage'
import { getAvailableRules, resolveRulesForRepository, validateRuleMetadata } from '../lib/rulepacks'
import { buildRepositoryCodexConfiguration } from '../lib/reviewContext'
import type { DeveloperRemote, GitWorkflowSettings, PullRequest, RepoConfig, ReviewRule } from '../types'

type SetupTab = 'repositories' | 'authors' | 'rules'

const normalize = (value?: string) => value?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim() || ''
const repoKey = (repo: RepoConfig) => `${repo.workspace}/${repo.repo}`
const sshUrl = (url?: string) => {
  if (!url) return ''
  return url.replace(/^https?:\/\/bitbucket\.org\//, 'git@bitbucket.org:').replace(/\/?$/, '.git')
}
const authorName = (pr: PullRequest) => pr.author?.display_name || pr.author?.nickname || 'Autor desconocido'
const authorKey = (pr: PullRequest) => pr.author?.uuid || normalize(authorName(pr))
const sourceRepository = (pr: PullRequest) => pr.source?.repository?.full_name || repoKey(pr.repo)
const sourceUrl = (pr: PullRequest) => pr.source?.repository?.links?.html?.href || `https://bitbucket.org/${sourceRepository(pr)}`
const suggestedRemote = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  const surname = words.length > 2 ? words[words.length - 2] : words[words.length - 1]
  return `${words[0][0]}${surname}`.toLocaleLowerCase()
}

const copyCommand = async (command: string) => {
  await navigator.clipboard?.writeText(command)
  toast.success('Comando copiado')
}

function CommandRow({ command, label }: { command: string; label?: string }) {
  return <div className="setup-command-row">
    {label && <span className="setup-command-label">{label}</span>}
    <code>{command}</code>
    <button type="button" className="icon-button setup-command-copy" aria-label={`Copiar ${command}`} title="Copiar comando" onClick={() => void copyCommand(command)}><Clipboard size={14} /></button>
  </div>
}

function SyncGuide({ repos }: { repos: RepoConfig[] }) {
  const [open, setOpen] = useState(false)
  const first = repos[0]
  const clone = first ? `git clone git@bitbucket.org:${repoKey(first)}.git` : 'git clone git@bitbucket.org:workspace/repositorio.git'
  return <section className="setup-guide">
    <button type="button" className="setup-guide-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span className="setup-guide-title"><BookOpen size={16} /><span><small>PREPARACIÓN LOCAL</small><strong>Cómo preparar tus repositorios QA</strong></span></span>
      <span className="setup-guide-action">{open ? 'Ocultar pasos' : 'Ver pasos'} <ChevronDown size={16} className={open ? 'is-open' : ''} /></span>
    </button>
    {open && <div className="setup-guide-body">
      <p className="setup-guide-intro">Cada repositorio tiene su propio conjunto de remotos. <strong>origin</strong> representa el repositorio destino de ese clon; los aliases de los autores se agregan sólo cuando corresponda.</p>
      <ol className="setup-steps">
        <li><strong>Clona el repositorio destino</strong><CommandRow command={clone} /></li>
        <li><strong>Entra a la carpeta clonada</strong><CommandRow command={`cd ${first?.repo || 'repositorio'}`} /></li>
        <li><strong>Agrega los remotos de autores desde la pestaña Repositorios</strong><span className="setup-step-note">Copia el comando de cada autor que necesites revisar.</span></li>
        <li><strong>Comprueba si existe el comando de sincronización</strong><CommandRow command="git config --global --get alias.sync-remotes" /></li>
        <li><strong>Créalo si no aparece ningún resultado</strong><CommandRow command={'git config --global alias.sync-remotes "!f() { git remote | while read remote; do git fetch \\"$remote\\"; done; }; f"'} /></li>
        <li><strong>Actualiza todos los remotos</strong><CommandRow command="git sync-remotes" /></li>
        <li><strong>Verifica los remotos configurados</strong><CommandRow command="git remote -v" /></li>
      </ol>
    </div>}
  </section>
}

function findDeveloperRemote(pr: PullRequest, mappings: DeveloperRemote[]) {
  const name = normalize(authorName(pr))
  return mappings.find((item) => normalize(item.displayName) === name || (pr.author?.uuid && item.id === pr.author.uuid))?.remote.trim() || ''
}

type RuleDraft = { name: string; category: 'general' | 'technology' | 'framework' | 'project'; version: string; technology: string; description: string; content: string }
const emptyRuleDraft: RuleDraft = { name: '', category: 'general', version: '1.0.0', technology: '', description: '', content: '' }
const validateRuleShape = (rule: ReviewRule) => Boolean(rule.id && rule.name && rule.version && rule.source === 'local' && validateRuleMetadata(rule).length === 0)

function RuleLibraryPanel({ repos, selectedRepoKey, rules, customRules, onSelectRepo, onToggleRule, onSaveRule, onDeleteRule, onImportRules, onExportRules }: { repos: RepoConfig[]; selectedRepoKey: string; rules: ReturnType<typeof getAvailableRules>; customRules: ReviewRule[]; onSelectRepo: (key: string) => void; onToggleRule: (repo: RepoConfig, reference: string) => void; onSaveRule: (rule: ReviewRule, editingId?: string) => void; onDeleteRule: (rule: ReviewRule) => void; onImportRules: (rules: ReviewRule[]) => void; onExportRules: () => void }) {
  const [draft, setDraft] = useState<RuleDraft>(emptyRuleDraft)
  const [editingId, setEditingId] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [deletingRule, setDeletingRule] = useState<ReviewRule | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectedRepo = repos.find((repo) => repoKey(repo) === selectedRepoKey) || repos[0]
  const selectedReferences = new Set(selectedRepo ? resolveRulesForRepository(selectedRepo, customRules).rules.map((rule) => rule.reference) : [])
  const submit = () => {
    if (!draft.name.trim() || !draft.description.trim() || !draft.content.trim()) return toast.error('Completa nombre, descripción y contenido de la regla.')
    const id = editingId || `${draft.name}-${Date.now()}`.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    onSaveRule({ id, name: draft.name.trim(), category: draft.category, version: draft.version.trim() || '1.0.0', technology: draft.technology.trim() || undefined, description: draft.description.trim(), content: draft.content.trim(), source: 'local' }, editingId || undefined)
    setDraft(emptyRuleDraft)
    setEditingId('')
    setEditorOpen(false)
  }
  const edit = (rule: ReviewRule) => { setEditingId(rule.id); setDraft({ name: rule.name, category: rule.category, version: rule.version || '1.0.0', technology: rule.technology || '', description: rule.description, content: rule.content }); setEditorOpen(true) }
  useEffect(() => { if (!editorOpen && !deletingRule) return; const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { setEditorOpen(false); setDeletingRule(null) } }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown) }, [deletingRule, editorOpen])
  const importFile = (file?: File) => { if (!file) return; void file.text().then((text) => { try { const parsed = JSON.parse(text) as { schemaVersion?: number; rules?: ReviewRule[] }; if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.rules)) throw new Error('Formato inválido'); const localRules = parsed.rules.filter((rule) => rule?.source === 'local'); if (localRules.some((rule) => !validateImportedRule(rule))) throw new Error('Hay reglas locales inválidas'); onImportRules(localRules); if (!localRules.length && parsed.rules.some((rule) => rule?.source === 'git')) toast.info('La biblioteca oficial ya está incluida', { description: 'Las reglas versionadas en Git no necesitan importarse.' }) } catch { toast.error('No se pudo importar el archivo', { description: 'Usa un JSON de reglas exportado desde PR Control Room.' }) } }) }
  const validateImportedRule = (rule: ReviewRule) => validateRuleShape(rule)
  return <div className="setup-rules-panel">
    <div className="setup-rules-header"><div><span className="section-kicker">Biblioteca global</span><h2>Reglas reutilizables</h2><p>Las reglas generales se aplican a todos los repositorios; las demás se asignan explícitamente.</p></div><label className="setup-repo-select"><span>Configurar repositorio</span><select value={selectedRepo ? repoKey(selectedRepo) : ''} onChange={(event) => onSelectRepo(event.target.value)} disabled={!repos.length}><option value="">Selecciona un repositorio</option>{repos.map((repo) => <option value={repoKey(repo)} key={repoKey(repo)}>{repoKey(repo)}</option>)}</select></label></div>
    <div className="rule-library-toolbar"><button type="button" className="button button-primary" onClick={() => { setDraft(emptyRuleDraft); setEditingId(''); setEditorOpen(true) }}><Plus size={15} /> Nueva regla</button><button type="button" className="button button-ghost" onClick={onExportRules}><Download size={15} /> Descargar biblioteca</button><button type="button" className="button button-ghost" onClick={() => fileInputRef.current?.click()}><Upload size={15} /> Importar JSON</button><input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => { importFile(event.target.files?.[0]); event.currentTarget.value = '' }} /></div>
    {!selectedRepo && <div className="setup-library-notice"><BookOpen size={15} /> Selecciona un repositorio para asignar reglas. Las reglas generales se aplican siempre.</div>}
    <div className="rule-library-table-head"><span>Regla</span><span>Categoría / versión</span><span>Origen</span><span>Acciones</span></div><div className="setup-rule-library-list">{rules.map((rule) => <div className={`setup-library-rule${selectedReferences.has(rule.reference) ? ' is-selected' : ''}`} key={rule.reference}><label><input type="checkbox" checked={selectedReferences.has(rule.reference)} disabled={!selectedRepo || rule.category === 'general'} onChange={() => selectedRepo && onToggleRule(selectedRepo, rule.reference)} /><span><strong>{rule.name}</strong><small>{rule.description}</small></span></label><span className="rule-library-meta">{rule.category}{rule.technology ? ` · ${rule.technology}` : ''}{rule.version ? ` · ${rule.version}` : ''}</span><span className="rule-library-source">{rule.source === 'git' ? 'Versionada en Git' : 'Local'}</span><details><summary>Ver contenido</summary><pre>{rule.content}</pre></details>{rule.source === 'local' && <div className="setup-library-actions"><button type="button" className="button button-ghost" onClick={() => edit(rule)}><Pencil size={13} /> Editar</button><button type="button" className="button button-ghost button-danger" onClick={() => setDeletingRule(rule)}><Trash2 size={13} /> Eliminar</button></div>}</div>)}</div>
    {editorOpen && createPortal(<div className="rule-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setEditorOpen(false)}><section className="rule-modal" role="dialog" aria-modal="true" aria-labelledby="rule-editor-title"><header><div><span className="section-kicker">Biblioteca local</span><h2 id="rule-editor-title">{editingId ? 'Editar regla' : 'Nueva regla'}</h2></div><button type="button" className="icon-button" aria-label="Cerrar editor" onClick={() => setEditorOpen(false)}><X size={18} /></button></header><div className="rule-editor-grid"><label>Nombre<input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Convenciones de controladores" /></label><label>Versión<input value={draft.version} onChange={(event) => setDraft({ ...draft, version: event.target.value })} placeholder="1.0.0" /></label><label>Categoría<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as RuleDraft['category'] })}><option value="general">General</option><option value="technology">Tecnología</option><option value="framework">Framework</option><option value="project">Proyecto</option></select></label><label>Tecnología (opcional)<input value={draft.technology} onChange={(event) => setDraft({ ...draft, technology: event.target.value })} placeholder="Ruby 2.4.3 / Rails 5.1" /></label><label className="rule-editor-wide">Descripción<input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Qué debe verificar Codex" /></label><label className="rule-editor-wide">Contenido de la regla<textarea className="rule-editor-textarea resize-none" value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder="Describe la instrucción de revisión en Markdown..." rows={7} /></label></div><footer className="rule-editor-actions"><button type="button" className="button button-primary" onClick={submit}>{editingId ? <Pencil size={14} /> : <Plus size={14} />} {editingId ? 'Guardar cambios' : 'Crear regla'}</button><button type="button" className="button button-ghost" onClick={() => setEditorOpen(false)}>Cancelar</button></footer></section></div>, document.body)}
    {deletingRule && createPortal(<div className="rule-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDeletingRule(null)}><section className="rule-modal rule-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-rule-title"><header><div><span className="section-kicker">Eliminar regla</span><h2 id="delete-rule-title">¿Eliminar “{deletingRule.name}”?</h2></div><button type="button" className="icon-button" aria-label="Cerrar confirmación" onClick={() => setDeletingRule(null)}><X size={18} /></button></header><p>También se retirará de los repositorios donde esté asociada. Esta acción no afecta las reglas versionadas en Git.</p><footer className="rule-editor-actions"><button type="button" className="button button-ghost" onClick={() => setDeletingRule(null)}>Cancelar</button><button type="button" className="button button-danger" onClick={() => { onDeleteRule(deletingRule); setDeletingRule(null) }}><Trash2 size={14} /> Eliminar regla</button></footer></section></div>, document.body)}
  </div>
}

export default function AuthorsView({ prs, repos, setRepos, settings, onChange }: { prs: PullRequest[]; repos: RepoConfig[]; setRepos: (repos: RepoConfig[]) => void; settings: GitWorkflowSettings; onChange: (settings: GitWorkflowSettings) => void }) {
  const [tab, setTab] = useState<SetupTab>('repositories')
  const [selectedRepoKey, setSelectedRepoKey] = useState('')
  const [search, setSearch] = useState('')
  const [repoDraft, setRepoDraft] = useState({ workspace: '', repo: '' })
  const [technologyDrafts, setTechnologyDrafts] = useState<Record<string, { name: string; version: string; kind: 'language' | 'framework' | 'library' }>>({})
  const [showIgnored, setShowIgnored] = useState(false)
  const [ignoredRevision, setIgnoredRevision] = useState(0)
  const [customRules, setCustomRules] = useState<ReviewRule[]>(getCustomRules)
  const ignoreRules = getIgnoreRules()
  const ignoredAuthors = useMemo(() => new Set(ignoreRules.authors.map(normalize)), [ignoredRevision])
  const availableRules = getAvailableRules(customRules)

  const repoItems = useMemo(() => repos.map((repo) => {
    const key = repoKey(repo)
    const repoPrs = prs.filter((pr) => sourceRepository(pr) === key || repoKey(pr.repo) === key)
    const authors = Array.from(new Map(repoPrs.map((pr) => [authorKey(pr), pr])).values()).filter((pr) => !ignoredAuthors.has(normalize(authorName(pr))))
    const configured = settings.repositoryRemotes.find((item) => normalize(item.repository) === normalize(key))
    return { repo, prs: repoPrs, authors, targetRemote: configured?.remote.trim() || 'origin' }
  }), [ignoredAuthors, prs, repos, settings.repositoryRemotes])

  const globalAuthors = useMemo(() => {
    const map = new Map<string, { sample: PullRequest; prs: PullRequest[] }>()
    prs.forEach((pr) => {
      const key = authorKey(pr)
      const current = map.get(key)
      if (current) current.prs.push(pr)
      else map.set(key, { sample: pr, prs: [pr] })
    })
    return [...map.values()].sort((a, b) => authorName(a.sample).localeCompare(authorName(b.sample)))
  }, [prs])

  const updateAuthor = (pr: PullRequest, remote: string) => {
    const key = pr.author?.uuid || authorName(pr)
    const existing = settings.developerRemotes.findIndex((item) => item.id === key || normalize(item.displayName) === normalize(authorName(pr)))
    const next = [...settings.developerRemotes]
    const item = { id: key, displayName: authorName(pr), remote: remote.trim() }
    if (existing >= 0) next[existing] = { ...next[existing], ...item }
    else next.push(item)
    onChange({ ...settings, developerRemotes: next })
  }

  const updateTarget = (repo: RepoConfig, remote: string) => {
    const key = repoKey(repo)
    const next = [...settings.repositoryRemotes]
    const index = next.findIndex((item) => normalize(item.repository) === normalize(key))
    const item = { id: index >= 0 ? next[index].id : `repo-${key}`, repository: key, remote: remote.trim() || 'origin' }
    if (index >= 0) next[index] = item
    else next.push(item)
    onChange({ ...settings, repositoryRemotes: next })
  }

  const addRepo = () => {
    const nextRepo = { workspace: repoDraft.workspace.trim(), repo: repoDraft.repo.trim() }
    if (!nextRepo.workspace || !nextRepo.repo) {
      toast.error('Completa el workspace y el repositorio.')
      return
    }
    if (repos.some((item) => repoKey(item).toLocaleLowerCase() === repoKey(nextRepo).toLocaleLowerCase())) {
      toast.error('Ese repositorio ya está agregado.')
      return
    }
    const next = [...repos, nextRepo]
    setRepos(next)
    saveRepos(next)
    setRepoDraft({ workspace: '', repo: '' })
    toast.success(`${nextRepo.repo} agregado`, { description: 'Ya está disponible en Preparar.' })
  }

  const removeRepo = (repo: RepoConfig) => {
    const previous = repos
    const next = repos.filter((item) => repoKey(item) !== repoKey(repo))
    setRepos(next)
    saveRepos(next)
    toast.success(`${repo.repo} retirado`, {
      action: {
        label: 'Deshacer',
        onClick: () => {
          setRepos(previous)
          saveRepos(previous)
        },
      },
    })
  }

  const addTechnology = (repo: RepoConfig) => {
    const key = repoKey(repo)
    const draft = technologyDrafts[key]
    if (!draft?.name.trim() || !draft.version.trim()) return toast.error('Completa tecnología y versión.')
    const technology = { id: `${draft.name}-${draft.version}`.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-'), name: draft.name.trim(), version: draft.version.trim(), kind: draft.kind }
    const next = repos.map((item) => repoKey(item) === key ? { ...item, technologies: [...(item.technologies || []).filter((current) => current.id !== technology.id), technology] } : item)
    setRepos(next)
    saveRepos(next)
    setTechnologyDrafts((current) => ({ ...current, [key]: { name: '', version: '', kind: 'language' } }))
    toast.success(`${technology.name} ${technology.version} guardado`)
  }

  const removeTechnology = (repo: RepoConfig, id: string) => {
    const next = repos.map((item) => repoKey(item) === repoKey(repo) ? { ...item, technologies: (item.technologies || []).filter((technology) => technology.id !== id) } : item)
    setRepos(next)
    saveRepos(next)
  }

  const toggleRule = (repo: RepoConfig, reference: string) => {
    const libraryRule = availableRules.find((rule) => rule.reference === reference)
    if (libraryRule?.category === 'general') return toast('Las reglas generales se aplican a todos los repositorios.')
    const selected = new Set(resolveRulesForRepository(repo, customRules).rules.map((rule) => rule.reference))
    if (selected.has(reference)) selected.delete(reference)
    else selected.add(reference)
    const ruleRefs = availableRules.map((rule) => rule.reference).filter((item) => selected.has(item))
    const next = repos.map((item) => repoKey(item) === repoKey(repo) ? { ...item, ruleRefs, rulepackRefs: [] } : item)
    setRepos(next)
    saveRepos(next)
    toast.success(selected.has(reference) ? 'Regla asociada' : 'Regla retirada', { description: `${repo.repo} · ${reference}` })
  }

  const saveRule = (rule: ReviewRule, editingId?: string) => {
    const duplicate = customRules.some((item) => item.id !== editingId && `${item.id}@${item.version || '1.0.0'}` === `${rule.id}@${rule.version || '1.0.0'}`)
    if (duplicate) return toast.error('Ya existe una regla con esa referencia.')
    const current = editingId ? customRules.map((item) => item.id === editingId ? rule : item) : [...customRules, rule]
    setCustomRules(current)
    saveCustomRules(current)
    toast.success(editingId ? 'Regla actualizada' : 'Regla creada', { description: `${rule.name} · ${rule.version || '1.0.0'}` })
  }

  const deleteRule = (rule: ReviewRule) => {
    const next = customRules.filter((item) => item.id !== rule.id)
    setCustomRules(next)
    saveCustomRules(next)
    const nextRepos = repos.map((repo) => ({ ...repo, ruleRefs: (repo.ruleRefs || []).filter((reference) => reference !== `${rule.id}@${rule.version || '1.0.0'}`) }))
    setRepos(nextRepos)
    saveRepos(nextRepos)
    toast.success('Regla eliminada', { description: 'También se retiró de los repositorios donde estaba asociada.' })
  }

  const exportRules = () => {
    const payload = JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), rules: availableRules }, null, 2)
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'pr-control-room-rules.json'
    anchor.click()
    URL.revokeObjectURL(url)
    toast.success('Biblioteca descargada', { description: `${availableRules.length} reglas incluidas; las versionadas conservan su procedencia Git.` })
  }

  const importRules = (incoming: ReviewRule[]) => {
    const merged = [...customRules]
    incoming.forEach((rule) => {
      const index = merged.findIndex((current) => current.id === rule.id && current.version === rule.version)
      if (index >= 0) merged[index] = rule
      else merged.push(rule)
    })
    setCustomRules(merged)
    saveCustomRules(merged)
    toast.success('Reglas importadas', { description: `${incoming.length} reglas procesadas.` })
  }

  const openRuleConfiguration = (repo: RepoConfig) => {
    setSelectedRepoKey(repoKey(repo))
    setTab('rules')
  }

  const copyRepositoryConfiguration = async (repo: RepoConfig) => {
    const resolved = resolveRulesForRepository(repo, customRules)
    await navigator.clipboard?.writeText(buildRepositoryCodexConfiguration(repo, resolved.rules, resolved.unavailable))
    const rules = resolved.rules
    toast.success('Configuración para Codex copiada', { description: `${repo.repo} · ${rules.length} reglas asociadas` })
  }

  const toggleIgnored = (name: string) => {
    const normalized = normalize(name)
    const nextAuthors = ignoreRules.authors.includes(name)
      ? ignoreRules.authors.filter((item) => item !== name)
      : [...ignoreRules.authors, name]
    saveIgnoreRules({ ...ignoreRules, authors: nextAuthors })
    window.dispatchEvent(new Event('prcr:ignore-rules-changed'))
    setIgnoredRevision((value) => value + 1)
    toast.success(ignoreRules.authors.some((item) => normalize(item) === normalized) ? 'Autor visible nuevamente' : 'Autor ocultado de tu cola')
  }

  const filteredAuthors = globalAuthors.filter(({ sample }) => {
    const matchesSearch = !search || normalize(authorName(sample)).includes(normalize(search))
    const isIgnored = ignoredAuthors.has(normalize(authorName(sample)))
    return matchesSearch && (showIgnored || !isIgnored)
  })

  return <section className="product-view setup-view" aria-labelledby="setup-title">
    <div className="queue-intro setup-heading"><div><span className="section-kicker">Configuración de revisión</span><h1 id="setup-title">Preparar entorno</h1><p>Organiza tus clones locales, remotos y autores para revisar con precisión.</p></div><div className="setup-heading-stat"><GitBranch size={18} /><strong>{repos.length}</strong><span>repositorios</span></div></div>
    <div className="setup-tabs" role="tablist" aria-label="Configuración de entorno">
      <button type="button" role="tab" aria-selected={tab === 'repositories'} className={tab === 'repositories' ? 'is-active' : ''} onClick={() => setTab('repositories')}><PackageOpen size={16} /><span>Repositorios</span><b>{repos.length}</b></button>
      <button type="button" role="tab" aria-selected={tab === 'authors'} className={tab === 'authors' ? 'is-active' : ''} onClick={() => setTab('authors')}><UsersRound size={16} /><span>Autores</span><b>{globalAuthors.length}</b></button>
      <button type="button" role="tab" aria-selected={tab === 'rules'} className={tab === 'rules' ? 'is-active' : ''} onClick={() => setTab('rules')}><BookOpen size={16} /><span>Reglas</span><b>{availableRules.length}</b></button>
    </div>
    <SyncGuide repos={repos} />

    {tab === 'repositories' ? <div className="setup-repository-list">
      <form className="setup-add-repository" noValidate onSubmit={(event) => { event.preventDefault(); addRepo() }}>
        <label><span>Workspace</span><input value={repoDraft.workspace} onChange={(event) => setRepoDraft({ ...repoDraft, workspace: event.target.value })} placeholder="kontroller_test" /></label>
        <label><span>Repositorio</span><input value={repoDraft.repo} onChange={(event) => setRepoDraft({ ...repoDraft, repo: event.target.value })} placeholder="providers_api" /></label>
        <button className="button button-secondary" type="submit"><Plus size={16} /> Agregar repositorio</button>
      </form>
      {repoItems.length === 0 ? <div className="empty-state setup-empty"><GitFork size={25} /><h2>Aún no hay repositorios configurados</h2><p>Agrega un repositorio arriba para generar sus comandos locales y asociar sus rulepacks.</p></div> : repoItems.map(({ repo, prs: repoPrs, authors, targetRemote }) => <details className="setup-repository-card" key={repoKey(repo)}>
        <summary className="setup-repository-summary"><span className="setup-repository-icon"><GitFork size={17} /></span><span className="setup-repository-title"><strong>{repo.repo}</strong><small>{repo.workspace} · {authors.length} autores detectados</small></span><span className="setup-repository-meta"><span>{repoPrs.length} PR{repoPrs.length === 1 ? '' : 's'}</span><ChevronDown size={17} /></span></summary>
        <div className="setup-repository-body">
          <div className="setup-repository-actions"><span className="setup-card-caption">Configuración local de {repo.repo}</span><button type="button" className="button button-ghost button-danger" onClick={() => removeRepo(repo)}><Trash2 size={14} /> Retirar repositorio</button></div>
          <div className="setup-route-fields"><label>Remoto destino<input value={targetRemote} onChange={(event) => updateTarget(repo, event.target.value)} onBlur={(event) => updateTarget(repo, event.target.value)} placeholder="origin" /></label><div className="setup-target-note"><Link2 size={14} /> Este alias se usa sólo dentro de este clon.</div></div>
          <div className="setup-command-block"><span className="setup-block-label">Clonar y preparar</span><CommandRow command={`git clone git@bitbucket.org:${repoKey(repo)}.git`} label="clonar" /><CommandRow command={`cd ${repo.repo}`} label="entrar" /></div>
          <div className="setup-rule-summary"><div className="setup-block-heading"><span><BookOpen size={15} /> Reglas asociadas</span><small>{resolveRulesForRepository(repo, customRules).rules.length} seleccionadas</small></div><div className="setup-associated-rules">{resolveRulesForRepository(repo, customRules).rules.length ? resolveRulesForRepository(repo, customRules).rules.map((rule) => <span key={rule.reference}>{rule.name}</span>) : <small>No hay reglas asociadas todavía.</small>}</div><div className="setup-repository-actions"><button type="button" className="button button-secondary" onClick={() => openRuleConfiguration(repo)}><BookOpen size={14} /> Configurar reglas</button><button type="button" className="button button-ghost" onClick={() => void copyRepositoryConfiguration(repo)}><Copy size={14} /> Copiar configuración para Codex</button></div></div>
          <div className="setup-technology-section"><div className="setup-block-heading"><span><Code2 size={15} /> Tecnologías y versiones</span><small>Contexto explícito del proyecto; no activa reglas automáticamente</small></div><div className="setup-technology-list">{(repo.technologies || []).map((technology) => <span className="setup-technology-chip" key={technology.id}>{technology.name} <strong>{technology.version}</strong><button type="button" onClick={() => removeTechnology(repo, technology.id)} aria-label={`Quitar ${technology.name} ${technology.version}`}><X size={12} /></button></span>)}</div><div className="setup-add-technology"><input aria-label="Tecnología" value={technologyDrafts[repoKey(repo)]?.name || ''} onChange={(event) => setTechnologyDrafts((current) => ({ ...current, [repoKey(repo)]: { ...(current[repoKey(repo)] || { version: '', kind: 'language' }), name: event.target.value } }))} placeholder="Ruby, Rails, React..." /><input aria-label="Versión" value={technologyDrafts[repoKey(repo)]?.version || ''} onChange={(event) => setTechnologyDrafts((current) => ({ ...current, [repoKey(repo)]: { ...(current[repoKey(repo)] || { name: '', kind: 'language' }), version: event.target.value } }))} placeholder="2.4.3, 5.1, 18" /><select aria-label="Tipo de tecnología" value={technologyDrafts[repoKey(repo)]?.kind || 'language'} onChange={(event) => setTechnologyDrafts((current) => ({ ...current, [repoKey(repo)]: { ...(current[repoKey(repo)] || { name: '', version: '' }), kind: event.target.value as 'language' | 'framework' | 'library' } }))}><option value="language">Lenguaje</option><option value="framework">Framework</option><option value="library">Librería</option></select><button type="button" className="button button-secondary" onClick={() => addTechnology(repo)}><Plus size={14} /> Añadir</button></div></div>
          <div className="setup-author-list"><div className="setup-block-heading"><span><UsersRound size={15} /> Remotos de autores</span><small>{authors.length ? 'Uno por autor, sin duplicados' : 'No detectados o ignorados'}</small></div>{authors.map((pr) => { const name = authorName(pr); const configuredRemote = findDeveloperRemote(pr, settings.developerRemotes); const remote = configuredRemote || suggestedRemote(name); const collision = remote && remote === targetRemote; return <div className="setup-author-row" key={authorKey(pr)}><Avatar name={name} size="small" /><span className="setup-author-name"><strong>{name}</strong><small className={configuredRemote ? 'setup-alias-status is-configured' : 'setup-alias-status'}>{configuredRemote ? `Guardado como ${remote}` : `Sugerencia: ${remote} · aún no guardado`}</small></span><span className="setup-author-command">{!collision ? <><CommandRow command={`git remote add ${remote} ${sshUrl(sourceUrl(pr))}`} label="agregar" /><CommandRow command={`git fetch ${remote}`} label="actualizar" /></> : <span className="setup-command-missing">El alias {remote} coincide con {targetRemote}; elige otro alias en Autores.</span>}</span><button type="button" className="button button-ghost setup-ignore-author" onClick={() => toggleIgnored(name)}><ShieldOff size={13} /> Ignorar autor</button></div> })}</div>
        </div>
      </details>)}
    </div> : tab === 'authors' ? <div className="setup-authors-panel">
      <div className="setup-authors-toolbar"><label className="setup-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar autor..." /></label><button type="button" className={`button button-secondary ${showIgnored ? 'is-active' : ''}`} onClick={() => setShowIgnored((value) => !value)}><ShieldOff size={15} /> {showIgnored ? 'Ocultar ignorados' : 'Ver ignorados'}</button></div>
      <div className="setup-author-table" role="table"><div className="setup-table-head" role="row"><span>Autor</span><span>Actividad</span><span>Repositorios</span><span>Remoto local</span><span>Acciones</span></div>{filteredAuthors.map(({ sample, prs: authorPrs }) => { const name = authorName(sample); const remote = findDeveloperRemote(sample, settings.developerRemotes); const authorRepos = [...new Set(authorPrs.map(sourceRepository))]; return <div className="setup-global-author" role="row" key={authorKey(sample)}><div className="setup-global-identity"><Avatar name={name} size="small" /><span><strong>{name}</strong><small>{authorRepos.length} repositorio{authorRepos.length === 1 ? '' : 's'} asociado{authorRepos.length === 1 ? '' : 's'}</small></span></div><div className="setup-activity"><GitPullRequest size={14} /><strong>{authorPrs.length}</strong><small>PR asociados</small></div><div className="setup-repo-links">{authorRepos.map((repository) => <a href={`https://bitbucket.org/${repository}`} target="_blank" rel="noreferrer" key={repository}>{repository.split('/')[1] || repository}<ExternalLink size={12} /></a>)}</div><label className="setup-remote-cell"><span>Alias local</span><input value={remote} onChange={(event) => updateAuthor(sample, event.target.value)} onBlur={(event) => { updateAuthor(sample, event.target.value); toast.success(`Remoto local “${event.target.value || suggestedRemote(name)}” guardado`) }} placeholder={suggestedRemote(name)} /><small>{remote ? 'Configurado y disponible para generar comandos' : `Sugerencia de la app: ${suggestedRemote(name)} · aún no guardado`}</small></label><small className="setup-remote-hint">Se usará en los comandos de la pestaña Repositorios</small><div className="setup-global-actions"><a className="button button-ghost" href={sourceUrl(sample)} target="_blank" rel="noreferrer">Ver repositorio <ExternalLink size={13} /></a><button type="button" className="button button-ghost" onClick={() => toggleIgnored(name)}>{ignoredAuthors.has(normalize(name)) ? <><Check size={14} /> Activar autor</> : <><ShieldOff size={14} /> Ignorar autor</>}</button></div></div>})}</div>
      {filteredAuthors.length === 0 && <div className="empty-state setup-empty"><UserRound size={25} /><h2>No hay autores para mostrar</h2><p>Prueba con otra búsqueda o vuelve a activar los autores ignorados.</p></div>}
    </div> : <RuleLibraryPanel repos={repos} selectedRepoKey={selectedRepoKey} rules={availableRules} customRules={customRules} onSelectRepo={setSelectedRepoKey} onToggleRule={toggleRule} onSaveRule={saveRule} onDeleteRule={deleteRule} onImportRules={importRules} onExportRules={exportRules} />}
  </section>
}
