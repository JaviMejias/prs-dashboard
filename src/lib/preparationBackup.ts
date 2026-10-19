import { getAvailableRules, resolveRulesForRepository, ruleReference, validateRuleMetadata } from './rulepacks'
import { isPersonalPreferences, isPreparationRepository, isRecord, MAX_PREPARATION_FILE_BYTES, projectKey } from './projectPreparation'
import type { PreparationData, RepoConfig, ReviewRule } from '../types'

export type PreparationBackup = { application: 'pr-control-room'; schemaVersion: 2; exportedAt: string; repositories: RepoConfig[]; rules: ReviewRule[]; personalPreferences: PreparationData['personalPreferences'] }
export type RestorePolicy = 'keep' | 'incoming'

function portableRepository(repo: RepoConfig): RepoConfig {
  return {
    workspace: repo.workspace, repo: repo.repo,
    ...(repo.profile ? { profile: { summary: repo.profile.summary, architecture: repo.profile.architecture, reviewGuidelines: repo.profile.reviewGuidelines, evidence: repo.profile.evidence, unknowns: repo.profile.unknowns, usePersonalPreferences: repo.profile.usePersonalPreferences, useLegacyRules: repo.profile.useLegacyRules, updatedAt: repo.profile.updatedAt } } : {}),
    ...(repo.technologies ? { technologies: repo.technologies.map((item) => ({ id: item.id, name: item.name, version: item.version, kind: item.kind, evidence: item.evidence, documentationUrl: item.documentationUrl })) } : {}),
    ...(repo.ruleRefs ? { ruleRefs: [...repo.ruleRefs] } : {}), ...(repo.rulepackRefs ? { rulepackRefs: [...repo.rulepackRefs] } : {}),
  }
}

function portableRule(rule: ReviewRule): ReviewRule {
  return { id: rule.id, name: rule.name, category: rule.category, description: rule.description, version: rule.version, technology: rule.technology, content: rule.content, source: rule.source, rulepackId: rule.rulepackId }
}

export function createPreparationBackup(data: PreparationData): PreparationBackup {
  return { application: 'pr-control-room', schemaVersion: 2, exportedAt: new Date().toISOString(), repositories: data.repositories.map(portableRepository), rules: getAvailableRules(data.customRules).map(portableRule), personalPreferences: { instructions: data.personalPreferences.instructions } }
}

function validRule(value: unknown): value is ReviewRule {
  return isRecord(value) && validateRuleMetadata(value).length === 0 && typeof value.id === 'string' && value.id.length <= 300
    && typeof value.content === 'string' && value.content.length <= 200_000
}

export function parsePreparationBackup(text: string): PreparationBackup {
  if (new TextEncoder().encode(text).length > MAX_PREPARATION_FILE_BYTES) throw new Error('El respaldo supera el límite de 2 MB.')
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('El archivo no contiene JSON válido. Selecciona un respaldo descargado desde Preparar.') }
  if (!isRecord(value) || value.application !== 'pr-control-room' || value.schemaVersion !== 2) throw new Error('Este archivo no es un respaldo completo compatible. Las bibliotecas antiguas se importan desde Reglas avanzadas.')
  if (typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))) throw new Error('El respaldo no tiene una fecha válida.')
  if (!Array.isArray(value.repositories) || value.repositories.length > 200 || !value.repositories.every(isPreparationRepository)) throw new Error('Hay proyectos, versiones o fichas inválidos en el respaldo.')
  if (!Array.isArray(value.rules) || value.rules.length > 500 || !value.rules.every(validRule)) throw new Error('La biblioteca del respaldo contiene reglas inválidas.')
  if (!isPersonalPreferences(value.personalPreferences)) throw new Error('Las preferencias personales del respaldo no son válidas.')
  if (new Set(value.repositories.map(projectKey)).size !== value.repositories.length) throw new Error('El respaldo contiene proyectos duplicados.')
  if (new Set(value.rules.map((rule) => ruleReference(rule.id, rule.version))).size !== value.rules.length) throw new Error('El respaldo contiene reglas duplicadas.')
  return { application: 'pr-control-room', schemaVersion: 2, exportedAt: value.exportedAt, repositories: value.repositories.map(portableRepository), rules: value.rules.map(portableRule), personalPreferences: { instructions: value.personalPreferences.instructions } }
}

export function planPreparationRestore(current: PreparationData, backup: PreparationBackup, policy: RestorePolicy) {
  const existing = new Map(current.repositories.map((repo) => [projectKey(repo), repo]))
  const added = backup.repositories.filter((repo) => !existing.has(projectKey(repo)))
  const conflicts = backup.repositories.filter((repo) => existing.has(projectKey(repo)) && JSON.stringify(portableRepository(existing.get(projectKey(repo))!)) !== JSON.stringify(repo))
  const repositories = new Map(current.repositories.map((repo) => [projectKey(repo), repo]))
  backup.repositories.forEach((repo) => { if (!repositories.has(projectKey(repo)) || policy === 'incoming') repositories.set(projectKey(repo), repo) })
  const localRules = new Map(current.customRules.map((rule) => [ruleReference(rule.id, rule.version), rule]))
  const catalog = new Map(getAvailableRules(current.customRules).map((rule) => [ruleReference(rule.id, rule.version), rule]))
  const ruleConflicts = backup.rules.filter((rule) => {
    const existingRule = catalog.get(ruleReference(rule.id, rule.version))
    return existingRule && JSON.stringify({ ...portableRule(existingRule), source: 'local' }) !== JSON.stringify({ ...portableRule(rule), source: 'local' })
  })
  backup.rules.forEach((rule) => {
    const reference = ruleReference(rule.id, rule.version)
    if (!catalog.has(reference) || policy === 'incoming') localRules.set(reference, { ...rule, source: 'local' })
  })
  const data: PreparationData = {
    repositories: [...repositories.values()], customRules: [...localRules.values()],
    personalPreferences: policy === 'incoming' ? backup.personalPreferences : current.personalPreferences,
  }
  const unresolved = data.repositories.flatMap((repo) => resolveRulesForRepository(repo, data.customRules).unavailable.map((reference) => `${projectKey(repo)}: ${reference}`))
  let validationError = ''
  try { parsePreparationBackup(JSON.stringify(createPreparationBackup(data))) }
  catch (reason) { validationError = reason instanceof Error ? reason.message : 'La configuración combinada no admite un respaldo portable.' }
  return { data, added, conflicts, ruleConflicts, unresolved, validationError, preferencesDiffer: current.personalPreferences.instructions !== backup.personalPreferences.instructions }
}
