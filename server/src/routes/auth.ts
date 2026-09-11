import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { config } from '../config.js'
import { setSession, clearSession, authenticatedSession } from '../auth.js'
import { query } from '../db/index.js'
import { log } from '../logger.js'
import { randomUUID } from 'node:crypto'

const loginSchema = z.object({ email: z.string().email(), token: z.string().min(1), expiresAt: z.number().int().positive().optional() })
type BitbucketUser = { uuid?: string; display_name?: string; nickname?: string; account_id?: string }

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (request, reply) => {
    const input = loginSchema.safeParse(request.body)
    if (!input.success) return reply.code(400).send({ error: 'Credenciales inválidas.' })
    const authorization = `Basic ${Buffer.from(`${input.data.email}:${input.data.token}`).toString('base64')}`
    const response = await fetch(`${config.BITBUCKET_API_BASE_URL}/user`, { headers: { authorization } })
    if (!response.ok) { log('warn', 'auth.bitbucket_rejected', { status: response.status }); return reply.code(401).send({ error: 'Bitbucket rechazó las credenciales.' }) }
    const user = await response.json() as BitbucketUser
    const uuid = user.uuid ?? user.account_id
    if (!uuid || !user.display_name) return reply.code(502).send({ error: 'Bitbucket no devolvió una identidad completa.' })
    const existing = await query<{ id: string }>('SELECT id FROM users WHERE bitbucket_uuid = $1', [uuid])
    const userId = existing.rows[0]?.id ?? randomUUID()
    await query(`INSERT INTO users (id, bitbucket_uuid, email, display_name) VALUES ($1, $2, $3, $4)
      ON CONFLICT (bitbucket_uuid) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, updated_at = NOW()`, [userId, uuid, input.data.email, user.display_name])
    const expiresAt = Math.min(input.data.expiresAt ?? Date.now() + 30 * 24 * 60 * 60 * 1000, Date.now() + 24 * 60 * 60 * 1000)
    setSession(reply, userId, input.data.email, input.data.token, expiresAt)
    log('info', 'auth.login', { userId })
    return { user: { id: userId, uuid, email: input.data.email, displayName: user.display_name }, expiresAt, token: input.data.token }
  })
  app.get('/api/auth/session', async (request, reply) => {
    const session = authenticatedSession(request)
    if (!session) return reply.code(401).send({ error: 'No autenticado.' })
    const result = await query<{ id: string; bitbucket_uuid: string; email: string; display_name: string }>('SELECT id, bitbucket_uuid, email, display_name FROM users WHERE id = $1', [session.userId])
    if (!result.rows[0]) return reply.code(401).send({ error: 'Sesión inválida.' })
    const user = result.rows[0]
    return { user: { id: user.id, uuid: user.bitbucket_uuid, email: user.email, displayName: user.display_name }, expiresAt: session.expiresAt, token: session.token }
  })
  app.delete('/api/auth/session', async (_request, reply) => { clearSession(reply); return { ok: true } })
}
