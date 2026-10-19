import type { ReviewContext, ReviewContextComment } from '../types'

export type ReviewCommentScope = 'recent' | 'all'
type Identity = { uuid?: string; name?: string }

export const REVIEW_ROUND_WINDOW_MINUTES = 5
const normalizeName = (name?: string) => name?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim()
const hasIdentity = (identity?: Identity) => Boolean(identity?.uuid || identity?.name?.trim())
export const isCommentBy = (comment: ReviewContextComment, identity?: Identity) => {
  if (!identity) return false
  if (identity.uuid && comment.authorUuid) return identity.uuid === comment.authorUuid
  const name = normalizeName(identity.name)
  return Boolean(name && normalizeName(comment.author) === name)
}
const timestamp = (value?: string) => value ? Date.parse(value) : NaN
const creationTime = (comment: ReviewContextComment) => timestamp(comment.createdAt || comment.date)

export function selectReviewConversations(context: ReviewContext, scope: ReviewCommentScope = 'recent') {
  const { comments } = context
  const roots = comments.filter((comment) => comment.parentId === undefined && isCommentBy(comment, context.reviewer))
  const datedRoots = roots.map(creationTime)
  const fallback = scope === 'recent' && comments.length > 0 && (!hasIdentity(context.reviewer) || !roots.length || datedRoots.some((date) => !Number.isFinite(date)))
  let roundStart: number | undefined
  let selected = comments
  if (scope === 'recent' && !fallback && roots.length) {
    const latest = Math.max(...datedRoots)
    const start = Math.min(...datedRoots.filter((date) => date >= latest - REVIEW_ROUND_WINDOW_MINUTES * 60_000))
    roundStart = start
    const byId = new Map<number, number>()
    comments.forEach((comment, index) => { if (comment.id !== undefined) byId.set(comment.id, index) })
    const neighbors = comments.map(() => [] as number[])
    const included = new Set<number>()
    comments.forEach((comment, index) => {
      const parent = comment.parentId === undefined ? undefined : byId.get(comment.parentId)
      if (parent !== undefined) {
        neighbors[index].push(parent)
        neighbors[parent].push(index)
      }
      const date = timestamp(comment.date || comment.createdAt)
      if (!Number.isFinite(date) || date >= start || (comment.parentId !== undefined && parent === undefined)) included.add(index)
    })
    const queue = [...included]
    for (let cursor = 0; cursor < queue.length; cursor++) {
      for (const index of neighbors[queue[cursor]]) {
        if (included.has(index)) continue
        included.add(index)
        queue.push(index)
      }
    }
    selected = comments.filter((_, index) => included.has(index))
  }
  return { comments: selected, omittedCount: comments.length - selected.length, fallback, roundStart }
}

export function reviewConversationSummary(context: ReviewContext, scope: ReviewCommentScope = 'recent', formatDate = (date: number) => new Date(date).toISOString()) {
  if (context.unavailable.includes('comments')) return ['No se pudieron cargar los comentarios; no se puede determinar si hay respuestas.']
  const selection = selectReviewConversations(context, scope)
  const summary = [scope === 'all'
    ? `Historial completo: ${context.comments.length} comentarios recibidos.`
    : selection.fallback
      ? 'No se pudo delimitar una ronda con tu identidad y las fechas disponibles; se incluye todo el historial recibido.'
      : selection.roundStart !== undefined
        ? `Ronda reciente aproximada desde ${formatDate(selection.roundStart)}: observaciones propias hasta ${REVIEW_ROUND_WINDOW_MINUTES} minutos antes de la última y actividad posterior. Hilos relacionados completos.`
        : 'No hay comentarios en la consulta de Bitbucket.']
  summary.push(`${selection.comments.length} de ${context.comments.length} comentarios incluidos; ${selection.omittedCount} anteriores fuera de esta guía.${selection.omittedCount ? ' Omitir no significa resolver: puedes incluirlos con «Historial completo».' : ''}`)
  const author = context.pullRequest.author
  if (hasIdentity(author)) {
    const selectedComments = new Set(selection.comments)
    const total = context.comments.filter((comment) => isCommentBy(comment, author)).length
    const selected = selection.comments.filter((comment) => isCommentBy(comment, author)).length
    const replies = context.commentReplies.filter(({ reply }) => isCommentBy(reply, author) && selectedComments.has(reply)).length
    summary.push(`Intervenciones del autor identificadas: ${selected} incluidas de ${total} recibidas; ${replies} respuestas vinculadas a tus observaciones. Según los datos recibidos; no prueba que el autor no haya respondido en Bitbucket u otro canal.`)
  } else summary.push('Identidad del autor no disponible; no se pueden atribuir sus respuestas con certeza.')
  return summary
}
