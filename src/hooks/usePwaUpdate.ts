import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { registerSW } from 'virtual:pwa-register'
import { activatePwaUpdate } from '../lib/pwaUpdate'

type PwaUpdateState = { status: 'idle' } | { status: 'activating' } | { status: 'failed'; message: string }

export function usePwaUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateState, setUpdateState] = useState<PwaUpdateState>({ status: 'idle' })
  const updating = updateState.status === 'activating'
  const updateError = updateState.status === 'failed' ? updateState.message : ''
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined)
  const pendingWorkerRef = useRef<ServiceWorker | null>(null)
  const updateAttemptRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let disposed = false
    const showUpdate = () => {
      if (disposed) return
      pendingWorkerRef.current = registrationRef.current?.waiting || registrationRef.current?.active || null
      setUpdateAvailable(true)
    }
    const checkForUpdates = () => {
      const registration = registrationRef.current
      if (document.visibilityState !== 'visible' || !navigator.onLine || registration?.installing) return
      void registration?.update().catch(() => console.warn('No se pudo comprobar si hay una nueva versión de la app.'))
    }
    registerSW({
      immediate: true,
      onNeedRefresh: showUpdate,
      onNeedReload: () => {
        if (!disposed && !updateAttemptRef.current) window.location.reload()
      },
      onOfflineReady: () => { if (!disposed) toast.success('La interfaz ya está disponible sin conexión.') },
      onRegisteredSW: (_serviceWorkerUrl, currentRegistration) => {
        if (disposed) return
        registrationRef.current = currentRegistration
        checkForUpdates()
      },
      onRegisterError: (error) => console.error('PWA service worker registration failed', error),
    })

    const updateTimer = window.setInterval(checkForUpdates, 15 * 60 * 1000)
    document.addEventListener('visibilitychange', checkForUpdates)
    return () => {
      disposed = true
      updateAttemptRef.current?.abort()
      updateAttemptRef.current = null
      window.clearInterval(updateTimer)
      document.removeEventListener('visibilitychange', checkForUpdates)
    }
  }, [])

  const applyUpdate = async () => {
    if (updateAttemptRef.current) return
    const attempt = new AbortController()
    updateAttemptRef.current = attempt
    setUpdateState({ status: 'activating' })
    let reloading = false
    try {
      const registration = registrationRef.current || await navigator.serviceWorker?.getRegistration()
      if (!registration) throw new Error('No se encontró la actualización de la app. Recarga la página e inténtalo nuevamente.')
      await activatePwaUpdate(registration, attempt.signal, pendingWorkerRef.current)
      if (!attempt.signal.aborted) {
        window.location.reload()
        reloading = true
      }
    } catch (reason) {
      if (attempt.signal.aborted) return
      const message = reason instanceof Error ? reason.message : 'No se pudo actualizar la app. Inténtalo nuevamente.'
      console.warn('No se pudo aplicar la actualización de la app', message)
      setUpdateState({ status: 'failed', message })
    } finally {
      if (!reloading && !attempt.signal.aborted) {
        updateAttemptRef.current = null
      }
    }
  }

  return { updateAvailable, updating, updateError, applyUpdate }
}
