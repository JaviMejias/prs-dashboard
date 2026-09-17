import { getLifecycleStatus, getReviewDecision, getReviewerState, isFreshPullRequest } from './pullRequestReviewState'
import { displayName, requiresReview } from './dashboard'
import type { AppliedReviewRule, AppliedRulepack, PullRequest, PullRequestActivity, RepoConfig, ReviewContext, ReviewContextActivity, Session } from '../types'

type ReviewContextDetails = Pick<ReviewContext, 'commits' | 'changedFiles' | 'diffstat' | 'comments'> & {
  activity: PullRequestActivity[]
  unavailable: string[]
}

const activityDate = (item: PullRequestActivity) => item.update?.date || item.comment?.updated_on || item.comment?.created_on || item.approval?.date
const activityActor = (item: PullRequestActivity) => item.update?.author?.display_name || item.comment?.user?.display_name || item.approval?.user?.display_name

function normalizeActivity(pr: PullRequest, activity: PullRequestActivity[]): ReviewContextActivity[] {
  const result: ReviewContextActivity[] = [
    { type: 'created', date: pr.created_on, summary: 'Pull request creado' },
  ]
  activity.forEach((item) => {
    const date = activityDate(item)
    if (!date) return
    if (item.update) {
      result.push({ type: item.update.state === 'OPEN' ? 'updated' : 'changes', date, actor: activityActor(item), summary: item.update.state ? `Pull request actualizado: ${item.update.state}` : 'Pull request actualizado' })
    } else if (item.comment && !item.comment.deleted) {
      result.push({ type: 'comment', date, actor: activityActor(item), summary: 'Comentario añadido' })
    } else if (item.approval) {
      result.push({ type: 'approval', date, actor: activityActor(item), summary: 'Pull request aprobado' })
    }
  })
  if (pr.updated_on !== pr.created_on && !result.some((item) => item.date === pr.updated_on)) {
    result.push({ type: 'updated', date: pr.updated_on, summary: 'Pull request actualizado' })
  }
  return result.sort((first, second) => new Date(first.date).getTime() - new Date(second.date).getTime())
}

export function buildReviewContext(pr: PullRequest, session: Session, details: ReviewContextDetails, rulepacks: AppliedRulepack[] = [], rules: AppliedReviewRule[] = []): ReviewContext {
  const identity = displayName(session.displayName, session.email)
  const status = getReviewDecision(pr, session.uuid, session.displayName).status
  const activity = normalizeActivity(pr, details.activity)
  const isRevisit = Boolean(getReviewerState(pr, identity, session.uuid))
  return {
    schemaVersion: 1,
    repository: {
      workspace: pr.repo.workspace,
      repository: pr.repo.repo,
      url: pr.destination?.repository?.links?.html?.href || `https://bitbucket.org/${pr.repo.workspace}/${pr.repo.repo}`,
      technologies: pr.repo.technologies,
    },
    pullRequest: {
      id: pr.id,
      title: pr.title,
      description: pr.description,
      state: getLifecycleStatus(pr),
      draft: Boolean(pr.draft),
      author: pr.author ? { name: pr.author.display_name || pr.author.nickname, uuid: pr.author.uuid, url: pr.source?.repository?.links?.html?.href } : undefined,
      sourceBranch: pr.source?.branch?.name,
      targetBranch: pr.destination?.branch?.name,
      createdAt: pr.created_on,
      updatedAt: pr.updated_on,
      url: pr.links?.html?.href,
    },
    reviewState: {
      isNew: status === 'unreviewed' && isFreshPullRequest(pr),
      requiresReview: requiresReview(pr, session.uuid, session.displayName),
      isRevisit,
      status,
      lastRelevantActivity: activity[activity.length - 1],
    },
    commits: details.commits,
    changedFiles: details.changedFiles,
    diffstat: {
      ...details.diffstat,
      totalChanges: details.diffstat.additions + details.diffstat.deletions,
    },
    comments: details.comments,
    activity,
    unavailable: details.unavailable,
    rulepacks,
    rules,
  }
}

const markdownValue = (value?: string) => value || 'No disponible'
const markdownLink = (label: string, url?: string) => url ? `[${label}](${url})` : label
const markdownCode = (value: string) => `\`${value}\``

