import type { GitWorkflowSettings, IgnoreRules, Notice, NotificationPreferences, NotificationSnapshot, RepoConfig, RepositoryTechnology, ReviewHistory, ReviewRule, Session } from '../types'
const keys = { session: 'prcr:session', repos: 'prcr:repos', notices: 'prcr:notices', snapshot: 'prcr:snapshot', reviewHistory: 'prcr:review-history', notificationPreferences: 'prcr:notification-preferences', ignoreRules: 'prcr:ignore-rules', gitWorkflow: 'prcr:git-workflow', customRules: 'prcr:custom-rules', repositoryLibraryMigration: 'prcr:repository-library-migration' }
const officialKontrollerRulepack = 'kontroller-official@1.0.0'
const legacyKontrollerRulepack = 'kontroller-rails-legacy@1.0.0'
export const kontrollerTestTechnologies: RepositoryTechnology[] = [
  { id: 'ruby-2-4-3', name: 'Ruby', version: '2.4.3', kind: 'language' },
  { id: 'rails-5-1-7', name: 'Rails', version: '5.1.7', kind: 'framework' },
  { id: 'turbolinks-5-2-1', name: 'Turbolinks', version: '5.2.1', kind: 'library' },
]
export const kontrollerTestRepositoryDefaults: RepoConfig = { workspace: 'kontroller_test', repo: 'kontroller_test', technologies: kontrollerTestTechnologies, rulepackRefs: [officialKontrollerRulepack] }
export const initialRepos: RepoConfig[] = [kontrollerTestRepositoryDefaults, { workspace: 'kontroller_test', repo: 'providers_api' }]
const uniqueRepos = (repos: RepoConfig[]) => Array.from(new Map(repos.map((repo) => [`${repo.workspace}/${repo.repo}`.toLocaleLowerCase(), repo])).values())
export function getJson<T>(key: string, fallback: T): T { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback } catch { return fallback } }
function saveJson<T>(key: string, value: T) { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* Browser storage can be unavailable in private or restricted contexts. */ } }
function removeItem(key: string) { try { localStorage.removeItem(key) } catch { /* Keep the interface usable when browser storage is unavailable. */ } }
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
export const getSession = () => getJson<Session | null>(keys.session, null)
export const saveSession = (s: Session) => saveJson(keys.session, s)
export const clearSession = () => removeItem(keys.session)
export function migrateKontrollerRepository(repo: RepoConfig): RepoConfig {
  if (repo.workspace.toLocaleLowerCase() !== 'kontroller_test' || repo.repo.toLocaleLowerCase() !== 'kontroller_test') return repo
  const rulepackRefs = (repo.rulepackRefs || []).filter((reference) => reference !== legacyKontrollerRulepack && reference !== officialKontrollerRulepack)
  return {
    ...repo,
    technologies: repo.technologies?.length ? repo.technologies : kontrollerTestTechnologies,
    rulepackRefs: [...rulepackRefs, officialKontrollerRulepack],
  }
}
export const getRepos = () => {
  const repos = uniqueRepos(getJson<RepoConfig[]>(keys.repos, initialRepos))
  if (getJson<boolean>(keys.repositoryLibraryMigration, false)) return repos
  const migrated = repos.map(migrateKontrollerRepository)
  saveJson(keys.repos, migrated)
  saveJson(keys.repositoryLibraryMigration, true)
  return migrated
}
export const saveRepos = (r: RepoConfig[]) => saveJson(keys.repos, uniqueRepos(r))
export const getCustomRules = () => getJson<ReviewRule[]>(keys.customRules, []).filter((rule) => rule.source === 'local')
export const saveCustomRules = (rules: ReviewRule[]) => saveJson(keys.customRules, rules)
export const getNotices = () => getJson<unknown[]>(keys.notices, []).filter(isActionableNotice)
export const saveNotices = (n: Notice[]) => saveJson(keys.notices, n.slice(0, 40))
export const getSnapshot = () => getJson<NotificationSnapshot>(keys.snapshot, {})
export const saveSnapshot = (s: NotificationSnapshot) => saveJson(keys.snapshot, s)
export const emptyReviewHistory = (): ReviewHistory => ({ schemaVersion: 1, repositories: {} })
export const getReviewHistory = () => getJson<ReviewHistory>(keys.reviewHistory, emptyReviewHistory())
export const saveReviewHistory = (history: ReviewHistory) => saveJson(keys.reviewHistory, history)
export const clearReviewHistory = () => saveReviewHistory(emptyReviewHistory())
export const defaultNotificationPreferences: NotificationPreferences = { desktop: false, sound: true, title: true }
export const getNotificationPreferences = () => getJson<NotificationPreferences>(keys.notificationPreferences, defaultNotificationPreferences)
export const saveNotificationPreferences = (preferences: NotificationPreferences) => saveJson(keys.notificationPreferences, preferences)
export const defaultIgnoreRules: IgnoreRules = { authors: [], pullRequests: [] }
export const getIgnoreRules = () => getJson<IgnoreRules>(keys.ignoreRules, defaultIgnoreRules)
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
  const settings = getJson<GitWorkflowSettings>(keys.gitWorkflow, defaultGitWorkflowSettings)
  const targetRemotes = new Set(settings.repositoryRemotes.map((item) => item.remote.trim().toLocaleLowerCase()).filter(Boolean))
  return { ...settings, developerRemotes: settings.developerRemotes.map((item) => targetRemotes.has(item.remote.trim().toLocaleLowerCase()) ? { ...item, remote: '' } : item) }
}
export const saveGitWorkflowSettings = (settings: GitWorkflowSettings) => saveJson(keys.gitWorkflow, settings)
