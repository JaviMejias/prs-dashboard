import { describe, expect, it } from 'vitest'
import { getAvailableRules, getAvailableRulepacks, getRulepack, resolveRulepacksForRepository, rulepackReference, updateLocalRule, validateRuleMetadata, validateRulepackCatalog, validateRulepackMetadata } from './rulepacks'
import type { ReviewRule } from '../types'

describe('rulepacks', () => {
  it('exposes the current version and keeps unsupported version selectors unavailable', () => {
    const available = getAvailableRulepacks()
    expect(available.length).toBeGreaterThan(0)
    expect(rulepackReference(available[0].id, available[0].version)).toBe('kontroller-official@1.1.0')
    expect(getRulepack('kontroller-official@1.0.0')?.name).toBe('Reglas oficiales de revisión de Kontroller')
    expect(getRulepack('kontroller-official@latest')).toBeUndefined()
  })

  it('reports invalid metadata and missing referenced files', () => {
    expect(validateRulepackMetadata({ id: '', name: '', version: '', description: '', reviewRules: 'rules.md' }, {})).toEqual([
      'falta id', 'falta name', 'falta version', 'falta description', 'no existe el archivo rules.md',
    ])
  })

  it('detects duplicate catalog references', () => {
    const fixture = { id: 'sample', name: 'Sample', version: '1.0.0', description: 'Sample', reviewRules: 'rules.md', source: 'local' as const, contents: { 'rules.md': '# rules' } }
    expect(validateRulepackCatalog([fixture, fixture])).toContain('Rulepack duplicado: sample@1.0.0')
  })

  it('supports multiple repository mappings and keeps missing ones explicit', () => {
    const result = resolveRulepacksForRepository({ workspace: 'kontroller_test', repo: 'kontroller_test', rulepackRefs: ['kontroller-official@1.0.0', 'missing@1.0.0'] })
    expect(result.rulepacks).toHaveLength(1)
    expect(result.rulepacks[0].version).toBe('1.1.0')
    expect(result.unavailable).toEqual(['Rulepack missing@1.0.0'])
  })

  it('exposes reusable rules with stable references and categories', () => {
    const rules = getAvailableRules()
    expect(rules.length).toBeGreaterThan(1)
    expect(rules[0].reference).toMatch(/@1\.1\.0$/)
    expect(rules.some((rule) => rule.category === 'general')).toBe(true)
    expect(validateRuleMetadata(rules[0])).toEqual([])
  })

  it('composes explicit rules in configured order and removes duplicates', () => {
    const rules = getAvailableRules()
    const result = resolveRulepacksForRepository({ workspace: 'w', repo: 'r', ruleRefs: [rules[1].reference, rules[0].reference, rules[1].reference] })
    expect(result.rules.map((rule) => rule.reference)).toEqual([
      'kontroller-qa-review-summary@1.1.0',
      'kontroller-deep-pr-review@1.1.0',
      'kontroller-code-style@1.1.0',
      'kontroller-review-guidelines@1.1.0',
    ])
    expect(result.unavailable).toEqual([])
  })

  it('expands the official source pack without losing its compatibility mapping', () => {
    const result = resolveRulepacksForRepository({ workspace: 'w', repo: 'r', rulepackRefs: ['kontroller-official@1.0.0'] })
    expect(result.rulepacks).toHaveLength(1)
    expect(result.rules.length).toBeGreaterThan(1)
    expect(new Set(result.rules.map((rule) => rule.reference)).size).toBe(result.rules.length)
  })

  it('does not activate project rules for an unrelated repository', () => {
    const result = resolveRulepacksForRepository({ workspace: 'other', repo: 'repo' })
    expect(result.rules.map((rule) => rule.reference)).toEqual([
      'kontroller-qa-review-summary@1.1.0',
      'kontroller-deep-pr-review@1.1.0',
      'kontroller-code-style@1.1.0',
    ])
  })

  it('resolves the Kontroller repository with general and official rules without duplicates', () => {
    const result = resolveRulepacksForRepository({ workspace: 'kontroller_test', repo: 'kontroller_test', rulepackRefs: ['kontroller-official@1.0.0'] })
    expect(result.unavailable).toEqual([])
    expect(result.rules).toHaveLength(7)
    expect(new Set(result.rules.map((rule) => rule.reference)).size).toBe(7)
    expect(result.rules.every((rule) => rule.rulepackId === 'kontroller-official@1.1.0')).toBe(true)
  })

  it('migrates supported official 1.0 references to the portable 1.1 rules without duplicates', () => {
    const result = resolveRulepacksForRepository({ workspace: 'team', repo: 'legacy', rulepackRefs: ['kontroller-official@1.0.0', 'kontroller-official@1.1.0'], ruleRefs: ['kontroller-review-guidelines@1.0.0', 'kontroller-review-guidelines@1.1.0'] })
    expect(result.unavailable).toEqual([])
    expect(result.rulepacks).toHaveLength(1)
    expect(result.rulepacks[0].version).toBe('1.1.0')
    expect(result.rules).toHaveLength(7)
    expect(result.rules.every((rule) => rule.version === '1.1.0')).toBe(true)
    expect(getRulepack('kontroller-official@9.0.0')).toBeUndefined()
  })

  it('keeps repository associations when a local rule changes version, preserving other versions', () => {
    const rule: ReviewRule = { id: 'custom', name: 'Custom', description: 'Project rule', category: 'project', version: '1', content: 'Original', source: 'local' }
    const updated = { ...rule, version: '2', content: 'Updated' }
    const result = updateLocalRule([rule, { ...rule, version: '0' }], [{ workspace: 'w', repo: 'one', ruleRefs: ['custom@1'] }, { workspace: 'w', repo: 'two', ruleRefs: ['custom@0'] }], updated, 'custom@1')
    expect(result.repos[0].ruleRefs).toEqual(['custom@2'])
    expect(result.repos[1].ruleRefs).toEqual(['custom@0'])
    expect(resolveRulepacksForRepository(result.repos[0], result.rules).rules.some((item) => item.content === 'Updated')).toBe(true)
    expect(result.rules.find((item) => item.version === '0')?.content).toBe('Original')
  })

  it('rejects overwriting another version or an official rule through a local edit', () => {
    const rule: ReviewRule = { id: 'custom', name: 'Custom', description: 'Project rule', category: 'project', version: '1', content: 'Original', source: 'local' }
    expect(() => updateLocalRule([rule, { ...rule, version: '2' }], [], { ...rule, version: '2' }, 'custom@1')).toThrow('Ya existe')
    expect(() => updateLocalRule([], [], { ...rule, id: 'kontroller-review-guidelines' })).toThrow('regla oficial')
  })
})
