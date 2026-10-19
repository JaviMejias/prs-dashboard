import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyUser } from './bitbucket'
import type { Session } from '../types'

const session: Session = { email: 'javier@example.com', token: 'not-used', expiresAt: Date.now() }

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Bitbucket request timeout', () => {
  it('ends a login verification that never receives a response', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })))

    const verification = verifyUser(session)
    const rejection = expect(verification).rejects.toThrow('Bitbucket no respondió en 30 segundos')
    await vi.advanceTimersByTimeAsync(30_000)

    await rejection
  })
})
