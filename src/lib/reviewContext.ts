import { getLifecycleStatus, getReviewDecision, getReviewerState, isFreshPullRequest } from './pullRequestReviewState'
import { displayName, requiresReview } from './dashboard'
import { buildGitReviewInstruction } from './gitWorkflow'
import { groupReviewConversations } from './reviewConversations'
import { reviewPolicy } from './reviewPolicy'
import type { AppliedReviewRule, AppliedRulepack, GitWorkflowSettings, PullRequest, PullRequestActivity, RepoConfig, ReviewContext, ReviewContextActivity, Session } from '../types'

type ReviewContextDetails = Pick<ReviewContext, 'commits' | 'changedFiles' | 'diffstat' | 'comments'> & {
  activity: PullRequestActivity[]
  activityComplete?: boolean
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

export function buildReviewContext(pr: PullRequest, session: Session, details: ReviewContextDetails, rulepacks: AppliedRulepack[] = [], rules: AppliedReviewRule[] = [], settings?: GitWorkflowSettings): ReviewContext {
  pr = { ...pr, activity: details.activity, activityComplete: details.activityComplete ?? pr.activityComplete }
  const identity = displayName(session.displayName, session.email)
  const decision = getReviewDecision(pr, session.uuid, session.displayName)
  const status = decision.status
  const local = settings ? buildGitReviewInstruction(pr, session, settings) : undefined
  const unavailable = [...details.unavailable]
  if (!pr.source?.commit?.hash) unavailable.push('SHA de origen')
  if (!pr.destination?.commit?.hash) unavailable.push('SHA de destino')
  if (!pr.repo.technologies?.length) unavailable.push('tecnologías y versiones del repositorio')
  if (!local?.sourceRemote) unavailable.push('remoto local de origen')
  if (!local?.targetRemote) unavailable.push('remoto local de destino')
  const activity = normalizeActivity(pr, details.activity)
  const isRevisit = Boolean(getReviewerState(pr, identity, session.uuid))
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    reviewContract: reviewPolicy,
    reviewer: { name: session.displayName, uuid: session.uuid },
    localReview: local && { sourceRemote: local.sourceRemote, targetRemote: local.targetRemote, sourceRepository: local.sourceRepository, targetRepository: local.targetRepository, syncConfirmed: settings!.syncRemotesConfirmed },
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
      sourceCommit: pr.source?.commit?.hash,
      targetCommit: pr.destination?.commit?.hash,
      createdAt: pr.created_on,
      updatedAt: pr.updated_on,
      url: pr.links?.html?.href,
    },
    reviewState: {
      isNew: status === 'unreviewed' && isFreshPullRequest(pr),
      requiresReview: requiresReview(pr, session.uuid, session.displayName),
      isRevisit,
      status,
      decision,
      lastRelevantActivity: activity[activity.length - 1],
    },
    commits: details.commits,
    changedFiles: details.changedFiles,
    diffstat: {
      ...details.diffstat,
      totalChanges: details.diffstat.additions + details.diffstat.deletions,
    },
    comments: details.comments,
    conversations: groupReviewConversations(details.comments),
    activity,
    unavailable: [...new Set(unavailable)],
    rulepacks,
    rules,
  }
}

const markdownValue = (value?: string) => value || 'No disponible'
const markdownLink = (label: string, url?: string) => url ? `[${label}](${url})` : label
const markdownCode = (value: string) => `\`${value}\``
const quote = (value: string) => value.split(/\r?\n/).map((line) => `> ${line}`).join('\n')

