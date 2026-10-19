const ALLOWED_BITBUCKET_HOSTS = new Set(['bitbucket.org', 'www.bitbucket.org'])

export function safeBitbucketUrl(value: string | undefined) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && ALLOWED_BITBUCKET_HOSTS.has(url.hostname.toLowerCase())
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}
