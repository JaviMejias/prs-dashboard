import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { config } from './config.js'
import { log } from './logger.js'

const cookieName = 'prcr_session'
type Session = { userId: string; expiresAt: number; email: string; token: string }
const key = createHash('sha256').update(config.SESSION_SECRET).digest()

function sign(value: string) { return createHmac('sha256', config.SESSION_SECRET).update(value).digest('base64url') }
function seal(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.')
}
function unseal(value: string) {
  try {
    const [ivValue, tagValue, encryptedValue] = value.split('.')
    if (!ivValue || !tagValue || !encryptedValue) return null
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8')
  } catch { return null }
}
function encode(session: Session) {
  const value = Buffer.from(JSON.stringify({ ...session, token: seal(session.token) })).toString('base64url')
  return `${value}.${sign(value)}`
}
function decode(value: string): Session | null {
  const [payload, signature] = value.split('.')
  if (!payload || !signature) return null
  const expected = Buffer.from(sign(payload))
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session & { token: string }
    const token = unseal(session.token)
    if (!token || session.expiresAt <= Date.now() || !session.userId || !session.email) return null
    return { userId: session.userId, expiresAt: session.expiresAt, email: session.email, token }
  } catch { return null }
}

export function setSession(reply: FastifyReply, userId: string, email: string, token: string, expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000) {
  const maxAge = Math.max(60, Math.ceil((expiresAt - Date.now()) / 1000))
  reply.setCookie(cookieName, encode({ userId, email, token, expiresAt }), { httpOnly: true, secure: config.COOKIE_SECURE === 'true', sameSite: 'lax', path: '/', maxAge })
}
export function clearSession(reply: FastifyReply) { reply.clearCookie(cookieName, { path: '/' }) }
export function authenticatedSession(request: FastifyRequest) {
  const value = request.cookies[cookieName]
  const session = value ? decode(value) : null
  if (!session) { log('warn', 'auth.unauthorized', { path: request.url }); return null }
  return session
}
export function authenticatedUserId(request: FastifyRequest) { return authenticatedSession(request)?.userId ?? null }
