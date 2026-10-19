import { describe, expect, it } from 'vitest'
import { buildProjectDiscoveryPrompt, buildProjectProfileMarkdown, emptyProjectProfile, isPreparationRepository, parseProjectDiscovery, safeDocumentationUrl, technologyReference } from './projectPreparation'
import type { RepoConfig } from '../types'

const repo: RepoConfig = { workspace: 'team', repo: 'app', technologies: [{ id: 'ruby', name: 'Ruby', version: '2.4.3', kind: 'language' }] }
const result = () => ({ schemaVersion: 1, repository: 'team/app', profile: { summary: 'Gestión de pedidos', architecture: 'Monolito Rails; multitenancy no confirmado', reviewGuidelines: 'Revisar aislamiento de datos solo si hay evidencia.', evidence: 'README.md:2; Gemfile.lock:12', unknowns: 'PWA no confirmada' }, technologies: [{ name: 'Rails', version: '5.1.7', kind: 'framework', evidence: 'Gemfile.lock:12' }] })

describe('project preparation', () => {
  it('asks for a bounded read-only recognition with evidence and no invented modern APIs', () => {
    const prompt = buildProjectDiscoveryPrompt(repo)
    expect(prompt).toContain('no una auditoría exhaustiva')
    expect(prompt).toContain('No modifiques archivos')
    expect(prompt).toContain('Gemfile.lock')
    expect(prompt).toContain('No uses documentación moderna')
    expect(prompt).toContain('team/app')
    expect(prompt).toContain('unknowns')
    expect(prompt).toContain('no inventes funcionalidades')
  })
  it('accepts a fenced JSON result as a draft and preserves explicit review switches', () => {
    const parsed = parseProjectDiscovery('```json\n' + JSON.stringify(result()) + '\n```', { ...repo, profile: { ...emptyProjectProfile(), usePersonalPreferences: false, useLegacyRules: false } })
    expect(parsed.profile.summary).toBe('Gestión de pedidos')
    expect(parsed.profile.usePersonalPreferences).toBe(false)
    expect(parsed.profile.useLegacyRules).toBe(false)
    expect(parsed.technologies[0]).toMatchObject({ name: 'Rails', version: '5.1.7', evidence: 'Gemfile.lock:12' })
  })
  it('rejects wrong projects, malformed results and unsafe documentation URLs', () => {
    expect(() => parseProjectDiscovery('{', repo)).toThrow('JSON completo')
    expect(() => parseProjectDiscovery(JSON.stringify({ ...result(), repository: 'other/app' }), repo)).toThrow('no corresponde')
    expect(() => parseProjectDiscovery(JSON.stringify({ ...result(), profile: {} }), repo)).toThrow('La ficha')
    const invalid = result()
    const unsafeResult = { ...invalid, technologies: [...invalid.technologies, { name: 'Other', version: '1', kind: 'language', evidence: '', documentationUrl: 'javascript:alert(1)' }] }
    expect(() => parseProjectDiscovery(JSON.stringify(unsafeResult), repo)).toThrow('HTTPS')
  })
  it('does not interpret pasted capabilities as confirmed without documenting uncertainty', () => {
    const draft = parseProjectDiscovery(JSON.stringify(result()), repo)
    const prompt = buildProjectProfileMarkdown({ ...repo, ...draft })
    expect(prompt).toContain('multitenancy no confirmado')
    expect(prompt).toContain('PWA no confirmada')
    expect(prompt).toContain('Gemfile.lock:12')
  })
  it('excludes personal instructions when they are disabled for a project', () => {
    const profile = { ...emptyProjectProfile(), usePersonalPreferences: false }
    expect(buildProjectProfileMarkdown({ ...repo, profile }, { instructions: 'PRIVATE-PREFERENCE' })).not.toContain('PRIVATE-PREFERENCE')
    expect(buildProjectProfileMarkdown({ ...repo, profile })).toContain('no aplicadas')
  })
  it('distinguishes patch-specific Rails docs from Ruby series documentation', () => {
    expect(technologyReference({ id: 'rails', name: 'Rails', version: '5.1.7', kind: 'framework' })?.url).toBe('https://api.rubyonrails.org/v5.1.7/')
    expect(technologyReference(repo.technologies![0])?.label).toContain('no del parche')
    expect(technologyReference({ id: 'unknown', name: 'Unknown', version: '9', kind: 'framework' })).toBeNull()
    expect(safeDocumentationUrl('https://user:secret@example.com')).toBeNull()
    expect(safeDocumentationUrl('http://example.com')).toBeNull()
  })
  it('validates project fields without inventing aliases or accepting executable references', () => {
    expect(isPreparationRepository({ ...repo, profile: emptyProjectProfile() })).toBe(true)
    expect(isPreparationRepository({ ...repo, repo: '../app' })).toBe(false)
    expect(isPreparationRepository({ ...repo, technologies: [{ ...repo.technologies![0], documentationUrl: 'data:text/html,test' }] })).toBe(false)
  })
})
