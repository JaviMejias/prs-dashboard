import { getReviewerState } from './bitbucket'
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
  const prefix = isRevisit ? 'Volvemos a revisar este PR' : 'Revisemos este PR'
  const source = sourceRemote || 'remoto-origen'
  const target = targetRemote || 'remoto-destino'
  const sync = settings.syncRemotesConfirmed ? ' Remotos actualizados.' : ''

  return {
    text: `${prefix} desde el remoto ${source}, rama ${sourceBranch}, hacia el remoto ${target}, rama ${targetBranch}.${sync}`,
    sourceRemote,
    targetRemote,
    sourceRepository,
    targetRepository,
    sourceBranch,
    targetBranch,
    isRevisit,
    isComplete: Boolean(sourceRemote && targetRemote && sourceBranch !== '?' && targetBranch !== '?'),
  }
}

export const getGitRemotesCommand = () => 'git sync-remotes'
