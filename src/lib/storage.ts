import type { IgnoreRules, Notice, NotificationPreferences, NotificationSnapshot, RepoConfig, Session } from '../types'
const keys = { session: 'prcr:session', repos: 'prcr:repos', notices: 'prcr:notices', snapshot: 'prcr:snapshot', notificationPreferences: 'prcr:notification-preferences', ignoreRules: 'prcr:ignore-rules' }
export const initialRepos: RepoConfig[] = [{ workspace: 'kontroller_test', repo: 'kontroller_test' }, { workspace: 'kontroller_test', repo: 'providers_api' }]
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
export const getRepos = () => uniqueRepos(getJson<RepoConfig[]>(keys.repos, initialRepos))
export const saveRepos = (r: RepoConfig[]) => saveJson(keys.repos, uniqueRepos(r))
export const getNotices = () => getJson<unknown[]>(keys.notices, []).filter(isActionableNotice)
export const saveNotices = (n: Notice[]) => saveJson(keys.notices, n.slice(0, 40))
export const getSnapshot = () => getJson<NotificationSnapshot>(keys.snapshot, {})
export const saveSnapshot = (s: NotificationSnapshot) => saveJson(keys.snapshot, s)
export const defaultNotificationPreferences: NotificationPreferences = { desktop: false, sound: true, title: true }
export const getNotificationPreferences = () => getJson<NotificationPreferences>(keys.notificationPreferences, defaultNotificationPreferences)
export const saveNotificationPreferences = (preferences: NotificationPreferences) => saveJson(keys.notificationPreferences, preferences)
export const defaultIgnoreRules: IgnoreRules = { authors: [], pullRequests: [] }
export const getIgnoreRules = () => getJson<IgnoreRules>(keys.ignoreRules, defaultIgnoreRules)
export const saveIgnoreRules = (rules: IgnoreRules) => saveJson(keys.ignoreRules, rules)