export function buildReviewContextMarkdown(context: ReviewContext) {
  const { repository, pullRequest, reviewState } = context
  const lines = [
    '# Pull Request',
    '',
    '## Repository',
    '',
    `- Workspace: ${repository.workspace}`,
    `- Repositorio: ${repository.repository}`,
    `- URL: ${markdownLink(repository.url || 'Abrir repositorio', repository.url)}`,
    '',
    '## Technologies',
    '',
    repository.technologies?.length ? repository.technologies.map((technology) => `- ${technology.name} ${technology.version} · ${technology.kind}`).join('\n') : 'No hay tecnologías/versiones configuradas.',
    '',
    '## Pull Request',
    '',
    `- ID: #${pullRequest.id}`,
    `- Título: ${pullRequest.title}`,
    `- Estado: ${pullRequest.state}${pullRequest.draft ? ' · Draft' : ''}`,
    `- Autor: ${markdownLink(markdownValue(pullRequest.author?.name), pullRequest.author?.url)}`,
    `- Creado: ${pullRequest.createdAt}`,
    `- Actualizado: ${pullRequest.updatedAt}`,
    `- URL: ${markdownLink(pullRequest.url || 'Abrir PR', pullRequest.url)}`,
    '',
    '## Review state',
    '',
    `- PR nuevo: ${reviewState.isNew ? 'Sí' : 'No'}`,
    `- Requiere revisión: ${reviewState.requiresReview ? 'Sí' : 'No'}`,
    `- Revisión posterior: ${reviewState.isRevisit ? 'Sí' : 'No'}`,
    `- Estado calculado: ${reviewState.status}`,
    `- Última actividad relevante: ${reviewState.lastRelevantActivity?.summary || 'No disponible'}`,
    '',
    '## Branches',
    '',
    `- Desde: ${markdownValue(pullRequest.sourceBranch)}`,
    `- Hacia: ${markdownValue(pullRequest.targetBranch)}`,
    '',
    '## Commits',
    '',
    context.commits.length ? context.commits.map((commit) => `- ${markdownCode(commit.hash.slice(0, 12))} ${markdownLink(commit.message, commit.url)}${commit.author ? ` · ${commit.author}` : ''}${commit.date ? ` · ${commit.date}` : ''}`).join('\n') : 'No hay commits disponibles.',
    '',
    '## Changed files',
    '',
    context.changedFiles.length ? context.changedFiles.map((file) => `- ${markdownCode(file.path)}${file.status ? ` · ${file.status}` : ''}${file.additions !== undefined ? ` · +${file.additions}` : ''}${file.deletions !== undefined ? ` · -${file.deletions}` : ''}`).join('\n') : 'No hay archivos modificados disponibles.',
    '',
    '## Diffstat',
    '',
    `- Archivos: ${context.diffstat.files}`,
    `- Añadidas: +${context.diffstat.additions}`,
    `- Eliminadas: -${context.diffstat.deletions}`,
    `- Total de cambios: ${context.diffstat.totalChanges}`,
    '',
    '## Review comments',
    '',
    context.comments.length ? context.comments.map((comment) => `- **${markdownValue(comment.author)}**${comment.parentId ? ' · respuesta' : ''}${comment.date ? ` · ${comment.date}` : ''}${comment.path ? ` · ${markdownCode(`${comment.path}${comment.line ? `:${comment.line}` : ''}`)}` : ''}: ${comment.content}`).join('\n') : 'No hay comentarios disponibles.',
    '',
    '## Relevant activity',
    '',
    context.activity.map((item) => `- ${item.date} · **${item.type}**${item.actor ? ` · ${item.actor}` : ''} · ${item.summary}`).join('\n'),
  ]
  lines.push('', '## Applicable review rules', '')
  if (context.rules.length) context.rules.forEach((rule) => lines.push(`### ${rule.name}`, '', `- Categoría: ${rule.category}${rule.technology ? ` · ${rule.technology}` : ''}${rule.version ? ` · ${rule.version}` : ''}`, `- Referencia: ${rule.reference}`, '', rule.content.trim()))
  else if (context.rulepacks.length) context.rulepacks.forEach((rulepack) => lines.push(`### ${rulepack.name} — ${rulepack.version}`, '', rulepack.description, '', rulepack.reviewRulesContent.trim() || 'No disponible.'))
  else lines.push('Sin reglas de revisión configuradas para este repositorio.')
  if (context.rulepacks.some((rulepack) => rulepack.testingContent?.trim() || rulepack.referenceContents.length)) {
    lines.push('', '## Testing and references', '')
    context.rulepacks.forEach((rulepack) => {
      if (rulepack.testingContent?.trim()) lines.push(`### ${rulepack.name} · Testing`, '', rulepack.testingContent.trim())
      rulepack.referenceContents.forEach((reference) => lines.push(`### ${reference.path}`, '', reference.content.trim()))
    })
  }
  if (context.unavailable.length) {
    lines.push('', '## Información no disponible', '', ...context.unavailable.map((item) => `- No fue posible obtener ${item}.`))
  }
  return lines.join('\n')
}

