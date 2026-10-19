import { useId } from 'react'
import { canChooseReviewConversationScope, reviewCommentScopeLabels, reviewConversationSummary, type ReviewCommentScope } from '../lib/reviewConversations'
import type { ReviewContext } from '../types'

type Props = { scope: ReviewCommentScope; onChange: (scope: ReviewCommentScope) => void; context: ReviewContext | null; disabled?: boolean }
const roundDateFormat = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' })

export default function ReviewConversationScope({ scope, onChange, context, disabled }: Props) {
  const id = useId()
  return <fieldset className="review-conversation-scope" disabled={disabled} aria-describedby={`${id}-help`}>
    <legend>Conversaciones para la guía</legend>
    {canChooseReviewConversationScope(context) && <div className="review-scope-options">
      <label><input type="radio" name={id} checked={scope === 'recent'} onChange={() => onChange('recent')} /><span><strong>{reviewCommentScopeLabels.recent}</strong><small>Continuar este PR en el mismo chat</small></span></label>
      <label><input type="radio" name={id} checked={scope === 'all'} onChange={() => onChange('all')} /><span><strong>{reviewCommentScopeLabels.all}</strong><small>Nuevo chat o recuperar antecedentes de este PR</small></span></label>
    </div>}
    <p className="review-context-hint">Solo cambia qué conversaciones se adjuntan; siempre se revisa todo el diff del PR.</p>
    <div id={`${id}-help`} className="review-context-hint" aria-live="polite">
      {context ? reviewConversationSummary(context, scope, roundDateFormat.format).map((line) => <p key={line}>{line}</p>) : <p>Al consultar el PR verás cuántos comentarios se incluyen. Usa Últimos comentarios si este chat ya conoce las observaciones anteriores; la selección es aproximada y no da por resueltos los anteriores.</p>}
    </div>
  </fieldset>
}
