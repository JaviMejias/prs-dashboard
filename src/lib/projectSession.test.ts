import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildProjectSessionContext, localReviewDay, projectContextRevision, shouldRemindContext } from './projectSession'
import { defaultPersonalPreferences, emptyProjectProfile } from './projectPreparation'
import { getContextReminder, saveContextReminder } from './storage'
import { buildCodexPreparation, buildRepositoryCodexConfiguration, buildReviewContext } from './reviewContext'
import type { AppliedReviewRule, RepoConfig } from '../types'

const repo: RepoConfig = { workspace: 'Team', repo: 'App', profile: { ...emptyProjectProfile(), summary: 'ERP multitenant', architecture: 'Monolito Rails', unknowns: 'PWA no confirmada' }, technologies: [{ id: 'ruby', name: 'Ruby', version: '2.4.3', kind: 'language', evidence: '.ruby-version:1' }] }
const rule: AppliedReviewRule = { id: 'custom', reference: 'custom@1', version: '1', name: 'Regla de aislamiento', description: 'Verificar el tenant en consultas.', category: 'project', source: 'local', content: 'PRIVATE-FULL-RULE-CONTENT' }
const preferences = { instructions: '2 espacios; código en inglés e interfaz en español.' }
let values: Map<string, string>
beforeEach(() => {
  values = new Map()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) })
})
afterEach(() => vi.unstubAllGlobals())

describe('project session context', () => {
  it('copies the initial profile and a rule index without pretending it includes the full rules', () => {
    const text = buildProjectSessionContext(repo, [rule], preferences)
    for (const value of ['team/app', 'ERP multitenant', 'Monolito Rails', 'Ruby 2.4.3', '.ruby-version:1', 'PWA no confirmada', preferences.instructions, rule.reference, rule.description]) expect(text).toContain(value)
    expect(text).not.toContain(rule.content)
    expect(text).toContain('NO incluye el texto completo')
    expect(text).toContain('pídeme el contexto completo')
    expect(text).toContain(projectContextRevision(repo, [rule], preferences))
  })
  it('revises the context after profile, version, personal preference or rule-content changes', () => {
    const initial = projectContextRevision(repo, [rule], preferences)
    const variants = [
      projectContextRevision({ ...repo, profile: { ...repo.profile!, summary: 'Otro propósito' } }, [rule], preferences),
      projectContextRevision({ ...repo, technologies: [{ ...repo.technologies![0], version: '2.4.4' }] }, [rule], preferences),
      projectContextRevision(repo, [rule], { instructions: '4 espacios' }),
      projectContextRevision(repo, [{ ...rule, content: 'NEW CONTENT, SAME RULE VERSION' }], preferences),
      projectContextRevision(repo, [{ ...rule, technology: 'Rails' }], preferences),
      projectContextRevision(repo, [rule], preferences, ['Regla no encontrada']),
    ]
    for (const revision of variants) expect(revision).not.toBe(initial)
    expect(projectContextRevision({ ...repo, profile: { ...repo.profile!, updatedAt: '2026-10-20T00:00:00Z' } }, [rule], preferences)).toBe(initial)
  })
  it('does not include or invalidate disabled personal preferences', () => {
    const independent = { ...repo, profile: { ...repo.profile!, usePersonalPreferences: false } }
    expect(buildProjectSessionContext(independent, [], preferences)).not.toContain(preferences.instructions)
    expect(projectContextRevision(independent, [], preferences)).toBe(projectContextRevision(independent, [], { instructions: 'Changed but disabled' }))
  })
  it('uses the same revision in the initial context, full repository guide and compact PR', () => {
    const revision = projectContextRevision(repo, [rule], defaultPersonalPreferences)
    const session = { email: 'qa@example.com', token: 'NEVER-EXPORT-TOKEN', expiresAt: 0 }
    const context = buildReviewContext({ id: 1, title: 'Fix', state: 'OPEN', created_on: '2026-10-19T00:00:00Z', updated_on: '2026-10-19T00:00:00Z', repo }, session, { commits: [], changedFiles: [], comments: [], activity: [], diffstat: { files: 0, additions: 0, deletions: 0, totalChanges: 0 }, unavailable: ['commits'] }, [], [rule])
    expect(buildProjectSessionContext(repo, [rule])).toContain(revision)
    expect(buildRepositoryCodexConfiguration(repo, [rule])).toContain(revision)
    expect(buildCodexPreparation(context)).toContain(revision)
    expect(buildCodexPreparation(context, { mode: 'full' })).toContain(revision)
    expect(buildCodexPreparation(context)).not.toContain(session.token)
  })
  it('makes an incomplete profile and unavailable rules explicit', () => {
    const text = buildProjectSessionContext({ workspace: 'team', repo: 'new' }, [], preferences, ['Regla ausente'])
    expect(text).toContain('Propósito no documentado')
    expect(text).toContain('Regla ausente')
    expect(text).toContain('No asumas que esas reglas se cargaron')
  })
})

describe('daily context reminder', () => {
  it('uses the browser local calendar rather than an elapsed 24-hour interval', () => {
    expect(localReviewDay(new Date(2026, 9, 19, 23, 59))).toBe('2026-10-19')
    expect(localReviewDay(new Date(2026, 9, 20, 0, 0))).toBe('2026-10-20')
    expect(localReviewDay(new Date(2027, 0, 1))).toBe('2027-01-01')
  })
  it('reminds on first use, a new day or a changed context, but not again on the same day', () => {
    const previous = { day: '2026-10-19', revision: 'ctx-12345678' }
    expect(shouldRemindContext(null, previous.day, previous.revision)).toBe(true)
    expect(shouldRemindContext(previous, previous.day, previous.revision)).toBe(false)
    expect(shouldRemindContext(previous, '2026-10-20', previous.revision)).toBe(true)
    expect(shouldRemindContext(previous, previous.day, 'ctx-87654321')).toBe(true)
  })
  it('stores reminder receipts separately by account and does not touch project data', () => {
    const receipt = { day: '2026-10-19', revision: 'ctx-12345678' }
    expect(saveContextReminder('qa-one', receipt)).toBe(true)
    expect(getContextReminder('qa-one')).toEqual(receipt)
    expect(getContextReminder('qa-two')).toBeNull()
    expect(values.has('prcr:preparation-v1')).toBe(false)
  })
  it('handles corrupted receipts and storage failures without treating them as delivered context', () => {
    values.set('prcr:context-reminder:qa', '{')
    expect(getContextReminder('qa')).toBeNull()
    values.set('prcr:context-reminder:qa', JSON.stringify({ day: 3, revision: 'broken' }))
    expect(getContextReminder('qa')).toBeNull()
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('quota') } })
    expect(getContextReminder('qa')).toBeNull()
    expect(saveContextReminder('qa', { day: '2026-10-19', revision: 'ctx-12345678' })).toBe(false)
  })
})
