import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useReviewContext } from './useReviewContext'
import { buildApplicableRulesMarkdown, buildCodexPreparation, buildReviewContextJson, buildReviewContextMarkdown, type ReviewGuideMode } from '../lib/reviewContext'
import type { GitReviewInstruction } from '../lib/gitWorkflow'
import type { ReviewCommentScope } from '../lib/reviewConversations'
import type { PullRequest, Session } from '../types'

export function useReviewContextExport(pr: PullRequest, session: Session, instruction: GitReviewInstruction, additionalContext: string, mode: ReviewGuideMode = 'compact', commentScope: ReviewCommentScope = 'recent') {
  const { query, context } = useReviewContext(pr, session)
  const [copyError, setCopyError] = useState('')
  const [copying, setCopying] = useState(false)
  const copyInFlight = useRef(false)
  const markdown = context ? buildReviewContextMarkdown(context) : ''
  const json = context ? buildReviewContextJson(context) : ''
  const rulesMarkdown = context ? buildApplicableRulesMarkdown(context) : ''
  const codexPreparation = context ? buildCodexPreparation(context, { instruction, additionalContext, mode, commentScope }) : ''
  const canCopy = Boolean(context) && !query.isFetching && !query.isError && !copying

  const copy = async (value: string, label: string) => {
    if (copyInFlight.current) return
    copyInFlight.current = true
    setCopying(true)
    setCopyError('')
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${label} copiado`, { description: 'Ya puedes pegarlo directamente en Codex.' })
    } catch {
      setCopyError('No se pudo copiar. Revisa los permisos del portapapeles o selecciona el texto en la vista previa.')
      toast.error('No se pudo copiar el contexto', { description: 'Revisa los permisos del portapapeles del navegador.' })
    } finally {
      copyInFlight.current = false
      setCopying(false)
    }
  }

  const canCopyGuide = canCopy && !context?.unavailable.includes('comments')
  return { query, context, markdown, json, rulesMarkdown, codexPreparation, canCopy, canCopyGuide, copying, copyError, copy }
}
