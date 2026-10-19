import { describe, expect, it } from 'vitest'
import { safeBitbucketUrl } from './externalLinks'

describe('safeBitbucketUrl', () => {
  it('accepts HTTPS links hosted by Bitbucket Cloud', () => {
    expect(safeBitbucketUrl('https://bitbucket.org/workspace/repo/pull-requests/1')).toBe('https://bitbucket.org/workspace/repo/pull-requests/1')
  })

  it.each([
    'javascript:alert(1)',
    'https://evil.example/pr/1',
    'http://bitbucket.org/workspace/repo/pull-requests/1',
    'not a URL',
  ])('rejects unsafe or malformed links: %s', (value) => {
    expect(safeBitbucketUrl(value)).toBeUndefined()
  })
})
