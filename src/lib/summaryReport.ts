import { safeBitbucketUrl } from './externalLinks'
import { summaryMetricsForRange } from './summary'
import type { DateRange } from './dateRange'
import type { RepoConfig, ReviewHistory, Session } from '../types'

const escape = (value: string) => value.replace(/[\r\n]+/g, ' ').replace(/[\\`*_\[\]!|]/g, '\\$&').replace(/[<>]/g, '')
const sourceUrl = (value: string | undefined) => {
  const safe = safeBitbucketUrl(value)
  if (!safe) return ''
  const url = new URL(safe)
  return url.username || url.password ? '' : url.href.replace(/\|/g, '%7C')
}
const eventLabels = { comment: 'Comentario', approval: 'Aprobación', review: 'Participación registrada', changes_requested: 'Solicitud de cambios' }

export function summaryReport(history: ReviewHistory, repos: RepoConfig[], session: Session, range: DateRange, complete: boolean, now = new Date()) {
  const summary = summaryMetricsForRange(history, repos, session, range)
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const lines = [
    '# Informe de revisión de pull requests', '',
    `Período: ${range.from} a ${range.to}`, `Revisor: ${escape(session.displayName || session.email)}`,
    `Generado: ${now.toISOString()}`, `Zona horaria del período: ${zone}`,
    `Cobertura: ${complete ? 'Completa para los repositorios configurados y datos disponibles en la API.' : 'PARCIAL. No utilizar como total definitivo.'}`, '',
    '| Métrica | Total |', '| --- | ---: |',
    `| PR con actividad propia | ${summary.reviewed} |`, `| Comentarios | ${summary.comments} |`,
    `| PR con aprobaciones | ${summary.approved} |`, `| PR con solicitudes de cambios registradas | ${summary.changes} |`, '',
    '## Por repositorio', '', '| Repositorio | PR con actividad propia |', '| --- | ---: |',
    ...summary.repositories.map((repository) => `| ${escape(repository.repositoryKey)} | ${repository.pullRequests} |`), '',
    '## Evidencia de actividad', '', '| Fecha (ISO 8601) | Repositorio | PR | Título | Actividad | Origen | URL |', '| --- | --- | ---: | --- | --- | --- | --- |',
    ...summary.events.map(({ event, pullRequest, repositoryKey }) => `| ${event.date} | ${escape(repositoryKey)} | ${pullRequest.id} | ${escape(pullRequest.title || '')} | ${eventLabels[event.type]} | ${event.source === 'activity' ? 'Registro de actividad' : event.source === 'participants' ? 'Estado de participantes; no acredita una ronda histórica' : 'Origen no detallado en la caché'} | ${sourceUrl(pullRequest.url)} |`), '',
    '## Alcance y limitaciones', '',
    '- PR revisados significa PR distintos con actividad atribuible al revisor, no cantidad de rondas ni horas trabajadas.',
    '- Las aprobaciones y solicitudes de cambios cuentan PR distintos con esa evidencia; no representan su estado actual.',
    '- La participación de un revisor puede provenir del estado de participantes y no reconstruye necesariamente todas las rondas anteriores.',
    '- La cobertura indica que terminó la lectura de las páginas de la API. No certifica un registro inmutable ni recupera información eliminada o no expuesta por Bitbucket.', '',
  ]
  return lines.join('\n')
}
