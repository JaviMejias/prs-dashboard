import { useCallback, useId, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, EllipsisVertical, EyeOff, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { useDismissableLayer } from '../hooks/useDismissableLayer'
import { displayName, isIgnoredPullRequest, normalizeForRule, pullRequestKey } from '../lib/dashboard'
import { getIgnoreRules, saveIgnoreRules } from '../lib/storage'
import type { IgnoreRules, PullRequest } from '../types'

export default function PullRequestMenu({ pr }: { pr: PullRequest }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const reduceMotion = useReducedMotion()
  const ignored = isIgnoredPullRequest(pr)
  const authorName = displayName(pr.author?.display_name || pr.author?.nickname)
  const close = useCallback(() => setOpen(false), [])
  useDismissableLayer(open, menuRef, close, triggerRef)

  const applyRules = (rules: IgnoreRules) => {
    saveIgnoreRules(rules)
    window.dispatchEvent(new Event('prcr:ignore-rules-changed'))
  }

  const updateRule = (scope: 'pr' | 'author') => {
    const previous = getIgnoreRules()
    const next: IgnoreRules = { authors: [...previous.authors], pullRequests: [...previous.pullRequests] }

    if (ignored) {
      next.authors = next.authors.filter((item) => normalizeForRule(item) !== normalizeForRule(authorName))
      next.pullRequests = next.pullRequests.filter((item) => item !== pullRequestKey(pr))
    } else if (scope === 'author' && !next.authors.some((item) => normalizeForRule(item) === normalizeForRule(authorName))) {
      next.authors.push(authorName)
    } else if (scope === 'pr' && !next.pullRequests.includes(pullRequestKey(pr))) {
      next.pullRequests.push(pullRequestKey(pr))
    }

    applyRules(next)
    setOpen(false)
    toast.success(ignored ? 'PR incluido nuevamente en tu cola' : scope === 'author' ? `PR de ${authorName} ocultados` : 'PR ocultado de tu cola', {
      description: ignored ? 'Volverá a aparecer en tus filtros de revisión.' : 'Puedes encontrarlo en QA > Todos.',
      action: { label: 'Deshacer', onClick: () => applyRules(previous) },
    })
  }

  return (
    <div className="pr-menu-control">
      <button ref={triggerRef} type="button" className="icon-button pr-menu-trigger" aria-label={`Más acciones para el PR ${pr.id}`} aria-expanded={open} aria-controls={menuId} aria-haspopup="menu" onClick={() => setOpen((current) => !current)}><EllipsisVertical size={19} /></button>
      <AnimatePresence>
        {open && <motion.div ref={menuRef} id={menuId} className="pr-actions-menu" role="menu" initial={{ opacity: 0, y: reduceMotion ? 0 : -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }} transition={{ duration: reduceMotion ? 0.08 : 0.15 }}>
          <span className="menu-label">Organizar cola</span>
          {ignored ? <button type="button" role="menuitem" onClick={() => updateRule('pr')}><Check size={16} /><span><strong>Reactivar PR</strong><small>Volver a incluirlo en tu cola</small></span></button> : <>
            <button type="button" role="menuitem" onClick={() => updateRule('pr')}><EyeOff size={16} /><span><strong>Ocultar este PR</strong><small>Solo afecta tu cola personal</small></span></button>
            <button type="button" role="menuitem" className="menu-item-warning" onClick={() => updateRule('author')}><UserRound size={16} /><span><strong>Ignorar este autor</strong><small>Oculta todos sus PR de tu revisión</small></span></button>
          </>}
        </motion.div>}
      </AnimatePresence>
    </div>
  )
}
