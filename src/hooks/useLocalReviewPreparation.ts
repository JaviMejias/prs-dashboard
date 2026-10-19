import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useReviewContext } from './useReviewContext'
import { buildCodexPreparation } from '../lib/reviewContext'
import type { GitReviewInstruction } from '../lib/gitWorkflow'
import type { PullRequest, Session } from '../types'

export type CopyState = { status: 'idle' | 'loading' } | { status: 'error'; message: string }

export function useLocalReviewPreparation(pr: PullRequest, session: Session, instruction: GitReviewInstruction, additionalContext: string) {
  const [copyState, setCopyState] = useState<CopyState>({ status: 'idle' })
  const inFlight = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const { query, context, buildContext } = useReviewContext(pr, session, false)
  const copyPreparation = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setCopyState({ status: 'loading' })
    try {
      const result = await query.refetch()
      if (!mounted.current) return
      if (result.isError || !result.data) {
        setCopyState({ status: 'error', message: 'No se pudo preparar el contexto. Reintenta o abre Ver contexto.' })
        return
      }
      if (result.data.unavailable.includes('comments')) {
        setCopyState({ status: 'error', message: 'No se pudieron cargar los comentarios de Bitbucket. No se copió la guía sin tus conversaciones. Reintenta o abre Ver contexto.' })
        return
      }
      const context = buildContext(result.data)
      await navigator.clipboard.writeText(buildCodexPreparation(context, { instruction, additionalContext }))
      if (!mounted.current) return
      setCopyState({ status: 'idle' })
      if (context.unavailable.length) toast.warning('Guía copiada con información parcial', { description: 'Las limitaciones también están indicadas en el texto.' })
      else toast.success('Guía para Codex copiada', { description: 'Incluye datos del PR, cambios y conversaciones de Bitbucket.' })
    } catch {
      if (mounted.current) setCopyState({ status: 'error', message: 'No se pudo copiar la guía. Abre Ver contexto para consultar el texto y revisa los permisos del portapapeles.' })
    } finally {
      inFlight.current = false
    }
  }

  return { copyState, setCopyState, unavailable: context?.unavailable || [], copyPreparation }
}
