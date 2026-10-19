import { describe, expect, it } from 'vitest'
import { createPreparationBackup, parsePreparationBackup, planPreparationRestore } from './preparationBackup'
import { emptyProjectProfile } from './projectPreparation'
import type { PreparationData } from '../types'

const data = (): PreparationData => ({ repositories: [{ workspace: 'team', repo: 'app', profile: { ...emptyProjectProfile(), summary: 'Contexto actual' }, ruleRefs: ['local@1.0.0'] }], customRules: [{ id: 'local', name: 'Mi regla', category: 'project', version: '1.0.0', description: 'Regla del proyecto', content: 'No usar APIs posteriores a Rails 5.1.', source: 'local', sources: ['/home/qa/private.md'] }], personalPreferences: { instructions: '2 espacios' } })

describe('portable preparation backup', () => {
  it('round-trips full projects, personal preferences, selections and rule contents', () => {
    const backup = parsePreparationBackup(JSON.stringify(createPreparationBackup(data())))
    expect(backup.repositories[0].profile?.summary).toBe('Contexto actual')
    expect(backup.repositories[0].ruleRefs).toEqual(['local@1.0.0'])
    expect(backup.personalPreferences.instructions).toBe('2 espacios')
    expect(backup.rules.find((rule) => rule.id === 'local')?.content).toContain('Rails 5.1')
    expect(backup.rules.some((rule) => rule.source === 'git')).toBe(true)
  })
  it('exports only portable fields, excluding session and machine metadata', () => {
    const original = data()
    const extra = { ...original, token: 'SESSION-SECRET', gitWorkflow: { remote: 'MACHINE-ALIAS' }, repositories: original.repositories.map((repo) => ({ ...repo, localPath: '/home/private/checkout', token: 'REPO-SECRET' })) }
    const text = JSON.stringify(createPreparationBackup(extra))
    for (const forbidden of ['SESSION-SECRET', 'REPO-SECRET', 'MACHINE-ALIAS', '/home/private', '/home/qa/private.md']) expect(text).not.toContain(forbidden)
  })
  it('previews conflicts and keeps existing data by default without dropping other projects', () => {
    const original = data()
    const incoming = data()
    incoming.repositories[0].profile!.summary = 'Contexto nuevo'
    incoming.repositories.push({ workspace: 'team', repo: 'new' })
    incoming.customRules[0].content = 'Contenido nuevo'
    incoming.personalPreferences.instructions = '4 espacios'
    const plan = planPreparationRestore(original, createPreparationBackup(incoming), 'keep')
    expect(plan.conflicts).toHaveLength(1)
    expect(plan.ruleConflicts).toHaveLength(1)
    expect(plan.preferencesDiffer).toBe(true)
    expect(plan.added).toHaveLength(1)
    expect(plan.data.repositories[0].profile?.summary).toBe('Contexto actual')
    expect(plan.data.customRules[0].content).toContain('Rails 5.1')
    expect(plan.data.personalPreferences.instructions).toBe('2 espacios')
  })
  it('restores incoming snapshots deterministically and remains idempotent', () => {
    const original = data()
    const backup = createPreparationBackup(original)
    backup.repositories[0].profile!.summary = 'Restaurado'
    const first = planPreparationRestore(original, backup, 'incoming')
    const second = planPreparationRestore(first.data, backup, 'incoming')
    expect(first.data.repositories[0].profile?.summary).toBe('Restaurado')
    expect(second.data).toEqual(first.data)
    expect(second.conflicts).toEqual([])
    expect(second.ruleConflicts).toEqual([])
  })
  it('preserves an absent official rule snapshot as a local portable rule', () => {
    const backup = createPreparationBackup(data())
    backup.rules.push({ id: 'previous-official', name: 'Regla antigua', category: 'project', description: 'Versión anterior', content: 'Contenido conservado', source: 'git', version: '3' })
    backup.repositories[0].ruleRefs?.push('previous-official@3')
    const plan = planPreparationRestore(data(), backup, 'keep')
    expect(plan.data.customRules.find((rule) => rule.id === 'previous-official')).toMatchObject({ source: 'local', content: 'Contenido conservado' })
    expect(plan.unresolved).toEqual([])
  })
  it('rejects unknown formats, oversized files, invalid fields and duplicate identities', () => {
    expect(() => parsePreparationBackup('{')).toThrow('JSON válido')
    expect(() => parsePreparationBackup(JSON.stringify({ schemaVersion: 1, rules: [] }))).toThrow('bibliotecas antiguas')
    expect(() => parsePreparationBackup(' '.repeat(2_000_001))).toThrow('2 MB')
    const backup = createPreparationBackup(data())
    backup.repositories.push(backup.repositories[0])
    expect(() => parsePreparationBackup(JSON.stringify(backup))).toThrow('duplicados')
    const invalid = { ...createPreparationBackup(data()), personalPreferences: { instructions: 2 } }
    expect(() => parsePreparationBackup(JSON.stringify(invalid))).toThrow('preferencias')
  })
  it('blocks a merge whose combined projects can no longer be exported', () => {
    const original = data()
    original.repositories = Array.from({ length: 200 }, (_, index) => ({ workspace: 'team', repo: `project-${index}` }))
    const incoming = createPreparationBackup(data())
    expect(() => parsePreparationBackup(JSON.stringify(incoming))).not.toThrow()
    const plan = planPreparationRestore(original, incoming, 'keep')
    expect(plan.data.repositories).toHaveLength(201)
    expect(plan.validationError).toContain('proyectos')
    expect(original.repositories).toHaveLength(200)
  })
  it('blocks a merge when separately valid text libraries exceed the combined size limit', () => {
    const original = data()
    const incoming = data()
    const rules = (prefix: string) => Array.from({ length: 6 }, (_, index) => ({ ...original.customRules[0], id: `${prefix}-${index}`, content: 'x'.repeat(180_000) }))
    incoming.customRules = rules('incoming')
    original.customRules = rules('current')
    original.repositories = []
    incoming.repositories = []
    const backup = parsePreparationBackup(JSON.stringify(createPreparationBackup(incoming)))
    expect(planPreparationRestore(original, backup, 'keep').validationError).toContain('2 MB')
  })
})
