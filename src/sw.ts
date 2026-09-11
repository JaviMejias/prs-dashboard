/// <reference lib="webworker" />

import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & typeof globalThis
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

type PushPayload = { title?: string; body?: string; url?: string; notificationId?: string; tag?: string }
const diagnosticsDb = 'prcr-push-diagnostics'
const diagnosticsStore = 'events'

function rememberPush(payload: PushPayload) {
  return new Promise<void>((resolve) => {
    const request = indexedDB.open(diagnosticsDb, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(diagnosticsStore)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction(diagnosticsStore, 'readwrite')
      transaction.objectStore(diagnosticsStore).put({ receivedAt: new Date().toISOString(), notificationId: payload.notificationId ?? null, title: payload.title ?? null }, 'last-push')
      transaction.oncomplete = () => { db.close(); resolve() }
      transaction.onerror = () => { db.close(); resolve() }
    }
    request.onerror = () => resolve()
  })
}

self.addEventListener('push', (event) => {
  const payload = event.data?.json() as PushPayload | undefined
  const notification = payload ?? { title: 'PR Control Room', body: 'Tienes una novedad en tu cola.' }
  event.waitUntil(Promise.all([
    rememberPush(notification),
    self.registration.showNotification(notification.title ?? 'PR Control Room', {
      body: notification.body ?? 'Tienes una novedad en tu cola.', icon: '/icons/pwa-192.png', badge: '/icons/pwa-192.png',
      tag: notification.tag ?? notification.notificationId ?? 'prcr-notification', data: { url: notification.url ?? '/', notificationId: notification.notificationId },
    }),
  ]))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data?.url as string | undefined) ?? '/', self.location.origin).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => 'focus' in client) as WindowClient | undefined
    if (existing) return existing.navigate(url).then((client) => client?.focus())
    return self.clients.openWindow(url)
  }))
})
