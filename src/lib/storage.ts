import type { IgnoreRules, Notice, NotificationPreferences, RepoConfig, Session } from '../types'
const keys = { session: 'prcr:session', repos: 'prcr:repos', notices: 'prcr:notices', snapshot: 'prcr:snapshot', notificationPreferences: 'prcr:notification-preferences', ignoreRules: 'prcr:ignore-rules' }
export const initialRepos: RepoConfig[] = [{ workspace: 'kontroller_test', repo: 'kontroller_test' }, { workspace: 'kontroller_test', repo: 'providers_api' }]
const uniqueRepos = (repos: RepoConfig[]) => Array.from(new Map(repos.map((repo) => [`${repo.workspace}/${repo.repo}`.toLocaleLowerCase(), repo])).values())
export function getJson<T>(key: string, fallback: T): T { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback } catch { return fallback } }
export const getSession = () => getJson<Session | null>(keys.session, null)
export const saveSession = (s: Session) => localStorage.setItem(keys.session, JSON.stringify(s))
export const clearSession = () => localStorage.removeItem(keys.session)
export const getRepos = () => uniqueRepos(getJson<RepoConfig[]>(keys.repos, initialRepos))
export const saveRepos = (r: RepoConfig[]) => localStorage.setItem(keys.repos, JSON.stringify(uniqueRepos(r)))
export const getNotices = () => getJson<Notice[]>(keys.notices, [])
export const saveNotices = (n: Notice[]) => localStorage.setItem(keys.notices, JSON.stringify(n.slice(0, 40)))
export const getSnapshot = () => getJson<Record<string, string>>(keys.snapshot, {})
export const saveSnapshot = (s: Record<string, string>) => localStorage.setItem(keys.snapshot, JSON.stringify(s))
export const defaultNotificationPreferences: NotificationPreferences = { desktop: false, sound: true, title: true }
export const getNotificationPreferences = () => getJson<NotificationPreferences>(keys.notificationPreferences, defaultNotificationPreferences)
export const saveNotificationPreferences = (preferences: NotificationPreferences) => localStorage.setItem(keys.notificationPreferences, JSON.stringify(preferences))
export const defaultIgnoreRules: IgnoreRules = { authors: [], pullRequests: [] }
export const getIgnoreRules = () => getJson<IgnoreRules>(keys.ignoreRules, defaultIgnoreRules)
export const saveIgnoreRules = (rules: IgnoreRules) => localStorage.setItem(keys.ignoreRules, JSON.stringify(rules))
