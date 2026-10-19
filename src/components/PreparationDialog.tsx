import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useModalDialog } from '../hooks/useDismissableLayer'

export default function PreparationDialog({ title, description, dirty = false, onClose, children }: { title: string; description?: string; dirty?: boolean; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const dirtyRef = useRef(dirty)
  const [discardOpen, setDiscardOpen] = useState(false)
  const discardRef = useRef(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  useEffect(() => { dirtyRef.current = dirty }, [dirty])
  const resumeEditing = useCallback(() => {
    setDiscardOpen(false)
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus())
  }, [])
  const requestClose = useCallback(() => {
    if (discardRef.current) { resumeEditing(); return }
    if (dirtyRef.current) {
      setDiscardOpen(true)
    } else onClose()
  }, [onClose, resumeEditing])
  useModalDialog(true, dialogRef, requestClose)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  useEffect(() => { discardRef.current = discardOpen; if (discardOpen) cancelRef.current?.focus() }, [discardOpen])
  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])
  return createPortal(<dialog ref={dialogRef} aria-modal="true" aria-labelledby={titleId} className="settings-dialog preparation-dialog" tabIndex={-1} onCancel={(event) => { event.preventDefault(); requestClose() }}>
      <header className="overlay-heading settings-heading"><div><span className="section-kicker">Preparar</span><h2 id={titleId}>{discardOpen ? '¿Descartar los cambios sin guardar?' : title}</h2>{!discardOpen && description && <p>{description}</p>}</div><button type="button" className="icon-button" aria-label="Cerrar preparación" onClick={requestClose}><X size={20} /></button></header>
      {discardOpen ? <div className="preparation-dialog-body"><p>La ficha guardada no cambiará. Se perderá lo que editaste en este diálogo.</p><div className="preparation-actions"><button ref={cancelRef} type="button" className="button button-primary" onClick={resumeEditing}>Seguir editando</button><button type="button" className="button button-ghost button-danger" onClick={onClose}>Descartar cambios</button></div></div> : children}
  </dialog>, document.body)
}

export function PreparationError({ message }: { message: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (message) ref.current?.focus() }, [message])
  return message ? <p ref={ref} role="alert" tabIndex={-1} className="preparation-error">{message}</p> : null
}
