import type { Session } from '../types'

export function sessionCacheKey(session: Session) {
  return session.uuid || session.email.trim().toLowerCase()
}
