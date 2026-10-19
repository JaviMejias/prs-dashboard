import { useId } from 'react'
import { reviewConversationSummary, type ReviewCommentScope } from '../lib/reviewConversations'
import type { ReviewContext } from '../types'

type Props = { scope: ReviewCommentScope; onChange: (scope: ReviewCommentScope) => void; context: ReviewContext | null; disabled?: boolean }
const roundDateFormat = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' })

export default function ReviewConversationScope({ scope, onChange, context, disabled }: Props) {
  const id = useId()
  return <fieldset className="review-conversation-scope" disabled={disabled} aria-describedby={`${id}-help`}>
    <legend>Conversaciones para la guía</legend>
    <div className="review-scope-options">
      <label><input type="radio" name={id} checked={scope === 'recent'} onChange={() => onChange('recent')} /> Ronda reciente (aproximada)</label>
      <label><input type="radio" name={id} checked={scope === 'all'} onChange={() => onChange('all')} /> Historial completo</label>
    </div>
    <div id={`${id}-help`} className="review-context-hint" aria-live="polite">
      {context ? reviewConversationSummary(context, scope, roundDateFormat.format).map((line) => <p key={line}>{line}</p>) : <p>Al consultar el PR verás cuántos comentarios se incluyen. La selección reciente conserva completos los hilos con actividad nueva; no da por resueltos los anteriores.</p>}
    </div>
  </fieldset>
}
