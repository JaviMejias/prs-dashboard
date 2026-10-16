import officialMetadata from '../../rulepacks/kontroller-official/rulepack.json'
import agentsSource from '../../rulepacks/kontroller-official/sources/agents.md?raw'
import qaSource from '../../rulepacks/kontroller-official/sources/kontroller-test-qa.md?raw'
import conventionsSource from '../../rulepacks/kontroller-official/sources/kontroller-conventions.md?raw'
import reviewSource from '../../rulepacks/kontroller-official/sources/pull-request-review.md?raw'
import legacyJavaScriptSource from '../../rulepacks/kontroller-official/sources/legacy-javascript.md?raw'
import codeStyleSource from '../../rulepacks/kontroller-official/sources/javier-code-style.md?raw'
import railsSource from '../../rulepacks/kontroller-official/sources/ruby-rails-development.md?raw'
import type { AppliedReviewRule, AppliedRulepack, RepoConfig, ReviewRule, Rulepack } from '../types'

type BundledRulepack = Rulepack & { contents: Record<string, string> }

const officialReference = `${officialMetadata.id}@${officialMetadata.version}`
const officialSources = {
  'sources/agents.md': agentsSource,
  'sources/kontroller-test-qa.md': qaSource,
  'sources/kontroller-conventions.md': conventionsSource,
  'sources/pull-request-review.md': reviewSource,
  'sources/legacy-javascript.md': legacyJavaScriptSource,
  'sources/javier-code-style.md': codeStyleSource,
  'sources/ruby-rails-development.md': railsSource,
}

const bundledRulepack: BundledRulepack = {
  ...officialMetadata,
  source: 'git',
  category: 'project',
  technology: 'Ruby 2.4.3 / Rails 5.1 / jQuery legacy',
  contents: officialSources,
}

type OfficialRuleDefinition = Omit<ReviewRule, 'content' | 'source' | 'rulepackId' | 'sources'> & { sourcePath: keyof typeof officialSources }

const officialRuleDefinitions: OfficialRuleDefinition[] = [
  { id: 'kontroller-review-guidelines', name: 'Guías generales de revisión', category: 'project', technology: 'Kontroller', description: 'Criterios generales de revisión y compatibilidad del proyecto.', sourcePath: 'sources/agents.md' },
  { id: 'kontroller-qa-review-summary', name: 'Resumen de revisión QA', category: 'general', technology: 'Kontroller', description: 'Requisitos de alcance, trazabilidad y resumen de una revisión QA.', sourcePath: 'sources/kontroller-test-qa.md' },
  { id: 'kontroller-engineering-conventions', name: 'Convenciones de ingeniería Kontroller', category: 'project', technology: 'Kontroller', description: 'Convenciones de Pull Requests, Rails, CSS y JavaScript del proyecto.', sourcePath: 'sources/kontroller-conventions.md' },
  { id: 'kontroller-deep-pr-review', name: 'Revisión profunda de Pull Requests', category: 'general', technology: 'Kontroller', description: 'Procedimiento completo para analizar diffs, dependencias, riesgos y regresiones.', sourcePath: 'sources/pull-request-review.md' },
  { id: 'kontroller-legacy-javascript', name: 'JavaScript legacy de Kontroller', category: 'technology', technology: 'jQuery / Turbolinks', description: 'Compatibilidad y convenciones para las superficies JavaScript legacy.', sourcePath: 'sources/legacy-javascript.md' },
  { id: 'kontroller-code-style', name: 'Estilo de código de Javier', category: 'general', description: 'Convenciones de idioma, formato, comentarios y mantenimiento.', sourcePath: 'sources/javier-code-style.md' },
  { id: 'kontroller-ruby-rails-compatibility', name: 'Compatibilidad Ruby y Rails', category: 'framework', technology: 'Ruby 2.4.3 / Rails 5.1', description: 'Compatibilidad, cambios seguros y convenciones para el stack Ruby on Rails.', sourcePath: 'sources/ruby-rails-development.md' },
]

const bundledRules: ReviewRule[] = officialRuleDefinitions.map(({ sourcePath, ...definition }) => ({ ...definition, version: officialMetadata.version, content: officialSources[sourcePath].replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n\s*/, ''), source: 'git', rulepackId: officialReference, sources: [sourcePath] }))
const migrateOfficialReference = (reference: string) => reference === 'kontroller-official@1.0.0' ? officialReference : reference
const migrateRuleReference = (reference: string) => {
  const match = bundledRules.find((rule) => reference === `${rule.id}@1.0.0`)
  return match ? `${match.id}@${match.version}` : reference
}

const referenceFor = (id: string, version: string) => `${id}@${version}`

export function validateRulepackMetadata(rulepack: Partial<Rulepack>, contents: Record<string, string> = {}) {
  const issues: string[] = []
  if (!rulepack.id?.trim()) issues.push('falta id')
  if (!rulepack.name?.trim()) issues.push('falta name')
  if (!rulepack.version?.trim()) issues.push('falta version')
  if (!rulepack.description?.trim()) issues.push('falta description')
  if (!rulepack.reviewRules?.trim()) issues.push('falta reviewRules')
  if (rulepack.reviewRules && !contents[rulepack.reviewRules]) issues.push(`no existe el archivo ${rulepack.reviewRules}`)
  for (const reference of rulepack.references || []) if (!contents[reference]) issues.push(`no existe el archivo ${reference}`)
  return issues
}

