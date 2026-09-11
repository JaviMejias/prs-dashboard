export type PushDevice = { id: string; endpoint: string; device_label: string | null; platform: string | null; created_at: string; last_seen_at: string; revoked_at: string | null; last_error_at: string | null; last_error: string | null }
export type PushServerDiagnostics = { authenticated: boolean; user: { id: string; uuid: string; email: string; displayName: string } | null; devices: PushDevice[]; activeDevices: number; vapidConfigured: boolean }
export type BrowserPushDiagnostics = { secureContext: boolean; origin: string; serviceWorkerRegistered: boolean; serviceWorkerActive: boolean; scope: string | null; scriptURL: string | null; notificationPermission: NotificationPermission | 'unsupported'; pushSupported: boolean; subscription: { endpoint: string; registeredAt: string | null } | null; lastPushReceivedAt: string | null }

const registrationKey = 'prcr:push-registration'
const api = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const data = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(data.error ?? `La solicitud falló (${response.status}).`)
  return data
}
export const createBackendSession = (credentials: { email: string; token: string }) => api('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) })
const maskEndpoint = (endpoint: string) => { try { const url = new URL(endpoint); return `${url.origin}/…${url.pathname.slice(-12)}` } catch { return 'endpoint inválido' } }
const applicationServerKey = (key: string) => Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4)), (char) => char.charCodeAt(0))

async function lastPushReceived() {
  return new Promise<string | null>((resolve) => {
    const request = indexedDB.open('prcr-push-diagnostics', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('events')
    request.onsuccess = () => { const transaction = request.result.transaction('events', 'readonly'); const get = transaction.objectStore('events').get('last-push'); get.onsuccess = () => { request.result.close(); resolve((get.result as { receivedAt?: string } | undefined)?.receivedAt ?? null) }; get.onerror = () => resolve(null) }
    request.onerror = () => resolve(null)
  })
}

export async function getBrowserPushDiagnostics(): Promise<BrowserPushDiagnostics> {
  const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window
  const notificationPermission = 'Notification' in window ? Notification.permission : 'unsupported'
  const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
  const subscription = pushSupported && registration ? await registration.pushManager.getSubscription() : null
  return { secureContext: window.isSecureContext, origin: window.location.origin, serviceWorkerRegistered: Boolean(registration), serviceWorkerActive: Boolean(registration?.active), scope: registration?.scope ?? null, scriptURL: registration?.active?.scriptURL ?? null, notificationPermission, pushSupported, subscription: subscription ? { endpoint: maskEndpoint(subscription.endpoint), registeredAt: localStorage.getItem(registrationKey) } : null, lastPushReceivedAt: await lastPushReceived() }
}

export async function enablePushNotifications() {
  if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Este navegador no permite Push en el contexto actual.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('El permiso de notificaciones no fue concedido.')
  const registration = await navigator.serviceWorker.ready
  const { publicKey } = await api<{ publicKey: string }>('/api/push/vapid-public-key')
  const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) })
  const response = await api<{ id: string }>('/api/push/subscriptions', { method: 'PUT', body: JSON.stringify({ subscription: subscription.toJSON(), device: { label: navigator.userAgent.includes('Mobile') ? 'Móvil' : 'Navegador', platform: navigator.platform } }) })
  localStorage.setItem(registrationKey, new Date().toISOString())
  return response
}
export async function disablePushNotifications() {
  const registration = await navigator.serviceWorker.getRegistration(); const subscription = registration ? await registration.pushManager.getSubscription() : null
  if (subscription) { await api('/api/push/subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) }); await subscription.unsubscribe() }
  localStorage.removeItem(registrationKey)
}
export const getPushServerDiagnostics = () => api<PushServerDiagnostics>('/api/push/diagnostics')
export const sendPushTest = () => api<{ sent: number; total: number }>('/api/push/test', { method: 'POST', body: '{}' })