export function buildReviewConversationsMarkdown(context: ReviewContext) {
  const threads = context.conversations || groupReviewConversations(context.comments)
  if (!threads.length) return 'No hay comentarios publicados disponibles.'
  return threads.map((thread, index) => [
    `### Hilo ${thread.rootId !== undefined ? `#${thread.rootId}` : index + 1}${thread.incomplete ? ' · contexto inicial incompleto' : ''}`,
    ...(thread.incomplete ? ['', 'No se recuperó la cadena completa de comentarios anteriores.'] : []),
    ...thread.comments.flatMap((comment) => {
      const role = comment.authorUuid && comment.authorUuid === context.reviewer?.uuid ? ' · tú' : comment.authorUuid && comment.authorUuid === context.pullRequest.author?.uuid ? ' · autor del PR' : ''
      return [
        '',
        `**${comment.author || 'Autor no disponible'}**${role}${comment.id !== undefined ? ` · comentario #${comment.id}` : ''}${comment.parentId !== undefined ? ` · responde a #${comment.parentId}` : ''}${comment.resolved ? ' · marcado como resuelto en Bitbucket' : ''}`,
        `- Creado: ${comment.createdAt || comment.date || 'No disponible'}${comment.updatedAt && comment.updatedAt !== comment.createdAt ? ` · Editado: ${comment.updatedAt}` : ''}`,
        ...(comment.path ? [`- Ubicación original: ${markdownCode(`${comment.path}${comment.line !== undefined ? `:${comment.line}` : ''}`)}${comment.side ? ` · lado ${comment.side === 'source' ? 'origen' : 'destino'}` : ''}`] : []),
        `- Commit al comentar: ${comment.commitReference ? `${comment.commitReference.hash} · referencia temporal inferida de la actividad ${comment.commitReference.activityDate}; no confirma el commit exacto del comentario` : 'No confirmado por los datos disponibles'}.`,
        ...(comment.url ? [`- Comentario: ${comment.url}`] : []),
        ...(comment.codeUrl ? [`- Código enlazado por Bitbucket: ${comment.codeUrl}`] : []),
        '', quote(comment.content),
      ]
    }),
  ].join('\n')).join('\n\n')
}