export function validateRuleMetadata(rule: Partial<ReviewRule>) {
  const issues: string[] = []
  if (!rule.id?.trim()) issues.push('falta id')
  if (!rule.name?.trim()) issues.push('falta name')
  if (!rule.category) issues.push('falta category')
  if (!rule.content?.trim()) issues.push('falta content')
  return issues
}

export function validateRulepackCatalog(rulepacks: BundledRulepack[] = [bundledRulepack]) {
  const issues: string[] = []
  const seen = new Set<string>()
  rulepacks.forEach((rulepack) => {
    const reference = referenceFor(rulepack.id, rulepack.version)
    if (seen.has(reference)) issues.push(`Rulepack duplicado: ${reference}`)
    seen.add(reference)
    validateRulepackMetadata(rulepack, rulepack.contents).forEach((issue) => issues.push(`${reference}: ${issue}`))
  })
  const seenRules = new Set<string>()
  bundledRules.forEach((rule) => {
    const reference = ruleReference(rule.id, rule.version)
    if (seenRules.has(reference)) issues.push(`Regla duplicada: ${reference}`)
    seenRules.add(reference)
    validateRuleMetadata(rule).forEach((issue) => issues.push(`${reference}: ${issue}`))
  })
  return issues
}

export function getAvailableRulepacks() {
  const { contents: _contents, ...metadata } = bundledRulepack
  return [metadata]
}

export function getRulepack(reference: string) {
  return migrateOfficialReference(reference) === officialReference ? bundledRulepack : undefined
}

export const rulepackReference = referenceFor
export const ruleReference = (id: string, version = '1.0.0') => referenceFor(id, version)

export function updateLocalRule(rules: ReviewRule[], repos: RepoConfig[], rule: ReviewRule, previousReference?: string) {
  const reference = ruleReference(rule.id, rule.version)
  if (rule.source !== 'local' || bundledRules.some((bundled) => bundled.id === rule.id)) throw new Error('No se puede reemplazar una regla oficial.')
  if (rules.some((item) => ruleReference(item.id, item.version) === reference && reference !== previousReference)) throw new Error('Ya existe una regla con esa referencia.')
  if (previousReference && !rules.some((item) => ruleReference(item.id, item.version) === previousReference)) throw new Error('La regla original ya no está disponible.')
  const nextRules = previousReference ? rules.map((item) => ruleReference(item.id, item.version) === previousReference ? rule : item) : [...rules, rule]
  const nextRepos = previousReference ? repos.map((repo) => ({ ...repo, ruleRefs: repo.ruleRefs && [...new Set(repo.ruleRefs.map((item) => item === previousReference ? reference : item))] })) : repos
  return { rules: nextRules, repos: nextRepos }
}

export function getAvailableRules(extraRules: ReviewRule[] = []) {
  return [...bundledRules, ...extraRules].map((rule) => ({ ...rule, reference: ruleReference(rule.id, rule.version) }))
}

export function getRule(reference: string, extraRules: ReviewRule[] = []) {
  return getAvailableRules(extraRules).find((rule) => rule.reference === migrateRuleReference(reference))
}

export function resolveRulesForRepository(repo: RepoConfig, extraRules: ReviewRule[] = []) {
  const catalog = getAvailableRules(extraRules)
  const selected = catalog.filter((rule) => rule.category === 'general').map((rule) => rule.reference)
  selected.push(...(repo.ruleRefs || []))
  for (const packReference of repo.rulepackRefs || []) if (migrateOfficialReference(packReference) === officialReference) bundledRules.forEach((rule) => selected.push(ruleReference(rule.id, rule.version)))
  const rules: AppliedReviewRule[] = []
  const unavailable: string[] = []
  const seen = new Set<string>()
  selected.forEach((reference) => {
    const rule = getRule(reference, extraRules)
    if (!rule) { unavailable.push(`Regla ${reference}`); return }
    if (seen.has(rule.reference)) return
    seen.add(rule.reference)
    rules.push(rule)
  })
  for (const packReference of repo.rulepackRefs || []) if (migrateOfficialReference(packReference) !== officialReference) unavailable.push(`Rulepack ${packReference}`)
  return { rules, unavailable }
}

export function resolveRulepacksForRepository(repo: RepoConfig, extraRules: ReviewRule[] = []) {
  const rulepacks: AppliedRulepack[] = []
  const unavailable: string[] = []
  for (const reference of repo.rulepackRefs || []) {
    const rulepack = getRulepack(reference)
    if (!rulepack) { unavailable.push(`Rulepack ${reference}`); continue }
    const issues = validateRulepackMetadata(rulepack, rulepack.contents)
    if (issues.length) { unavailable.push(`${reference}: ${issues.join(', ')}`); continue }
    if (rulepacks.some((pack) => pack.id === rulepack.id && pack.version === rulepack.version)) continue
    const { contents: _contents, ...metadata } = rulepack
    rulepacks.push({ ...metadata, reviewRulesContent: rulepack.contents[rulepack.reviewRules], referenceContents: (rulepack.references || []).map((path) => ({ path, content: rulepack.contents[path] })) })
  }
  const resolvedRules = resolveRulesForRepository(repo, extraRules)
  const unavailableSet = new Set(unavailable)
  return { rulepacks, rules: resolvedRules.rules, unavailable: [...unavailable, ...resolvedRules.unavailable.filter((item) => !unavailableSet.has(item))] }
}
