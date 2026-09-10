import { classifyPr, getLifecycleStatus } from './bitbucket'
import { displayName, isIgnoredPullRequest, pullRequestKey, requiresReview } from './dashboard'
import type {
  Notice,
  NoticeKind,
  LifecycleStatus,
  NotificationSnapshot,
  NotificationSnapshotEntry,
  PullRequest,
  RepoConfig,
} from '../types'

export const PULL_REQUEST_POLL_INTERVAL_MS = 60_000

export type NoticePresentationTone = NoticeKind
  | 'waiting'
  | 'current'
  | 'ignored'
  | 'draft'
  | 'queued'
  | 'merged'
  | 'declined'

export type NoticePresentation = {
  tone: NoticePresentationTone
  label: string
  detail?: string
  resolved: boolean
}

export function repositoryKey(repo: RepoConfig) {
  return `${repo.workspace}/${repo.repo}`
}

export function repositorySnapshotKey(repo: RepoConfig) {
  return `@repo:${repositoryKey(repo)}`
}

export function getObservedRepositories(snapshot: NotificationSnapshot) {
  const repositories = new Set<string>()

  Object.keys(snapshot).forEach((key) => {
    if (key.startsWith('@repo:')) {
      repositories.add(key.slice('@repo:'.length))
      return
    }

    const separatorIndex = key.lastIndexOf('#')
    if (separatorIndex > 0) repositories.add(key.slice(0, separatorIndex))
  })

  return repositories
}

export function getActionableNoticeKind(
  previous: string | NotificationSnapshotEntry | undefined,
  current: NotificationSnapshotEntry,
  hasRepositoryBaseline: boolean,
): NoticeKind | null {
  if (!hasRepositoryBaseline || !current.needsReview) return null
  if (!previous) return 'new-pr'

  const previousUpdatedOn = typeof previous === 'string' ? previous : previous.updatedOn
  if (previousUpdatedOn === current.updatedOn) return null
  if (typeof previous !== 'string' && previous.needsReview) return null

  return 'review-required'
}

export function createPullRequestNotice(pr: PullRequest, kind: NoticeKind, createdAt = Date.now()): Notice {
  const actorName = displayName(pr.author?.display_name || pr.author?.nickname, 'Autor desconocido')
  const action = kind === 'new-pr' ? 'abrió' : 'actualizó'

  return {
    id: `${pullRequestKey(pr)}-${pr.updated_on}-${kind}`,
    text: `${actorName} ${action} ${pr.title}`,
    createdAt,
    read: false,
    kind,
    actorName,
    actorUrl: pr.source?.repository?.links?.html?.href,
    action,
    pullRequestTitle: pr.title,
    pullRequestUrl: pr.links?.html?.href,
    repositoryName: pr.repo.repo,
    pullRequestId: pr.id,
    pullRequestKey: pullRequestKey(pr),
  }
}

export function noticeReferencesPullRequest(notice: Notice, pr: PullRequest) {
  if (notice.pullRequestKey) return notice.pullRequestKey === pullRequestKey(pr)
  if (notice.pullRequestUrl && pr.links?.html?.href) return notice.pullRequestUrl === pr.links.html.href
  return notice.repositoryName === pr.repo.repo && notice.pullRequestId === pr.id
}

export function getNoticePresentation(
  notice: Notice,
  pullRequest?: PullRequest,
  reviewerUuid?: string,
): NoticePresentation {
  const historical: NoticePresentation = {
    tone: notice.kind,
    label: notice.kind === 'new-pr' ? 'Nuevo PR' : 'Revisar',
    resolved: false,
  }

  if (!pullRequest) return historical

  const lifecycle = getLifecycleStatus(pullRequest)
  const lifecyclePresentation: Partial<Record<LifecycleStatus, NoticePresentation>> = {
    DRAFT: {
      tone: 'draft',
      label: 'Borrador',
      detail: 'Ahora es borrador y salió de tu cola de revisión.',
      resolved: true,
    },
    QUEUED: {
      tone: 'queued',
      label: 'En cola',
      detail: 'Ahora está en cola para fusionarse.',
      resolved: true,
    },
    MERGED: {
      tone: 'merged',
      label: 'Fusionado',
      detail: 'El PR ya fue fusionado.',
      resolved: true,
    },
    DECLINED: {
      tone: 'declined',
      label: 'Rechazado',
      detail: 'El PR fue cerrado sin fusionarse.',
      resolved: true,
    },
  }

  const closedPresentation = lifecyclePresentation[lifecycle]
  if (closedPresentation) return closedPresentation
  if (requiresReview(pullRequest, reviewerUuid)) return historical

  if (isIgnoredPullRequest(pullRequest)) {
    return {
      tone: 'ignored',
      label: 'No revisar',
      detail: 'Ahora está fuera de tu cola personal.',
      resolved: true,
    }
  }

  const status = classifyPr(pullRequest, reviewerUuid)
  if (status === 'waiting') {
    return {
      tone: 'waiting',
      label: 'Esperando al dev',
      detail: 'Ahora el turno es del autor.',
      resolved: true,
    }
  }

  return {
    tone: 'current',
    label: 'Revisado',
    detail: 'La revisión ya está al día.',
    resolved: true,
  }
}