export const buildReviewContextJson = (context: ReviewContext) => JSON.stringify(context, null, 2)

export function buildApplicableRulesMarkdown(context: ReviewContext) {
  if (!context.rules.length) return 'Sin reglas de revisión configuradas para este repositorio.'
  return ['# Applicable review rules', '', ...context.rules.flatMap((rule) => [`## ${rule.name}`, '', `- Categoría: ${rule.category}${rule.technology ? ` · ${rule.technology}` : ''}${rule.version ? ` · ${rule.version}` : ''}`, `- Referencia: ${rule.reference}`, '', rule.content.trim(), ''])].join('\n').trim()
}

export function buildRepositoryCodexConfiguration(repo: RepoConfig, rules: AppliedReviewRule[], unavailable: string[] = []) {
  const technologyLines = repo.technologies?.length
    ? repo.technologies.map((technology) => `- ${technology.name} ${technology.version} · ${technology.kind}`)
    : ['No hay tecnologías/versiones configuradas.']
  const ruleLines = rules.length
    ? rules.flatMap((rule) => [
      `## ${rule.name}`,
      '',
      `- Categoría: ${rule.category}`,
      `- Referencia: ${rule.reference}`,
      ...(rule.technology ? [`- Tecnología: ${rule.technology}`] : []),
      ...(rule.version ? [`- Versión de la regla: ${rule.version}`] : []),
      '',
      rule.content.trim(),
      '',
    ])
    : ['No hay reglas de revisión configuradas.']
  return [
    '# Configuración de revisión para Codex',
    '',
    'Estas instrucciones definen el contexto y las reglas que debes respetar al revisar este proyecto.',
    'No inventes reglas adicionales ni modernices el proyecto fuera del alcance de la revisión.',
    '',
    '## Proyecto / Repository',
    '',
    `- Workspace: ${repo.workspace}`,
    `- Repositorio: ${repo.repo}`,
    '',
    '## Tecnologías y versiones',
    '',
    ...technologyLines,
    '',
    '## Reglas aplicables',
    '',
    ...ruleLines,
    '## Cómo interpretar estas reglas',
    '',
    '- Trata cada regla como una instrucción explícita de revisión.',
    '- Respeta la categoría, tecnología y versión indicada.',
    '- Si una regla entra en conflicto con otra, señala el conflicto y prioriza la regla más específica del proyecto.',
    '- Reporta únicamente problemas sustentados por el código, el diff y estas reglas.',
    ...(unavailable.length ? ['', '## Referencias no disponibles', '', ...unavailable.map((item) => `- ${item}`)] : []),
  ].join('\n')
}

export function buildCodexPreparation(context: ReviewContext) {
  return [
    '# Instrucciones para Codex',
    '',
    'Quiero que revises este Pull Request dentro de la carpeta del proyecto.',
    'Respeta las reglas y las tecnologías indicadas. No realices cambios en el código.',
    'Prioriza bugs, regresiones, seguridad, compatibilidad, rendimiento y problemas funcionales.',
    'No modernices el proyecto fuera del alcance del PR ni reportes problemas puramente cosméticos.',
    '',
    buildReviewContextMarkdown(context),
  ].join('\n')
}
