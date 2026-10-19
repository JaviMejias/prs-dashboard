import type { PersonalReviewPreferences, ProjectProfile, RepoConfig, RepositoryTechnology } from '../types'

export const MAX_PREPARATION_FILE_BYTES = 2_000_000
export const projectKey = (repo: Pick<RepoConfig, 'workspace' | 'repo'>) => `${repo.workspace}/${repo.repo}`.toLowerCase()
export const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const text = (value: unknown, max = 30_000): value is string => typeof value === 'string' && value.length <= max
const list = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 500 && value.every((item) => text(item, 300))
export const repositorySlug = (value: string) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}$/.test(value)
export const emptyProjectProfile = (): ProjectProfile => ({ summary: '', architecture: '', reviewGuidelines: '', evidence: '', unknowns: '', usePersonalPreferences: true, useLegacyRules: true })
export const defaultPersonalPreferences: PersonalReviewPreferences = { instructions: 'Usar indentación de 2 espacios.\nEscribir identificadores y código en inglés; el texto que ve el usuario, en español.\nNo agregar comentarios al código.\nPriorizar claridad, buenas prácticas y cambios acotados; respetar las convenciones existentes del proyecto.' }

export function safeDocumentationUrl(value?: string) {
  if (!value || value.length > 2048) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch { return null }
}

export function isProjectProfile(value: unknown): value is ProjectProfile {
  return isRecord(value) && ['summary', 'architecture', 'reviewGuidelines', 'evidence', 'unknowns'].every((key) => text(value[key]))
    && typeof value.usePersonalPreferences === 'boolean'
    && typeof value.useLegacyRules === 'boolean'
    && (value.updatedAt === undefined || (text(value.updatedAt, 40) && Number.isFinite(Date.parse(value.updatedAt))))
}

export const isPersonalPreferences = (value: unknown): value is PersonalReviewPreferences => isRecord(value) && text(value.instructions)
export const isRepositoryTechnology = (value: unknown): value is RepositoryTechnology => isRecord(value)
  && text(value.id, 300) && Boolean(value.id.trim()) && text(value.name, 200) && Boolean(value.name.trim())
  && text(value.version, 100) && ['language', 'framework', 'library'].includes(String(value.kind))
  && (value.evidence === undefined || text(value.evidence, 2000))
  && (value.documentationUrl === undefined || (typeof value.documentationUrl === 'string' && Boolean(safeDocumentationUrl(value.documentationUrl))))

export function isPreparationRepository(value: unknown): value is RepoConfig {
  return isRecord(value) && typeof value.workspace === 'string' && repositorySlug(value.workspace)
    && typeof value.repo === 'string' && repositorySlug(value.repo)
    && (value.technologies === undefined || (Array.isArray(value.technologies) && value.technologies.length <= 100 && value.technologies.every(isRepositoryTechnology)))
    && (value.ruleRefs === undefined || list(value.ruleRefs)) && (value.rulepackRefs === undefined || list(value.rulepackRefs))
    && (value.profile === undefined || isProjectProfile(value.profile))
}

export function technologyReference(technology: RepositoryTechnology) {
  const explicit = safeDocumentationUrl(technology.documentationUrl)
  if (explicit) return { url: explicit, label: 'Referencia guardada' }
  const name = technology.name.trim().toLowerCase()
  if (name === 'rails' && technology.version.trim() === '5.1.7') return { url: 'https://api.rubyonrails.org/v5.1.7/', label: 'API oficial · Rails 5.1.7' }
  if (name === 'ruby' && /^2\.4(?:\.|$)/.test(technology.version.trim())) return { url: 'https://docs.ruby-lang.org/en/2.4.0/', label: 'Ruby 2.4 · documentación de la serie, no del parche' }
  return null
}

export function buildProjectDiscoveryPrompt(repo: RepoConfig) {
  const template = {
    schemaVersion: 1, repository: projectKey(repo),
    profile: { summary: '', architecture: '', reviewGuidelines: '', evidence: '', unknowns: '' },
    technologies: [{ name: 'Tecnología detectada', version: 'Versión exacta o No determinada', kind: 'language', evidence: 'archivo relativo:línea', documentationUrl: 'https://documentacion-oficial-de-la-version' }],
  }
  return [
    `Quiero conocer el proyecto ${projectKey(repo)} para preparar revisiones de PR.`,
    'Haz un reconocimiento general, no una auditoría exhaustiva ni una revisión archivo por archivo. No modifiques archivos, no actualices dependencias ni ejecutes cambios en Git.',
    'Consulta primero README, manifiestos y lockfiles, configuración y puntos de entrada. Describe propósito, tecnologías/versiones, arquitectura principal, pruebas disponibles y características como SaaS, multitenancy o PWA solo si hay evidencia.',
    'Determina las versiones desde los archivos reales (.ruby-version, Gemfile.lock, package.json y equivalentes). Si contradicen la configuración anterior, informa el conflicto, no lo resuelvas por suposición.',
    `Configuración anterior, que debes verificar: ${JSON.stringify(repo.technologies || [])}`,
    'Incluye evidencia con rutas relativas. Separa los hechos confirmados de las inferencias y dudas en unknowns. No copies secretos, credenciales, datos personales ni rutas absolutas de este PC.',
    'Para compatibilidad, consulta fuentes oficiales de la versión detectada si tienes acceso. No uses documentación moderna para justificar APIs de una versión antigua. Si no puedes verificar una fuente, indícalo; omite documentationUrl si no hay una URL HTTPS oficial comprobada.',
    'Las reglas del proyecto deben reflejar evidencia del repositorio, no preferencias inventadas. Distingue restricciones técnicas de gustos de estilo. Marca como No determinada cualquier versión desconocida.',
    'Devuelve únicamente un objeto JSON con esta estructura (kind: language, framework o library). Usa textos breves y claros, no inventes funcionalidades:',
    JSON.stringify(template, null, 2),
  ].join('\n\n')
}

