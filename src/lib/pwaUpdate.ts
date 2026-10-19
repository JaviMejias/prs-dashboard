export const PWA_UPDATE_TIMEOUT_MS = 15_000

export function activatePwaUpdate(registration: ServiceWorkerRegistration, signal: AbortSignal, expectedWorker?: ServiceWorker | null) {
  const worker = expectedWorker || registration.waiting || registration.installing || registration.active
  if (!worker) return Promise.reject(new Error('No encontramos una versión lista para activar. Recarga la página e inténtalo nuevamente.'))

  return new Promise<void>((resolve, reject) => {
    let activationRequested = false
    const cleanup = () => {
      clearTimeout(timer)
      worker.removeEventListener('statechange', checkState)
      signal.removeEventListener('abort', cancel)
    }
    const fail = (reason: unknown) => { cleanup(); reject(reason) }
    const cancel = () => fail(signal.reason)
    const checkState = () => {
      if (signal.aborted) { cancel(); return }
      if (worker.state === 'activated') { cleanup(); resolve(); return }
      if (worker.state === 'redundant') {
        fail(new Error('La versión descargada dejó de estar disponible. Recarga la página para buscar la versión más reciente.'))
        return
      }
      if (worker.state === 'installed' && !activationRequested) {
        activationRequested = true
        try { worker.postMessage({ type: 'SKIP_WAITING' }) }
        catch { fail(new Error('No se pudo activar la nueva versión. Puedes volver a intentarlo.')) }
      }
    }
    const timer = setTimeout(() => fail(new Error('La actualización no terminó en 15 segundos. Puedes volver a intentarlo o recargar la página.')), PWA_UPDATE_TIMEOUT_MS)
    worker.addEventListener('statechange', checkState)
    signal.addEventListener('abort', cancel, { once: true })
    checkState()
  })
}