export function buildReviewContextMarkdown(context: ReviewContext) {
  const { repository, pullRequest, reviewState } = context
  const lines = [
    '# Pull Request',
    '',
    context.reviewContract || reviewPolicy,
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
    `- Contexto preparado: ${context.capturedAt || 'No disponible'}`,
    '',
    '## Descripción del PR (contenido del autor)',
    '',
    quote(pullRequest.description || 'No hay descripción disponible.'),
    '',
    '## Review state',
    '',
    `- PR nuevo: ${reviewState.isNew ? 'Sí' : 'No'}`,
    `- Requiere revisión: ${reviewState.requiresReview ? 'Sí' : 'No'}`,
    `- Revisión posterior: ${reviewState.isRevisit ? 'Sí' : 'No'}`,
    `- Estado calculado: ${reviewState.status}`,
    `- Confianza de la clasificación: ${reviewState.decision?.confidence || 'No disponible'}`,
    `- Fecha de tu última actividad de revisión: ${reviewState.decision?.reviewDate || 'No disponible'}`,
    `- Referencia anterior deducida de la actividad: ${reviewState.decision?.reviewedCommit || 'No disponible'}. No es un checkpoint de revisión confirmado; verifica en Git antes de atribuir cambios.`,
    `- Última actividad relevante: ${reviewState.lastRelevantActivity?.summary || 'No disponible'}`,
    '',
    '## Branches',
    '',
    `- Desde: ${markdownValue(pullRequest.sourceBranch)}`,
    `- Hacia: ${markdownValue(pullRequest.targetBranch)}`,
    `- Repositorio origen: ${context.localReview?.sourceRepository || 'Consultar en Bitbucket'}`,
    `- Repositorio destino: ${context.localReview?.targetRepository || `${repository.workspace}/${repository.repository}`}`,
    `- Remoto origen: ${context.localReview?.sourceRemote || 'No configurado; identificar antes de comparar'}`,
    `- Remoto destino: ${context.localReview?.targetRemote || 'No configurado; identificar antes de comparar'}`,
    `- SHA origen informado por Bitbucket: ${pullRequest.sourceCommit || 'No disponible'}`,
    `- SHA destino informado por Bitbucket: ${pullRequest.targetCommit || 'No disponible'}`,
    `- Remotos actualizados: ${context.localReview?.syncConfirmed ? 'declarado manualmente en la app; no es una comprobación de Git' : 'sin confirmar'}`,
    '- Verifica los SHA y el merge base en el clon antes de revisar. Si el PR o destino avanzaron, actualiza este contexto. Si falta el SHA anterior, no presentes el diff incremental como comprobado.',
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
    buildReviewConversationsMarkdown(context),
    '',
    '## Relevant activity',
    '',
    context.activity.map((item) => `- ${item.date} · **${item.type}**${item.actor ? ` · ${item.actor}` : ''} · ${item.summary}`).join('\n'),
  ]
  lines.push('', '## Applicable review rules', '')
  if (context.rules.length) context.rules.forEach((rule) => lines.push(`### ${rule.name}`, '', `- Categoría: ${rule.category}${rule.technology ? ` · ${rule.technology}` : ''}${rule.version ? ` · ${rule.version}` : ''}`, `- Referencia: ${rule.reference}`, '', rule.content.trim()))
  else if (context.rulepacks.length) context.rulepacks.forEach((rulepack) => lines.push(`### ${rulepack.name} — ${rulepack.version}`, '', rulepack.description, '', rulepack.reviewRulesContent.trim() || 'No disponible.'))
  else lines.push('Sin reglas de revisión configuradas para este repositorio.')
  const includedSources = new Set(context.rules.flatMap((rule) => (rule.sources || []).map((source) => `${rule.rulepackId}:${source}`)))
  const hasIncludedSource = (pack: AppliedRulepack, path: string) => includedSources.has(`${pack.id}@${pack.version}:${path}`)
  if (context.rulepacks.some((rulepack) => rulepack.testingContent?.trim() || rulepack.referenceContents.some((reference) => !hasIncludedSource(rulepack, reference.path)))) {
    lines.push('', '## Testing and references', '')
    context.rulepacks.forEach((rulepack) => {
      if (rulepack.testingContent?.trim()) lines.push(`### ${rulepack.name} · Testing`, '', rulepack.testingContent.trim())
      rulepack.referenceContents.filter((reference) => !hasIncludedSource(rulepack, reference.path)).forEach((reference) => lines.push(`### ${reference.path}`, '', reference.content.trim()))
    })
  }
  if (context.unavailable.length) {
    lines.push('', '## Información no disponible', '', ...context.unavailable.map((item) => `- No fue posible obtener ${item}.`))
  }
  return lines.join('\n')
}

export const buildReviewContextJson = (context: ReviewContext) => JSON.stringify(context, null, 2)

export function buildApplicableRulesMarkdown(context: ReviewContext) {
  if (!context.rules.length) return `${reviewPolicy}\n\nSin reglas de revisión configuradas para este repositorio.`
  return ['# Reglas de revisión aplicables', '', reviewPolicy, '', ...context.rules.flatMap((rule) => [`## ${rule.name}`, '', `- Categoría: ${rule.category}${rule.technology ? ` · ${rule.technology}` : ''}${rule.version ? ` · ${rule.version}` : ''}`, `- Referencia: ${rule.reference}`, '', rule.content.trim(), ''])].join('\n').trim()
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
    'Este archivo es autocontenido: no depende del chat anterior ni de rutas de otra computadora. Consérvalo con el repositorio y léelo al comenzar cada revisión.',
    '',
    reviewPolicy,
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
    '- Aplica el contrato de revisión de este documento. Si una regla especializada contradice la compatibilidad o el alcance acordado, informa el conflicto antes de concluir.',
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
    'No supongas que conservas información de otro chat. Utiliza esta preparación, verifica la configuración del repositorio y declara los datos que falten.',
    '',
    buildReviewContextMarkdown(context),
  ].join('\n')
}