export function parseProjectDiscovery(input: string, repo: RepoConfig): { profile: ProjectProfile; technologies: RepositoryTechnology[] } {
  if (input.length > MAX_PREPARATION_FILE_BYTES) throw new Error('El resultado supera el límite de 2 MB.')
  const clean = input.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  let value: unknown
  try { value = JSON.parse(clean) } catch { throw new Error('Pega el JSON completo que devolvió Codex, sin texto adicional.') }
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.repository !== 'string' || value.repository.toLowerCase() !== projectKey(repo)) throw new Error('El resultado no corresponde a este repositorio o usa un formato desconocido.')
  if (!isRecord(value.profile) || !Array.isArray(value.technologies) || value.technologies.length > 100) throw new Error('Faltan la ficha o las tecnologías del proyecto.')
  const profile = { ...value.profile, usePersonalPreferences: repo.profile?.usePersonalPreferences ?? true, useLegacyRules: repo.profile?.useLegacyRules ?? true }
  if (!isProjectProfile(profile)) throw new Error('La ficha debe incluir contexto, arquitectura, criterios, evidencia y dudas como texto.')
  const technologies = value.technologies.map((item, index) => {
    if (!isRecord(item)) throw new Error(`La tecnología ${index + 1} no es válida.`)
    const technology = { ...item, id: `discovery-${index}` }
    if (!isRepositoryTechnology(technology)) throw new Error(`Revisa nombre, versión, tipo y referencia HTTPS de la tecnología ${index + 1}.`)
    return { id: technology.id, name: technology.name, version: technology.version, kind: technology.kind, evidence: technology.evidence, documentationUrl: technology.documentationUrl }
  })
  return { profile: { summary: profile.summary, architecture: profile.architecture, reviewGuidelines: profile.reviewGuidelines, evidence: profile.evidence, unknowns: profile.unknowns, usePersonalPreferences: profile.usePersonalPreferences, useLegacyRules: profile.useLegacyRules }, technologies }
}

export function buildProjectProfileMarkdown(repo: RepoConfig, preferences: PersonalReviewPreferences = defaultPersonalPreferences) {
  const profile = repo.profile
  const technologies = (repo.technologies || []).map((technology) => {
    const reference = technologyReference(technology)
    return `- ${technology.name} ${technology.version}${technology.evidence ? ` · Evidencia: ${technology.evidence}` : ''}${reference ? ` · ${reference.label}: ${reference.url}` : ''}`
  })
  return [
    `## Ficha del proyecto: ${projectKey(repo)}`, '',
    '### Contexto general', '', profile?.summary || 'No documentado. No inferir el tipo de aplicación.', '',
    '### Arquitectura y características confirmadas', '', profile?.architecture || 'No documentadas.', '',
    '### Tecnologías y compatibilidad', '', ...(technologies.length ? technologies : ['No configuradas. Verificar los manifiestos y lockfiles.']), '',
    'Verifica estas versiones en el checkout que estás revisando. No introduzcas sintaxis ni APIs de versiones posteriores. Si hay discrepancias, indícalas y no modernices el proyecto por iniciativa propia.', '',
    '### Criterios de revisión del proyecto', '', profile?.reviewGuidelines || 'Priorizar bugs, regresiones, compatibilidad y problemas funcionales del diff. No hacer una auditoría global por cada PR.', '',
    '### Evidencia y asuntos por confirmar', '', profile?.evidence || 'Sin evidencia local documentada.', '', profile?.unknowns || 'No se registraron dudas; esto no equivale a verificación completa.', '',
    `### Preferencias personales${profile?.usePersonalPreferences === false ? ' (no aplicadas en este proyecto)' : ''}`, '',
    profile?.usePersonalPreferences === false ? 'No aplicar las preferencias personales a esta revisión.' : preferences.instructions || 'Sin preferencias personales adicionales.', '',
    'Prioridad: requisitos y convenciones verificadas del proyecto antes que preferencias personales. Señala los conflictos explícitamente. No conviertas preferencias cosméticas en bugs funcionales ni cambies el alcance de la revisión.',
  ].join('\n')
}
