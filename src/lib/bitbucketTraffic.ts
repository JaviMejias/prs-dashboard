import { sessionCacheKey } from './queryIdentity'
import type { Session } from '../types'

export const HISTORY_REQUEST_INTERVAL_MS = 5_000
export type BitbucketHold = { until: number; message: string; status?: number }
const holds = new Map<string, BitbucketHold>()
const lastRequests = new Map<string, number>()
let historyTail: Promise<unknown> = Promise.resolve()
const holdKey = (session: Session) => `prcr:bitbucket-hold:${sessionCacheKey(session)}`

export function bitbucketHold(session: Session): BitbucketHold | undefined {
  let hold = holds.get(sessionCacheKey(session))
  try {
    const stored = JSON.parse(localStorage.getItem(holdKey(session)) || 'null') as BitbucketHold | null
    if (stored && Number.isFinite(stored.until) && typeof stored.message === 'string' && stored.message.length <= 1_000
      && (stored.status === undefined || stored.status === 429) && (!hold || stored.until > hold.until)) hold = stored
  } catch { /* A missing storage API must not disable in-memory backoff. */ }
  return hold && hold.until > Date.now() ? hold : undefined
}

export function holdBitbucket(session: Session, hold: BitbucketHold) {
  holds.set(sessionCacheKey(session), hold)
  try { localStorage.setItem(holdKey(session), JSON.stringify(hold)) } catch { /* Keep the hold in memory. */ }
}

function delay(ms: number, signal: AbortSignal) {
  signal.throwIfAborted()
  return new Promise<void>((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve() }, ms)
    signal.addEventListener('abort', cancel, { once: true })
  })
}

export function historicalRequest<T>(session: Session, signal: AbortSignal, load: () => Promise<T>): Promise<T> {
  const run = async () => {
    signal.throwIfAborted()
    const account = sessionCacheKey(session)
    const start = async () => {
      let previous = lastRequests.get(account) || 0
      try { previous = Math.max(previous, Number(localStorage.getItem(`prcr:history-request:${account}`)) || 0) } catch { /* Memory-only pacing remains available. */ }
      const wait = Math.min(HISTORY_REQUEST_INTERVAL_MS, Math.max(0, previous + HISTORY_REQUEST_INTERVAL_MS - Date.now()))
      if (wait) await delay(wait, signal)
      signal.throwIfAborted()
      lastRequests.set(account, Date.now())
      try { localStorage.setItem(`prcr:history-request:${account}`, String(Date.now())) } catch { /* Memory-only pacing remains available. */ }
      return load()
    }
    return typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request(`prcr:history-network:${account}`, { signal }, start)
      : start()
  }
  const result = historyTail.then(run, run)
  historyTail = result.catch(() => {})
  return result
}
