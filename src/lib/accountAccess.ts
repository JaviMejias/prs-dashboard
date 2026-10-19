import type { Session } from '../types'

const PERSONAL_ACCOUNT_EMAIL = 'javier.mejias@kontrollererp.cl'

export function hasPersonalAccess(session: Pick<Session, 'email'>) {
  return session.email.trim().toLowerCase() === PERSONAL_ACCOUNT_EMAIL
}
