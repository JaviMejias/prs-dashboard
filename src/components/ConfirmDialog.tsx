import { useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { m, useReducedMotion } from 'framer-motion'
import { AlertTriangle, X } from 'lucide-react'
import { useModalDialog } from '../hooks/useDismissableLayer'

export default function ConfirmDialog({ title, description, confirmLabel, onConfirm, onClose }: { title: string; description: string; confirmLabel: string; onConfirm: () => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const close = useCallback(onClose, [onClose])
  useModalDialog(true, dialogRef, close)

  return createPortal(
    <div className="dialog-backdrop confirm-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <m.section
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        tabIndex={-1}
        initial={{ opacity: 0, y: reduceMotion ? 0 : 8, scale: reduceMotion ? 1 : .98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: reduceMotion ? 0 : 8, scale: reduceMotion ? 1 : .98 }}
        transition={{ duration: reduceMotion ? .08 : .18 }}
      >
        <header className="confirm-dialog-heading">
          <span className="confirm-dialog-icon"><AlertTriangle size={19} /></span>
          <div><span className="section-kicker">Confirmar acción</span><h2 id="confirm-dialog-title">{title}</h2></div>
          <button type="button" className="icon-button" aria-label="Cerrar confirmación" onClick={onClose}><X size={18} /></button>
        </header>
        <p id="confirm-dialog-description">{description}</p>
        <footer className="confirm-dialog-actions">
          <button type="button" className="button button-ghost" data-autofocus onClick={onClose}>Cancelar</button>
          <button type="button" className="button button-danger" onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</button>
        </footer>
      </m.section>
    </div>,
    document.body,
  )
}
