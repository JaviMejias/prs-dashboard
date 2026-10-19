import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPreparationSettings, getRepos, getCustomRules, savePreparationSettings, saveRepos, saveCustomRules } from './storage'
import { emptyProjectProfile } from './projectPreparation'

let values: Map<string, string>
let failWrites: boolean
beforeEach(() => {
  values = new Map()
  failWrites = false
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { if (failWrites) throw new Error('Quota exceeded'); values.set(key, value) }, removeItem: (key: string) => values.delete(key) })
})
afterEach(() => vi.unstubAllGlobals())

describe('preparation storage migration and recovery', () => {
  it('adopts legacy repositories and rules without deleting or mutating the old keys', () => {
    const rules = [{ id: 'old', name: 'Regla local', category: 'general', description: 'Previo', content: 'Preservar', source: 'local' }]
    const repositories = [{ workspace: 'team', repo: 'app', technologies: [{ id: 'ruby', name: 'Ruby', version: '2.4.3', kind: 'language' }], ruleRefs: ['old@1.0.0'] }]
    values.set('prcr:repos', JSON.stringify(repositories))
    values.set('prcr:custom-rules', JSON.stringify(rules))
    values.set('prcr:repository-library-migration', 'true')
    const previousRepos = values.get('prcr:repos')
    const current = getPreparationSettings()
    expect(current.repositories).toEqual(repositories)
    expect(current.customRules).toEqual(rules)
    expect(savePreparationSettings({ ...current, repositories: current.repositories.map((repo) => ({ ...repo, profile: { ...emptyProjectProfile(), summary: 'Nuevo contexto' } })) })).toBe(true)
    expect(getRepos()[0].profile?.summary).toBe('Nuevo contexto')
    expect(getCustomRules()).toEqual(rules)
    expect(values.get('prcr:repos')).toBe(previousRepos)
    expect(values.get('prcr:custom-rules')).toBe(JSON.stringify(rules))
  })
  it('restores in one write with the previous state and leaves no partial change on quota failure', () => {
    const initial = getPreparationSettings()
    expect(savePreparationSettings(initial)).toBe(true)
    const before = values.get('prcr:preparation-v1')
    const incoming = { ...initial, personalPreferences: { instructions: 'From backup' }, repositories: [] }
    failWrites = true
    expect(savePreparationSettings(incoming, true)).toBe(false)
    expect(values.get('prcr:preparation-v1')).toBe(before)
    failWrites = false
    expect(savePreparationSettings(incoming, true)).toBe(true)
    expect(getPreparationSettings().personalPreferences.instructions).toBe('From backup')
    expect(getPreparationSettings().previous?.repositories).toEqual(initial.repositories)
    expect(savePreparationSettings(getPreparationSettings().previous!)).toBe(true)
    expect(getPreparationSettings().personalPreferences).toEqual(initial.personalPreferences)
  })
  it('keeps project context when legacy controls save technology or rules and expires old undo', () => {
    const initial = getPreparationSettings()
    const repo = { ...initial.repositories[0], profile: { ...emptyProjectProfile(), summary: 'Persistir contexto' } }
    expect(savePreparationSettings({ ...initial, repositories: [repo] }, true)).toBe(true)
    expect(getPreparationSettings().previous).toBeDefined()
    expect(saveRepos([{ ...repo, technologies: [] }])).toBe(true)
    expect(saveCustomRules([])).toBe(true)
    expect(getRepos()[0].profile?.summary).toBe('Persistir contexto')
    expect(getPreparationSettings().previous).toBeUndefined()
  })
})
