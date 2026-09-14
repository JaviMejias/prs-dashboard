import { describe, expect, it } from 'vitest'
import { getAvailableRules, getAvailableRulepacks, getRulepack, resolveRulepacksForRepository, rulepackReference, validateRuleMetadata, validateRulepackCatalog, validateRulepackMetadata } from './rulepacks'

describe('rulepacks', () => {
  it('exposes a versioned catalog and resolves by exact id and version', () => {
    const available = getAvailableRulepacks()
    expect(available.length).toBeGreaterThan(0)
    expect(rulepackReference(available[0].id, available[0].version)).toBe('kontroller-official@1.0.0')
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
    expect(result.rulepacks[0].version).toBe('1.0.0')
    expect(result.unavailable).toEqual(['Rulepack missing@1.0.0'])
  })

  it('exposes reusable rules with stable references and categories', () => {
    const rules = getAvailableRules()
    expect(rules.length).toBeGreaterThan(1)
    expect(rules[0].reference).toMatch(/@1\.0\.0$/)
    expect(rules.some((rule) => rule.category === 'general')).toBe(true)
    expect(validateRuleMetadata(rules[0])).toEqual([])
  })

  it('composes explicit rules in configured order and removes duplicates', () => {
    const rules = getAvailableRules()
    const result = resolveRulepacksForRepository({ workspace: 'w', repo: 'r', ruleRefs: [rules[1].reference, rules[0].reference, rules[1].reference] })
    expect(result.rules.map((rule) => rule.reference)).toEqual(['kontroller-code-style@1.0.0', rules[1].reference, rules[0].reference])
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
      'kontroller-qa-review-summary@1.0.0',
      'kontroller-deep-pr-review@1.0.0',
      'kontroller-code-style@1.0.0',
    ])
  })

  it('resolves the Kontroller repository with general and official rules without duplicates', () => {
    const result = resolveRulepacksForRepository({ workspace: 'kontroller_test', repo: 'kontroller_test', rulepackRefs: ['kontroller-official@1.0.0'] })
    expect(result.unavailable).toEqual([])
    expect(result.rules).toHaveLength(7)
    expect(new Set(result.rules.map((rule) => rule.reference)).size).toBe(7)
    expect(result.rules.every((rule) => rule.rulepackId === 'kontroller-official@1.0.0')).toBe(true)
  })
})
