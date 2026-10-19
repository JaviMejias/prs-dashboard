import { getReviewerState } from './pullRequestReviewState'
import { displayName } from './dashboard'
import type { GitWorkflowSettings, PullRequest, Session } from '../types'

const normalize = (value?: string) => value?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim() || ''

export type GitReviewInstruction = {
  text: string
  sourceRemote: string | null
  targetRemote: string | null
  sourceRepository: string
  targetRepository: string
  sourceBranch: string
  targetBranch: string
  isRevisit: boolean
  isComplete: boolean
  targetCountry: string
  remotesConfirmed: boolean
}

export function reviewTargetCountry(branch?: string) {
  const target = normalize(branch)
  if (!target || target === '?') return 'País no determinado: falta la rama destino'
  if (target.startsWith('propyme') || target.startsWith('pine')) return 'Chile (según la rama destino)'
  if (target === 'peru' || target.startsWith('peru_') || target.startsWith('peru/')) return 'Perú (según la rama destino)'
  return 'Perú (inferido por la regla del proyecto; confirmar si es una excepción)'
}

const repositoryName = (pr: PullRequest, side: 'source' | 'destination') => {
  const repository = pr[side]?.repository?.full_name
  return repository || `${pr.repo.workspace}/${pr.repo.repo}`
}

const remoteForRepository = (repository: string, settings: GitWorkflowSettings) => {
  const match = settings.repositoryRemotes.find((item) => normalize(item.repository) === normalize(repository))
  return match?.remote.trim() || null
}

const remoteForAuthor = (pr: PullRequest, settings: GitWorkflowSettings) => {
  const author = normalize(pr.author?.display_name || pr.author?.nickname)
  const match = settings.developerRemotes.find((item) => normalize(item.displayName) === author || (pr.author?.uuid && item.id === pr.author.uuid))
  return match?.remote.trim() || null
}

export function buildGitReviewInstruction(pr: PullRequest, session: Session, settings: GitWorkflowSettings): GitReviewInstruction {
  const sourceRepository = repositoryName(pr, 'source')
  const targetRepository = repositoryName(pr, 'destination')
  const sourceRemote = remoteForAuthor(pr, settings) || remoteForRepository(sourceRepository, settings)
  const targetRemote = remoteForRepository(targetRepository, settings)
  const sourceBranch = pr.source?.branch?.name || '?'
  const targetBranch = pr.destination?.branch?.name || '?'
  const identity = displayName(session.displayName, session.email)
  const isRevisit = Boolean(getReviewerState(pr, identity, session.uuid))
  const prefix = isRevisit ? 'Seguimiento' : 'Revisión sin antecedente personal registrado'
  const targetCountry = reviewTargetCountry(targetBranch)

  return {
    text: `${prefix} del PR #${pr.id}: ${pr.title}. Destino: ${targetCountry}. ${sourceRemote || 'Remoto origen sin configurar'}/${sourceBranch} → ${targetRemote || 'Remoto destino sin configurar'}/${targetBranch}. Al copiar se incluyen descripción, cambios y conversaciones de Bitbucket.`,
    sourceRemote,
    targetRemote,
    sourceRepository,
    targetRepository,
    sourceBranch,
    targetBranch,
    isRevisit,
    isComplete: Boolean(sourceRemote && targetRemote && sourceBranch !== '?' && targetBranch !== '?'),
    targetCountry,
    remotesConfirmed: settings.syncRemotesConfirmed,
  }
}

export const getGitRemotesCommand = () => 'git sync-remotes'
