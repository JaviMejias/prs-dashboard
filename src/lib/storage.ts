import { defaultPersonalPreferences, isPersonalPreferences, isProjectProfile, safeDocumentationUrl } from './projectPreparation'
import type { GitWorkflowSettings, IgnoreRules, Notice, NotificationPreferences, NotificationSnapshot, PersonalReviewPreferences, PreparationData, RepoConfig, RepositoryTechnology, ReviewHistory, ReviewRule, Session, StoredPreparation } from '../types'
const keys = { session: 'prcr:session', repos: 'prcr:repos', notices: 'prcr:notices', snapshot: 'prcr:snapshot', reviewHistory: 'prcr:review-history', notificationPreferences: 'prcr:notification-preferences', ignoreRules: 'prcr:ignore-rules', gitWorkflow: 'prcr:git-workflow', customRules: 'prcr:custom-rules', repositoryLibraryMigration: 'prcr:repository-library-migration' }
const failedWrites = new Set<string>()
const preparationKey = 'prcr:preparation-v1'
const officialKontrollerRulepack = 'kontroller-official@1.0.0'
const legacyKontrollerRulepack = 'kontroller-rails-legacy@1.0.0'
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')
const isTechnology = (value: unknown): value is RepositoryTechnology => isRecord(value)
  && typeof value.id === 'string' && typeof value.name === 'string' && typeof value.version === 'string'
  && ['language', 'framework', 'library'].includes(String(value.kind))
  && (value.evidence === undefined || typeof value.evidence === 'string')
  && (value.documentationUrl === undefined || (typeof value.documentationUrl === 'string' && Boolean(safeDocumentationUrl(value.documentationUrl))))
const isRepo = (value: unknown): value is RepoConfig => isRecord(value)
  && typeof value.workspace === 'string' && typeof value.repo === 'string'
  && (value.technologies === undefined || (Array.isArray(value.technologies) && value.technologies.every(isTechnology)))
  && (value.ruleRefs === undefined || isStringArray(value.ruleRefs))
  && (value.rulepackRefs === undefined || isStringArray(value.rulepackRefs))
  && (value.profile === undefined || isProjectProfile(value.profile))
const isRepoList = (value: unknown): value is RepoConfig[] => Array.isArray(value) && value.every(isRepo)
const isSession = (value: unknown): value is Session => isRecord(value)
  && typeof value.email === 'string' && typeof value.token === 'string' && typeof value.expiresAt === 'number'
  && (value.uuid === undefined || typeof value.uuid === 'string')
  && (value.displayName === undefined || typeof value.displayName === 'string')
const isReviewRule = (value: unknown): value is ReviewRule => isRecord(value)
  && typeof value.id === 'string' && typeof value.name === 'string' && typeof value.description === 'string'
  && typeof value.content === 'string' && ['general', 'technology', 'framework', 'project'].includes(String(value.category))
  && (value.source === 'git' || value.source === 'local')
  && (value.version === undefined || typeof value.version === 'string')
  && (value.technology === undefined || typeof value.technology === 'string')
  && (value.rulepackId === undefined || typeof value.rulepackId === 'string')
  && (value.sources === undefined || isStringArray(value.sources))
const isReviewHistoryEvent = (value: unknown) => isRecord(value) && typeof value.id === 'string'
  && typeof value.date === 'string' && Number.isFinite(Date.parse(value.date))
  && ['comment', 'approval', 'review', 'changes_requested'].includes(String(value.type))
  && (value.commentId === undefined || typeof value.commentId === 'number')
