import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import webpush from 'web-push'
import { z } from 'zod'
import { config } from '../config.js'
import { authenticatedUserId } from '../auth.js'
import { query } from '../db/index.js'
import { log } from '../logger.js'

const subscriptionSchema = z.object({ endpoint: z.string().url(), expirationTime: z.number().nullable().optional(), keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }) })
const registerSchema = z.object({ subscription: subscriptionSchema, device: z.object({ label: z.string().max(100).optional(), platform: z.string().max(40).optional() }).optional() })

function maskEndpoint(endpoint: string) { try { const url = new URL(endpoint); return `${url.origin}/…${url.pathname.slice(-12)}` } catch { return 'endpoint inválido' } }
function requireUser(request: Parameters<FastifyInstance['get']>[1] extends never ? never : any, reply: any) {
  const userId = authenticatedUserId(request)
  if (!userId) { void reply.code(401).send({ error: 'No autenticado.' }); return null }
  return userId
}

export async function pushRoutes(app: FastifyInstance) {
  app.get('/api/push/vapid-public-key', async () => ({ publicKey: config.VAPID_PUBLIC_KEY }))
  app.put('/api/push/subscriptions', async (request, reply) => {
    const userId = requireUser(request, reply); if (!userId) return
    const parsed = registerSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: 'PushSubscription inválida.' })
    const { subscription, device } = parsed.data
    const existing = await query<{ id: string; user_id: string }>('SELECT id, user_id FROM push_subscriptions WHERE endpoint = $1', [subscription.endpoint])
    if (existing.rows[0] && existing.rows[0].user_id !== userId) return reply.code(409).send({ error: 'Ese dispositivo está asociado a otra cuenta.' })
    const id = existing.rows[0]?.id ?? randomUUID()
    await query(`INSERT INTO push_subscriptions (id, user_id, endpoint, expiration_time, p256dh, auth, device_label, platform, user_agent)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (endpoint) DO UPDATE SET user_id=$2, expiration_time=$4, p256dh=$5, auth=$6, device_label=$7, platform=$8, user_agent=$9, last_seen_at=NOW(), revoked_at=NULL, last_error=NULL, last_error_at=NULL`,
      [id, userId, subscription.endpoint, subscription.expirationTime ? new Date(subscription.expirationTime) : null, subscription.keys.p256dh, subscription.keys.auth, device?.label ?? null, device?.platform ?? null, request.headers['user-agent'] ?? null])
    log('info', 'push.subscription.registered', { userId, subscriptionId: id, endpoint: maskEndpoint(subscription.endpoint) })
    return { id, endpoint: maskEndpoint(subscription.endpoint), registeredAt: new Date().toISOString() }
  })
  app.delete('/api/push/subscriptions', async (request, reply) => {
    const userId = requireUser(request, reply); if (!userId) return
    const input = z.object({ endpoint: z.string().url() }).safeParse(request.body); if (!input.success) return reply.code(400).send({ error: 'Endpoint inválido.' })
    await query('UPDATE push_subscriptions SET revoked_at=NOW(), last_seen_at=NOW() WHERE user_id=$1 AND endpoint=$2', [userId, input.data.endpoint])
    log('info', 'push.subscription.revoked', { userId, endpoint: maskEndpoint(input.data.endpoint) }); return { ok: true }
  })
  app.get('/api/push/diagnostics', async (request, reply) => {
    const userId = requireUser(request, reply); if (!userId) return
    const user = await query<{ id: string; bitbucket_uuid: string; email: string; display_name: string }>('SELECT id, bitbucket_uuid, email, display_name FROM users WHERE id=$1', [userId])
    const subscriptions = await query<{ id: string; endpoint: string; device_label: string | null; platform: string | null; created_at: string; last_seen_at: string; revoked_at: string | null; last_error_at: string | null; last_error: string | null }>('SELECT id, endpoint, device_label, platform, created_at, last_seen_at, revoked_at, last_error_at, last_error FROM push_subscriptions WHERE user_id=$1 ORDER BY last_seen_at DESC', [userId])
    return { authenticated: true, user: user.rows[0] ? { id: user.rows[0].id, uuid: user.rows[0].bitbucket_uuid, email: user.rows[0].email, displayName: user.rows[0].display_name } : null, devices: subscriptions.rows.map((item) => ({ ...item, endpoint: maskEndpoint(item.endpoint) })), activeDevices: subscriptions.rows.filter((item) => !item.revoked_at).length, vapidConfigured: Boolean(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) }
  })
  app.post('/api/push/test', async (request, reply) => {
    const userId = requireUser(request, reply); if (!userId) return
    const subscriptions = await query<{ id: string; endpoint: string; p256dh: string; auth: string }>('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=$1 AND revoked_at IS NULL', [userId])
    if (!subscriptions.rows.length) return reply.code(404).send({ error: 'No hay dispositivos push activos.' })
    const payload = JSON.stringify({ title: 'PR Control Room', body: 'Push de prueba recibido correctamente.', url: '/', notificationId: `test-${Date.now()}`, tag: 'prcr-test' })
    let sent = 0
    for (const subscription of subscriptions.rows) {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload)
        await query('INSERT INTO push_delivery_logs (id, subscription_id, user_id, kind, status) VALUES ($1,$2,$3,$4,$5)', [randomUUID(), subscription.id, userId, 'test', 'accepted'])
        sent += 1
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode
        const message = error instanceof Error ? error.message.slice(0, 500) : 'unknown push error'
        await query('UPDATE push_subscriptions SET last_error_at=NOW(), last_error=$1, revoked_at=CASE WHEN $2 IN (404,410) THEN NOW() ELSE revoked_at END WHERE id=$3', [message, statusCode ?? 0, subscription.id])
        await query('INSERT INTO push_delivery_logs (id, subscription_id, user_id, kind, status, error) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), subscription.id, userId, 'test', 'failed', message])
        log('error', 'push.delivery.failed', { userId, subscriptionId: subscription.id, statusCode, error: message })
      }
    }
    log('info', 'push.test.sent', { userId, sent, total: subscriptions.rows.length }); return { sent, total: subscriptions.rows.length }
  })
}
