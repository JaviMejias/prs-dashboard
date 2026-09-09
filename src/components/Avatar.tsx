import type { ReviewerState } from '../types'
import { avatarTone, initials } from '../lib/dashboard'

export default function Avatar({
  name,
  state,
  size = 'medium',
}: {
  name: string
  state?: ReviewerState | null
  size?: 'small' | 'medium' | 'large'
}) {
  return (
    <span
      className={`avatar avatar-${size} ${avatarTone(name)} ${state ? `avatar-state-${state}` : ''}`}
      title={name}
      aria-label={name}
    >
      {initials(name)}
    </span>
  )
}
