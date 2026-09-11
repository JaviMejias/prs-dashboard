import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import webpush from 'web-push'
import { config } from './config.js'
import { query } from './db/index.js'
import { authRoutes } from './routes/auth.js'
import { pushRoutes } from './routes/push.js'
import { log } from './logger.js'

webpush.setVapidDetails(config.VAPID_SUBJECT, config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY)
const app = Fastify({ logger: false })
await app.register(cookie)
await app.register(cors, { origin: config.FRONTEND_ORIGIN, credentials: true })
app.get('/api/health', async (_request, reply) => {
  await query('SELECT 1')
  return reply.send({ ok: true, service: 'pr-control-room-server' })
})
await authRoutes(app)
await pushRoutes(app)
app.setErrorHandler((error, request, reply) => { log('error', 'http.error', { method: request.method, path: request.url, error: error instanceof Error ? error.message : 'unknown' }); void reply.code(500).send({ error: 'Error interno del servidor.' }) })
await app.listen({ port: config.PORT, host: '0.0.0.0' })
log('info', 'server.started', { port: config.PORT })
