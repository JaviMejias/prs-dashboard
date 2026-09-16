import { getLifecycleStatus, getReviewDecision, isFreshPullRequest } from './pullRequestReviewState'
import { getIgnoreRules } from './storage'
import type { LifecycleStatus, PrStatus, PullRequest, ReviewDecision, ReviewerState } from '../types'

export type ReviewFilter = 'ALL' | 'ATTENTION' | 'WAITING' | 'REVIEWED'
export type LifecycleFilter = 'ALL' | LifecycleStatus

export const reviewLabels: Record<PrStatus, string> = {
  unreviewed: 'Revisar',
  changes: 'Revisar cambios',
  waiting: 'Esperando al dev',
  current: 'Revisado',
  merged: 'Fusionado',
  declined: 'Rechazado',
}

export const reviewerLabels: Record<ReviewerState, string> = {
  approved: 'aprobó',
  waiting: 'pidió cambios',
  reviewed: 'revisó',
  changes: 'revisó antes de los últimos cambios',
}

export const lifecycleLabels: Record<LifecycleStatus, string> = {
  OPEN: 'Abierto',
  DRAFT: 'Borrador',
  QUEUED: 'En cola',
  MERGED: 'Fusionado',
  DECLINED: 'Rechazado',
}

export const lifecycleFilterLabels: Record<LifecycleFilter, string> = {
  ALL: 'Todos',
  OPEN: 'Abiertos',
  DRAFT: 'Borradores',
  QUEUED: 'En cola',
  MERGED: 'Fusionados',
  DECLINED: 'Rechazados',
}

export const trackedReviewers: Array<{ displayName: string; shortName: string; uuid?: string }> = [
  { displayName: 'Diego Gustavo Cuevas Montes', shortName: 'Diego' },
  { displayName: 'Iván Reyes', shortName: 'Iván' },
]

const reviewPriority: Record<PrStatus, number> = {
  unreviewed: 0,
  changes: 0,
  waiting: 1,
  current: 2,
  merged: 3,
  declined: 4,
}

export function normalizeForRule(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim()
}

export function pullRequestKey(pr: PullRequest) {
  return `${pr.repo.workspace}/${pr.repo.repo}#${pr.id}`
}

export function displayName(name?: string, fallback = 'Usuario desconocido') {
  return name?.trim() || fallback
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : parts[0]?.slice(0, 2).toUpperCase() || '??'
}

export function avatarTone(name: string) {
  return `tone-${Array.from(name).reduce((total, character) => total + character.charCodeAt(0), 0) % 6}`
}

