import { createHmac, timingSafeEqual } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { config } from './config.js'
import { log } from './logger.js'

const cookieName = 'prcr_session'
type Session = { userId: string; expiresAt: number }

function sign(value: string) { return createHmac('sha256', config.SESSION_SECRET).update(value).digest('base64url') }
function encode(session: Session) {
  const value = Buffer.from(JSON.stringify(session)).toString('base64url')
  return `${value}.${sign(value)}`
}
function decode(value: string): Session | null {
  const [payload, signature] = value.split('.')
  if (!payload || !signature) return null
  const expected = Buffer.from(sign(payload))
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session
    return session.expiresAt > Date.now() ? session : null
  } catch { return null }
}

export function setSession(reply: FastifyReply, userId: string) {
  reply.setCookie(cookieName, encode({ userId, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 }), {
    httpOnly: true, secure: config.COOKIE_SECURE === 'true', sameSite: 'lax', path: '/', maxAge: 30 * 24 * 60 * 60,
  })
}
export function clearSession(reply: FastifyReply) { reply.clearCookie(cookieName, { path: '/' }) }
export function authenticatedUserId(request: FastifyRequest) {
  const value = request.cookies[cookieName]
  const session = value ? decode(value) : null
  if (!session) { log('warn', 'auth.unauthorized', { path: request.url }); return null }
  return session.userId
}
