import { useMemo, useState } from 'react'
import {
  BookOpen,
  Check,
  ChevronDown,
  Clipboard,
  ExternalLink,
  GitBranch,
  GitFork,
  GitPullRequest,
  Link2,
  PackageOpen,
  Search,
  ShieldOff,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { toast } from 'sonner'
import Avatar from './Avatar'
import { getIgnoreRules, saveIgnoreRules } from '../lib/storage'
import type { DeveloperRemote, GitWorkflowSettings, PullRequest, RepoConfig } from '../types'

type SetupTab = 'repositories' | 'authors'

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

export default function AuthorsView({ prs, repos, settings, onChange }: { prs: PullRequest[]; repos: RepoConfig[]; settings: GitWorkflowSettings; onChange: (settings: GitWorkflowSettings) => void }) {
  const [tab, setTab] = useState<SetupTab>('repositories')
  const [search, setSearch] = useState('')
  const [showIgnored, setShowIgnored] = useState(false)
  const [ignoredRevision, setIgnoredRevision] = useState(0)
  const ignoreRules = getIgnoreRules()
  const ignoredAuthors = useMemo(() => new Set(ignoreRules.authors.map(normalize)), [ignoredRevision])

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
    </div>
    <SyncGuide repos={repos} />

    {tab === 'repositories' ? <div className="setup-repository-list">
      {repoItems.length === 0 ? <div className="empty-state setup-empty"><GitFork size={25} /><h2>Aún no hay repositorios configurados</h2><p>Añádelos desde Configuración para generar sus comandos locales.</p></div> : repoItems.map(({ repo, prs: repoPrs, authors, targetRemote }) => <details className="setup-repository-card" key={repoKey(repo)}>
        <summary className="setup-repository-summary"><span className="setup-repository-icon"><GitFork size={17} /></span><span className="setup-repository-title"><strong>{repo.repo}</strong><small>{repo.workspace} · {authors.length} autores detectados</small></span><span className="setup-repository-meta"><span>{repoPrs.length} PR{repoPrs.length === 1 ? '' : 's'}</span><ChevronDown size={17} /></span></summary>
        <div className="setup-repository-body">
          <div className="setup-route-fields"><label>Remoto destino<input value={targetRemote} onChange={(event) => updateTarget(repo, event.target.value)} onBlur={(event) => updateTarget(repo, event.target.value)} placeholder="origin" /></label><div className="setup-target-note"><Link2 size={14} /> Este alias se usa sólo dentro de este clon.</div></div>
          <div className="setup-command-block"><span className="setup-block-label">Clonar y preparar</span><CommandRow command={`git clone git@bitbucket.org:${repoKey(repo)}.git`} label="clonar" /><CommandRow command={`cd ${repo.repo}`} label="entrar" /></div>
          <div className="setup-author-list"><div className="setup-block-heading"><span><UsersRound size={15} /> Remotos de autores</span><small>{authors.length ? 'Uno por autor, sin duplicados' : 'No detectados o ignorados'}</small></div>{authors.map((pr) => { const name = authorName(pr); const configuredRemote = findDeveloperRemote(pr, settings.developerRemotes); const remote = configuredRemote || suggestedRemote(name); const collision = remote && remote === targetRemote; return <div className="setup-author-row" key={authorKey(pr)}><Avatar name={name} size="small" /><span className="setup-author-name"><strong>{name}</strong><small className={configuredRemote ? 'setup-alias-status is-configured' : 'setup-alias-status'}>{configuredRemote ? `Guardado como ${remote}` : `Sugerencia: ${remote} · aún no guardado`}</small></span><span className="setup-author-command">{!collision ? <><CommandRow command={`git remote add ${remote} ${sshUrl(sourceUrl(pr))}`} label="agregar" /><CommandRow command={`git fetch ${remote}`} label="actualizar" /></> : <span className="setup-command-missing">El alias {remote} coincide con {targetRemote}; elige otro alias en Autores.</span>}</span><button type="button" className="button button-ghost setup-ignore-author" onClick={() => toggleIgnored(name)}><ShieldOff size={13} /> Ignorar autor</button></div> })}</div>
        </div>
      </details>)}
    </div> : <div className="setup-authors-panel">
      <div className="setup-authors-toolbar"><label className="setup-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar autor..." /></label><button type="button" className={`button button-secondary ${showIgnored ? 'is-active' : ''}`} onClick={() => setShowIgnored((value) => !value)}><ShieldOff size={15} /> {showIgnored ? 'Ocultar ignorados' : 'Ver ignorados'}</button></div>
      <div className="setup-author-table" role="table"><div className="setup-table-head" role="row"><span>Autor</span><span>Actividad</span><span>Repositorios</span><span>Remoto local</span><span>Acciones</span></div>{filteredAuthors.map(({ sample, prs: authorPrs }) => { const name = authorName(sample); const remote = findDeveloperRemote(sample, settings.developerRemotes); const authorRepos = [...new Set(authorPrs.map(sourceRepository))]; return <div className="setup-global-author" role="row" key={authorKey(sample)}><div className="setup-global-identity"><Avatar name={name} size="small" /><span><strong>{name}</strong><small>{authorRepos.length} repositorio{authorRepos.length === 1 ? '' : 's'} asociado{authorRepos.length === 1 ? '' : 's'}</small></span></div><div className="setup-activity"><GitPullRequest size={14} /><strong>{authorPrs.length}</strong><small>PR asociados</small></div><div className="setup-repo-links">{authorRepos.map((repository) => <a href={`https://bitbucket.org/${repository}`} target="_blank" rel="noreferrer" key={repository}>{repository.split('/')[1] || repository}<ExternalLink size={12} /></a>)}</div><label className="setup-remote-cell"><span>Alias local</span><input value={remote} onChange={(event) => updateAuthor(sample, event.target.value)} onBlur={(event) => { updateAuthor(sample, event.target.value); toast.success(`Remoto local “${event.target.value || suggestedRemote(name)}” guardado`) }} placeholder={suggestedRemote(name)} /><small>{remote ? 'Configurado y disponible para generar comandos' : `Sugerencia de la app: ${suggestedRemote(name)} · aún no guardado`}</small></label><small className="setup-remote-hint">Se usará en los comandos de la pestaña Repositorios</small><div className="setup-global-actions"><a className="button button-ghost" href={sourceUrl(sample)} target="_blank" rel="noreferrer">Ver repositorio <ExternalLink size={13} /></a><button type="button" className="button button-ghost" onClick={() => toggleIgnored(name)}>{ignoredAuthors.has(normalize(name)) ? <><Check size={14} /> Activar autor</> : <><ShieldOff size={14} /> Ignorar autor</>}</button></div></div>})}</div>
      {filteredAuthors.length === 0 && <div className="empty-state setup-empty"><UserRound size={25} /><h2>No hay autores para mostrar</h2><p>Prueba con otra búsqueda o vuelve a activar los autores ignorados.</p></div>}
    </div>}
  </section>
}