export function relativeTime(date: string) {
  const seconds = Math.round((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'ahora'
  if (seconds < 3600) return `hace ${Math.round(seconds / 60)} min`
  if (seconds < 86400) return `hace ${Math.round(seconds / 3600)} h`
  return `hace ${Math.round(seconds / 86400)} d`
}

export function formatDate(date: string) {
  return new Date(date).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function isIgnoredPullRequest(pr: PullRequest) {
  const rules = getIgnoreRules()
  const author = normalizeForRule(pr.author?.display_name || pr.author?.nickname || '')
  return rules.pullRequests.includes(pullRequestKey(pr))
    || rules.authors.some((item) => normalizeForRule(item) === author)
}

export function requiresReview(pr: PullRequest, uuid?: string, displayName?: string) {
  if (getLifecycleStatus(pr) !== 'OPEN' || isIgnoredPullRequest(pr)) return false
  const status = getReviewDecision(pr, uuid, displayName).status
  return status === 'unreviewed' || status === 'changes'
}

export function getReviewLabel(pr: PullRequest, status: PrStatus) {
  if (isIgnoredPullRequest(pr)) return 'No revisar'
  if (status === 'unreviewed' && isFreshPullRequest(pr)) return 'Nuevo PR'
  return reviewLabels[status]
}

const shortCommit = (hash?: string) => hash?.slice(0, 7)

export function getReviewDecisionDetail(reviewDecision: ReviewDecision) {
  if (reviewDecision.reason === 'new_pr') return 'Sin revisiones previas'
  if (reviewDecision.reason === 'no_review_recorded') return 'No hay una revisión tuya registrada'
  if (reviewDecision.reason === 'reviewer_not_identified') return 'No se pudo identificar al revisor actual'
  if (reviewDecision.reason === 'new_commit_after_review') return `Commit ${shortCommit(reviewDecision.latestCommit) || 'nuevo'} después de tu revisión`
  if (reviewDecision.reason === 'same_commit_after_review' && reviewDecision.reviewedCommit) return `Commit ${shortCommit(reviewDecision.reviewedCommit)} · sin cambios nuevos`
  if (reviewDecision.reason === 'reviewer_activity_after_review') return 'La última actividad registrada pertenece a QA'
  if (reviewDecision.reason === 'updated_after_review') return 'Bitbucket registra actividad posterior a tu revisión'
  if (reviewDecision.reason === 'waiting_for_developer') return 'QA pidió cambios · esperando al desarrollador'
  if (reviewDecision.reason === 'activity_incomplete') return 'Actividad incompleta · no se pudo comparar el commit'
  if (reviewDecision.reason === 'merged') return 'Ciclo completado en Bitbucket'
  if (reviewDecision.reason === 'declined') return 'Ciclo cerrado en Bitbucket'
  return 'Estado actualizado desde Bitbucket'
}

export function matchesReviewFilter(pr: PullRequest, filter: ReviewFilter, uuid?: string, displayName?: string) {
  if (filter === 'ALL') return true
  if (filter === 'ATTENTION') return requiresReview(pr, uuid, displayName)
  if (isIgnoredPullRequest(pr)) return false
  const status = getReviewDecision(pr, uuid, displayName).status
  if (filter === 'WAITING') return status === 'waiting'
  return status === 'current'
}

export function comparePullRequests(first: PullRequest, second: PullRequest, uuid?: string, displayName?: string) {
  const firstPriority = reviewPriority[getReviewDecision(first, uuid, displayName).status]
  const secondPriority = reviewPriority[getReviewDecision(second, uuid, displayName).status]
  if (firstPriority !== secondPriority) return firstPriority - secondPriority
  return new Date(second.updated_on).getTime() - new Date(first.updated_on).getTime()
}

export function getHandoffMessage(pr: PullRequest, status: PrStatus) {
  if (isIgnoredPullRequest(pr)) {
    return {
      label: 'Fuera de tu cola',
      message: 'Permanece disponible en la vista de todos los PR.',
    }
  }

  if (status === 'unreviewed' && isFreshPullRequest(pr)) {
    return {
      label: 'Primera revisión pendiente',
      message: 'Todavía no hay actividad de QA registrada.',
    }
  }

  const messages: Record<PrStatus, { label: string; message: string }> = {
    unreviewed: {
      label: 'Tu turno',
      message: 'Aún no registras actividad en este PR.',
    },
    changes: {
      label: 'Cambios después de tu revisión',
      message: 'El autor actualizó el PR; vuelve a comprobarlo.',
    },
    waiting: {
      label: 'Turno del autor',
      message: 'QA fue el último en actuar; no necesitas revisar todavía.',
    },
    current: {
      label: 'Revisión al día',
      message: 'Tu actividad es posterior al último cambio del autor.',
    },
    merged: {
      label: 'Ciclo completado',
      message: 'Bitbucket registró este PR como fusionado.',
    },
    declined: {
      label: 'Ciclo cerrado',
      message: 'Bitbucket registró este PR como rechazado.',
    },
  }

  return messages[status]
}

export function getLifecycleCounts(prs: PullRequest[]) {
  return prs.reduce<Record<LifecycleFilter, number>>((counts, pr) => {
    counts[getLifecycleStatus(pr)] += 1
    return counts
  }, { ALL: prs.length, OPEN: 0, DRAFT: 0, QUEUED: 0, MERGED: 0, DECLINED: 0 })
}
