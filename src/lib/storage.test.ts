import { describe, expect, it } from 'vitest'
import { kontrollerTestTechnologies, migrateKontrollerRepository } from './storage'

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
})
