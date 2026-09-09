import { useEffect } from 'react'
import type { RefObject } from 'react'

export function useDismissableLayer(
  open: boolean,
  layerRef: RefObject<HTMLElement>,
  onClose: () => void,
  triggerRef?: RefObject<HTMLElement>,
) {
  useEffect(() => {
    if (!open) return

    const closeOnPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (layerRef.current?.contains(target) || triggerRef?.current?.contains(target)) return
      onClose()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      onClose()
      triggerRef?.current?.focus()
    }

    document.addEventListener('pointerdown', closeOnPointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [layerRef, onClose, open, triggerRef])
}

export function useModalDialog(
  open: boolean,
  dialogRef: RefObject<HTMLElement>,
  onClose: () => void,
  triggerRef?: RefObject<HTMLElement>,
) {
  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    const backdrop = dialog?.parentElement
    const backgroundElements: Array<{ element: Element; wasInert: boolean }> = []
    let activeLayer: Element | null | undefined = backdrop
    while (activeLayer?.parentElement) {
      const parent = activeLayer.parentElement
      Array.from(parent.children)
        .filter((element) => element !== activeLayer)
        .forEach((element) => backgroundElements.push({
          element,
          wasInert: element.hasAttribute('inert'),
        }))
      if (parent === document.body) break
      activeLayer = parent
    }
    const previousOverflow = document.body.style.overflow
    const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(focusableSelector) || [])

    backgroundElements.forEach(({ element }) => element.setAttribute('inert', ''))
    document.body.style.overflow = 'hidden'
    window.requestAnimationFrame(() => (dialog?.querySelector<HTMLElement>('[data-autofocus]') || focusable()[0] || dialog)?.focus())

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) {
        event.preventDefault()
        dialog?.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      backgroundElements.forEach(({ element, wasInert }) => {
        if (!wasInert) element.removeAttribute('inert')
      })
      document.body.style.overflow = previousOverflow
      const focusTarget = triggerRef?.current || previousFocus
      focusTarget?.focus()
    }
  }, [dialogRef, onClose, open, triggerRef])
}
