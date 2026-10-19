import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSession, getSession, kontrollerTestTechnologies, migrateKontrollerRepository, saveSession } from './storage'

describe('repository rule library migration', () => {
  it('configures the supported Kontroller stack without inventing versions', () => {
    expect(kontrollerTestTechnologies).toEqual([
      { id: 'ruby-2-4-3', name: 'Ruby', version: '2.4.3', kind: 'language' },
      { id: 'rails-5-1-7', name: 'Rails', version: '5.1.7', kind: 'framework' },
      { id: 'turbolinks-5-2-1', name: 'Turbolinks', version: '5.2.1', kind: 'library' },
    ])
  })

  it('replaces the broken legacy reference only for kontroller_test', () => {
    expect(migrateKontrollerRepository({ workspace: 'kontroller_test', repo: 'kontroller_test', rulepackRefs: ['kontroller-rails-legacy@1.0.0'] })).toMatchObject({
      technologies: kontrollerTestTechnologies,
      rulepackRefs: ['kontroller-official@1.0.0'],
    })
    expect(migrateKontrollerRepository({ workspace: 'other', repo: 'repo', rulepackRefs: ['kontroller-rails-legacy@1.0.0'] })).toEqual({ workspace: 'other', repo: 'repo', rulepackRefs: ['kontroller-rails-legacy@1.0.0'] })
  })

  it('keeps the Bitbucket session in sessionStorage and removes legacy localStorage data', () => {
    const local = new Map<string, string>([['prcr:session', JSON.stringify({ token: 'legacy' })]])
    const session = new Map<string, string>()
    const store = (target: Map<string, string>) => ({
      getItem: (key: string) => target.get(key) ?? null,
      setItem: (key: string, value: string) => { target.set(key, value) },
      removeItem: (key: string) => { target.delete(key) },
    })
    vi.stubGlobal('localStorage', store(local))
    vi.stubGlobal('sessionStorage', store(session))
    const value = { email: 'qa@example.com', token: 'fresh', expiresAt: Date.now() + 60_000 }

    expect(saveSession(value)).toBe(true)
    expect(local.has('prcr:session')).toBe(false)
    expect(session.get('prcr:session')).toContain('fresh')
    expect(getSession()).toEqual(value)

    clearSession()
    expect(session.has('prcr:session')).toBe(false)
  })
})

afterEach(() => vi.unstubAllGlobals())