const isReviewHistory = (value: unknown): value is ReviewHistory => isRecord(value) && value.schemaVersion === 1
  && isRecord(value.repositories) && Object.values(value.repositories).every((repository) => isRecord(repository)
    && typeof repository.syncedAt === 'string' && Number.isFinite(Date.parse(repository.syncedAt))
    && (repository.coverage === 'partial' || repository.coverage === 'complete')
    && isRecord(repository.pullRequests) && Object.values(repository.pullRequests).every((pr) => isRecord(pr)
      && typeof pr.id === 'number' && ['OPEN', 'MERGED', 'DECLINED'].includes(String(pr.state))
      && typeof pr.createdAt === 'string' && Number.isFinite(Date.parse(pr.createdAt))
      && typeof pr.updatedOn === 'string' && Number.isFinite(Date.parse(pr.updatedOn))
      && Array.isArray(pr.events) && pr.events.every(isReviewHistoryEvent)))
const isNotificationSnapshot = (value: unknown): value is NotificationSnapshot => isRecord(value)
  && Object.values(value).every((item) => typeof item === 'string' || (isRecord(item)
    && typeof item.updatedOn === 'string' && typeof item.needsReview === 'boolean'))
const isNotificationPreferences = (value: unknown): value is NotificationPreferences => isRecord(value)
  && typeof value.desktop === 'boolean' && typeof value.sound === 'boolean' && typeof value.title === 'boolean'
const isIgnoreRules = (value: unknown): value is IgnoreRules => isRecord(value)
  && isStringArray(value.authors) && isStringArray(value.pullRequests)
const isGitWorkflowSettings = (value: unknown): value is GitWorkflowSettings => isRecord(value)
  && typeof value.syncRemotesConfirmed === 'boolean'
  && Array.isArray(value.developerRemotes) && value.developerRemotes.every((item) => isRecord(item)
    && typeof item.id === 'string' && typeof item.displayName === 'string' && typeof item.remote === 'string')
  && Array.isArray(value.repositoryRemotes) && value.repositoryRemotes.every((item) => isRecord(item)
    && typeof item.id === 'string' && typeof item.repository === 'string' && typeof item.remote === 'string')
