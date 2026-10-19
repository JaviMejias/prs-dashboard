import { describe, expect, it } from 'vitest'
import { buildGitReviewInstruction, reviewTargetCountry } from './gitWorkflow'
import type { GitWorkflowSettings, PullRequest, Session } from '../types'

const session: Session = { email: 'qa@example.com', token: 'secret', expiresAt: 0, uuid: '{qa}' }
const settings: GitWorkflowSettings = {
  developerRemotes: [{ id: 'dev', displayName: 'Mathew', remote: 'mathew' }],
  repositoryRemotes: [{ id: 'main', repository: 'team/app', remote: 'origin' }],
  syncRemotesConfirmed: true,
}
const pr: PullRequest = {
  id: 1794, title: 'KON-1794 Validar descuentos', description: 'Corregir cálculo', state: 'OPEN',
  created_on: '2026-10-01T10:00:00Z', updated_on: '2026-10-02T10:00:00Z',
  author: { display_name: 'Mathew' }, source: { branch: { name: 'KON-1794' }, repository: { full_name: 'dev/fork' } },
  destination: { branch: { name: 'propyme_production' }, repository: { full_name: 'team/app' } },
  repo: { workspace: 'team', repo: 'app' },
}

describe('local review instruction', () => {
  it.each(['propyme_production', 'propyme_staging', 'PINE', 'pine/production'])('identifies Chile from destination %s', (branch) => {
    expect(reviewTargetCountry(branch)).toBe('Chile (según la rama destino)')
  })
  it('distinguishes explicit Peru, inferred Peru and missing destinations', () => {
    expect(reviewTargetCountry('peru')).toBe('Perú (según la rama destino)')
    expect(reviewTargetCountry('production')).toContain('inferido')
    expect(reviewTargetCountry(undefined)).toContain('no determinado')
  })
  it('includes PR identity and resolves fork and destination remotes independently', () => {
    const instruction = buildGitReviewInstruction(pr, session, settings)
    expect(instruction.text).toContain('PR #1794: KON-1794 Validar descuentos')
    expect(instruction.sourceRemote).toBe('mathew')
    expect(instruction.targetRemote).toBe('origin')
    expect(instruction.targetCountry).toContain('Chile')
    expect(instruction.isComplete).toBe(true)
    expect(instruction.remotesConfirmed).toBe(true)
  })
  it('does not invent aliases when they are not configured', () => {
    const instruction = buildGitReviewInstruction(pr, session, { developerRemotes: [], repositoryRemotes: [], syncRemotesConfirmed: false })
    expect(instruction.sourceRemote).toBeNull()
    expect(instruction.targetRemote).toBeNull()
    expect(instruction.isComplete).toBe(false)
    expect(instruction.remotesConfirmed).toBe(false)
    expect(instruction.text).toContain('sin configurar')
  })
})
