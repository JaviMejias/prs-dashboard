import { useCallback, useId, useRef, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import { Check, EllipsisVertical, EyeOff, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { useDismissableLayer } from '../hooks/useDismissableLayer'
import { displayName, normalizeForRule, pullRequestKey } from '../lib/dashboard'
import { getIgnoreRules, saveIgnoreRules } from '../lib/storage'
import type { IgnoreRules, PullRequest } from '../types'

export default function PullRequestMenu({ pr }: { pr: PullRequest }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const reduceMotion = useReducedMotion()
  const authorName = displayName(pr.author?.display_name || pr.author?.nickname)
  const prKey = pullRequestKey(pr)
  const currentRules = getIgnoreRules()
  const ignoredPr = currentRules.pullRequests.includes(prKey)
  const ignoredAuthor = currentRules.authors.some((item) => normalizeForRule(item) === normalizeForRule(authorName))
  const close = useCallback(() => setOpen(false), [])
  useDismissableLayer(open, menuRef, close, triggerRef)

  const applyRules = (rules: IgnoreRules) => {
    if (!saveIgnoreRules(rules)) return false
    window.dispatchEvent(new Event('prcr:ignore-rules-changed'))
    return true
  }

  const updateRule = (scope: 'pr' | 'author') => {
    const previous = getIgnoreRules()
    const next: IgnoreRules = { authors: [...previous.authors], pullRequests: [...previous.pullRequests] }
    const wasIgnored = scope === 'author' ? ignoredAuthor : ignoredPr
    if (scope === 'author') {
      next.authors = wasIgnored
        ? next.authors.filter((item) => normalizeForRule(item) !== normalizeForRule(authorName))
        : [...next.authors, authorName]
    } else {
      next.pullRequests = wasIgnored
        ? next.pullRequests.filter((item) => item !== prKey)
        : [...next.pullRequests, prKey]
    }

    if (!applyRules(next)) return
    setOpen(false)
    const remainsIgnored = next.pullRequests.includes(prKey) || next.authors.some((item) => normalizeForRule(item) === normalizeForRule(authorName))
    const restored = wasIgnored && !remainsIgnored
    const message = scope === 'author'
      ? wasIgnored ? 'Autor visible nuevamente' : `PR de ${authorName} ocultados`
      : wasIgnored ? 'PR incluido nuevamente en tu cola' : 'PR ocultado de tu cola'
    toast.success(message, {
      description: restored ? 'Volverá a aparecer en tus filtros de revisión.' : remainsIgnored && wasIgnored ? 'Sigue oculto por otra regla activa.' : 'Puedes encontrarlo en QA > Todos.',
      action: { label: 'Deshacer', onClick: () => applyRules(previous) },
    })
  }

  return (
    <div className="pr-menu-control">
      <button ref={triggerRef} type="button" className="icon-button pr-menu-trigger" aria-label={`Más acciones para el PR ${pr.id}`} aria-expanded={open} aria-controls={menuId} aria-haspopup="menu" onClick={() => setOpen((current) => !current)}><EllipsisVertical size={19} /></button>
      <AnimatePresence>
        {open && <m.div ref={menuRef} id={menuId} className="pr-actions-menu" role="menu" initial={{ opacity: 0, y: reduceMotion ? 0 : -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }} transition={{ duration: reduceMotion ? 0.08 : 0.15 }}>
          <span className="menu-label">Organizar cola</span>
          {ignoredPr ? <button type="button" role="menuitem" onClick={() => updateRule('pr')}><Check size={16} /><span><strong>Reactivar PR</strong><small>Volver a incluir solo este PR</small></span></button> : <button type="button" role="menuitem" onClick={() => updateRule('pr')}><EyeOff size={16} /><span><strong>Ocultar este PR</strong><small>Solo afecta tu cola personal</small></span></button>}
          {ignoredAuthor ? <button type="button" role="menuitem" onClick={() => updateRule('author')}><Check size={16} /><span><strong>Reactivar autor</strong><small>Volver a incluir los PR de {authorName}</small></span></button> : <button type="button" role="menuitem" className="menu-item-warning" onClick={() => updateRule('author')}><UserRound size={16} /><span><strong>Ignorar este autor</strong><small>Oculta todos sus PR de tu revisión</small></span></button>}
        </m.div>}
      </AnimatePresence>
    </div>
  )
}