export const kontrollerTestTechnologies: RepositoryTechnology[] = [
  { id: 'ruby-2-4-3', name: 'Ruby', version: '2.4.3', kind: 'language' },
  { id: 'rails-5-1-7', name: 'Rails', version: '5.1.7', kind: 'framework' },
  { id: 'turbolinks-5-2-1', name: 'Turbolinks', version: '5.2.1', kind: 'library' },
]
export const kontrollerTestRepositoryDefaults: RepoConfig = { workspace: 'kontroller_test', repo: 'kontroller_test', technologies: kontrollerTestTechnologies, rulepackRefs: [officialKontrollerRulepack] }
export const initialRepos: RepoConfig[] = [kontrollerTestRepositoryDefaults, { workspace: 'kontroller_test', repo: 'providers_api' }]
const uniqueRepos = (repos: RepoConfig[]) => Array.from(new Map(repos.map((repo) => [`${repo.workspace}/${repo.repo}`.toLocaleLowerCase(), repo])).values())
export function getJson<T>(key: string, fallback: T, validate: (value: unknown) => value is T, storage: Storage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage): T {
  if (!storage) return fallback
  try {
    const raw = storage.getItem(key)
    if (!raw) return fallback
    const value: unknown = JSON.parse(raw)
    return validate(value) ? value : fallback
  } catch { return fallback }
}
function isStoredJsonValid(key: string, validate: (value: unknown) => boolean, storage: Storage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage) {
  if (!storage) return false
  try {
    const raw = storage.getItem(key)
    return raw === null || validate(JSON.parse(raw))
  } catch { return false }
}
function saveJson<T>(key: string, value: T, storage: Storage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage) {
  if (!storage) return false
  try {
    storage.setItem(key, JSON.stringify(value))
    failedWrites.delete(key)
    return true
  } catch {
    if (!failedWrites.has(key)) {
      failedWrites.add(key)
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('prcr:storage-write-failed'))
    }
    return false
  }
}
function removeItem(key: string, storage: Storage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage) { try { storage?.removeItem(key) } catch { /* Keep the interface usable when browser storage is unavailable. */ } }
function isActionableNotice(value: unknown): value is Notice {
  if (!value || typeof value !== 'object') return false
  const notice = value as Partial<Notice>
  return (notice.kind === 'new-pr' || notice.kind === 'review-required')
    && (notice.action === 'abrió' || notice.action === 'actualizó')
    && typeof notice.id === 'string'
    && typeof notice.text === 'string'
    && typeof notice.createdAt === 'number'
    && typeof notice.read === 'boolean'
    && typeof notice.actorName === 'string'
    && typeof notice.pullRequestTitle === 'string'
    && typeof notice.repositoryName === 'string'
    && typeof notice.pullRequestId === 'number'
    && (notice.pullRequestKey === undefined || typeof notice.pullRequestKey === 'string')
}
const sessionStorageOrUndefined = () => typeof sessionStorage === 'undefined' ? undefined : sessionStorage
const clearLegacySession = () => removeItem(keys.session)
export const getSession = () => {
  clearLegacySession()
  return getJson<Session | null>(keys.session, null, (value): value is Session | null => value === null || isSession(value), sessionStorageOrUndefined())
}
export const saveSession = (s: Session) => {
  clearLegacySession()
  return saveJson(keys.session, s, sessionStorageOrUndefined())
}
export const clearSession = () => {
  clearLegacySession()
  removeItem(keys.session, sessionStorageOrUndefined())
}
export function migrateKontrollerRepository(repo: RepoConfig): RepoConfig {
  if (repo.workspace.toLocaleLowerCase() !== 'kontroller_test' || repo.repo.toLocaleLowerCase() !== 'kontroller_test') return repo
  const rulepackRefs = (repo.rulepackRefs || []).filter((reference) => reference !== legacyKontrollerRulepack && reference !== officialKontrollerRulepack)
  return {
    ...repo,
    technologies: repo.technologies?.length ? repo.technologies : kontrollerTestTechnologies,
    rulepackRefs: [...rulepackRefs, officialKontrollerRulepack],
  }
}
const getLegacyRepos = () => {
  const validStoredRepos = isStoredJsonValid(keys.repos, isRepoList)
  const repos = uniqueRepos(getJson(keys.repos, initialRepos, isRepoList))
  if (!validStoredRepos || getJson(keys.repositoryLibraryMigration, false, (value): value is boolean => typeof value === 'boolean')) return repos
  const migrated = repos.map(migrateKontrollerRepository)
  saveJson(keys.repos, migrated)
  saveJson(keys.repositoryLibraryMigration, true)
  return migrated
}
const getLegacyRules = () => getJson<ReviewRule[]>(keys.customRules, [], (value): value is ReviewRule[] => Array.isArray(value) && value.every(isReviewRule)).filter((rule) => rule.source === 'local')
const isPreparationData = (value: unknown): value is PreparationData => isRecord(value) && isRepoList(value.repositories)
  && Array.isArray(value.customRules) && value.customRules.every(isReviewRule) && isPersonalPreferences(value.personalPreferences)
const isStoredPreparation = (value: unknown): value is StoredPreparation => isPreparationData(value)
  && 'schemaVersion' in value && value.schemaVersion === 1
  && (!('previous' in value) || value.previous === undefined || isPreparationData(value.previous))

export function getPreparationSettings(): StoredPreparation {
  return getJson<StoredPreparation | null>(preparationKey, null, (value): value is StoredPreparation | null => value === null || isStoredPreparation(value))
    || { schemaVersion: 1, repositories: getLegacyRepos(), customRules: getLegacyRules(), personalPreferences: { ...defaultPersonalPreferences } }
}

export function savePreparationSettings(data: PreparationData, allowUndo = false) {
  if (!isPreparationData(data)) return false
  const previous = allowUndo ? getPreparationSettings() : undefined
  const value: StoredPreparation = {
    schemaVersion: 1, repositories: uniqueRepos(data.repositories), customRules: data.customRules, personalPreferences: data.personalPreferences,
    ...(previous ? { previous: { repositories: previous.repositories, customRules: previous.customRules, personalPreferences: previous.personalPreferences } } : {}),
  }
  if (!saveJson(preparationKey, value)) return false
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('prcr:preparation-changed'))
  return true
}

export const getRepos = () => getPreparationSettings().repositories
export const saveRepos = (repositories: RepoConfig[]) => savePreparationSettings({ ...getPreparationSettings(), repositories })
export const getCustomRules = () => getPreparationSettings().customRules
export const saveCustomRules = (customRules: ReviewRule[]) => savePreparationSettings({ ...getPreparationSettings(), customRules })
export const getPersonalReviewPreferences = () => getPreparationSettings().personalPreferences
export const savePersonalReviewPreferences = (personalPreferences: PersonalReviewPreferences) => savePreparationSettings({ ...getPreparationSettings(), personalPreferences })
export const getNotices = () => getJson<unknown[]>(keys.notices, [], (value): value is unknown[] => Array.isArray(value)).filter(isActionableNotice)
export const saveNotices = (n: Notice[]) => saveJson(keys.notices, n.slice(0, 40))
export const getSnapshot = () => getJson<NotificationSnapshot>(keys.snapshot, {}, isNotificationSnapshot)
export const saveSnapshot = (s: NotificationSnapshot) => saveJson(keys.snapshot, s)
export const emptyReviewHistory = (): ReviewHistory => ({ schemaVersion: 1, repositories: {} })
export const getReviewHistory = () => getJson<ReviewHistory>(keys.reviewHistory, emptyReviewHistory(), isReviewHistory)
export const saveReviewHistory = (history: ReviewHistory) => saveJson(keys.reviewHistory, history)
export const clearReviewHistory = () => saveReviewHistory(emptyReviewHistory())
export const defaultNotificationPreferences: NotificationPreferences = { desktop: false, sound: true, title: true }
export const getNotificationPreferences = () => getJson<NotificationPreferences>(keys.notificationPreferences, defaultNotificationPreferences, isNotificationPreferences)
export const saveNotificationPreferences = (preferences: NotificationPreferences) => saveJson(keys.notificationPreferences, preferences)
export const defaultIgnoreRules: IgnoreRules = { authors: [], pullRequests: [] }
export const getIgnoreRules = () => getJson<IgnoreRules>(keys.ignoreRules, defaultIgnoreRules, isIgnoreRules)
export const saveIgnoreRules = (rules: IgnoreRules) => saveJson(keys.ignoreRules, rules)
export const defaultGitWorkflowSettings: GitWorkflowSettings = {
  developerRemotes: [
    { id: 'carlo-osores', displayName: 'Carlo Osores Salgado', remote: 'cosores' },
    { id: 'cristopher-guzman', displayName: 'Cristopher Guzmán', remote: 'cristopher' },
    { id: 'jayro-guerrero', displayName: 'Jayro Guerrero', remote: 'jayro' },
    { id: 'ricardo-gutierrez', displayName: 'Ricardo Gutiérrez', remote: '' },
    { id: 'byron-obregon', displayName: 'Byron Obregón', remote: '' },
  ],
  repositoryRemotes: [{ id: 'kontroller-test', repository: 'kontroller_test/kontroller_test', remote: 'origin' }],
  syncRemotesConfirmed: false,
}
export const getGitWorkflowSettings = () => {
  const settings = getJson<GitWorkflowSettings>(keys.gitWorkflow, defaultGitWorkflowSettings, isGitWorkflowSettings)
  const targetRemotes = new Set(settings.repositoryRemotes.map((item) => item.remote.trim().toLocaleLowerCase()).filter(Boolean))
  return { ...settings, developerRemotes: settings.developerRemotes.map((item) => targetRemotes.has(item.remote.trim().toLocaleLowerCase()) ? { ...item, remote: '' } : item) }
}
export const saveGitWorkflowSettings = (settings: GitWorkflowSettings) => saveJson(keys.gitWorkflow, settings)
