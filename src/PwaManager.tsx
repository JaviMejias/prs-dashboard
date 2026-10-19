import { useEffect, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import { Download, RefreshCw, Share2, WifiOff, X } from 'lucide-react'
import { usePwaUpdate } from './hooks/usePwaUpdate'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const installHintKey = 'prcr:pwa-install-hint-dismissed'
const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
const isIosDevice = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

export default function PwaManager() {
  const { updateAvailable, updating, updateError, applyUpdate } = usePwaUpdate()
  const [online, setOnline] = useState(navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [showIosHint, setShowIosHint] = useState(() => isIosDevice() && !isInstalled() && localStorage.getItem(installHintKey) !== 'true')
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    const clearInstallPrompt = () => setInstallPrompt(null)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('beforeinstallprompt', captureInstallPrompt)
    window.addEventListener('appinstalled', clearInstallPrompt)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt)
      window.removeEventListener('appinstalled', clearInstallPrompt)
    }
  }, [])

  const installApp = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') setInstallPrompt(null)
  }

  const dismissIosHint = () => {
    localStorage.setItem(installHintKey, 'true')
    setShowIosHint(false)
  }

  const enterFrom = { opacity: 0, y: reduceMotion ? 0 : 14, scale: reduceMotion ? 1 : 0.98 }
  const leaveTo = { opacity: 0, y: reduceMotion ? 0 : 8, scale: reduceMotion ? 1 : 0.98 }
  const transition = { duration: reduceMotion ? 0.01 : 0.18 }

  return (
    <div className="pwa-stack" aria-live="polite">
      <AnimatePresence initial={false}>
        {!online && (
          <m.aside
            className="pwa-card pwa-offline"
            initial={enterFrom}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={leaveTo}
            transition={transition}
          >
            <span className="pwa-card-icon"><WifiOff size={17} /></span>
            <span><strong>Sin conexión</strong><small>La información de Bitbucket se actualizará cuando vuelva internet.</small></span>
          </m.aside>
        )}

        {updateAvailable && (
          <m.aside
            className="pwa-card pwa-update"
            initial={enterFrom}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={leaveTo}
            transition={transition}
          >
            <span className="pwa-card-icon"><RefreshCw size={17} className={updating ? 'spin' : ''} /></span>
            <span><strong>Nueva versión disponible</strong><small>{updating ? 'Activando la nueva versión…' : 'Ya está descargada y lista para usar.'}</small>{updateError && <small role="alert">{updateError}</small>}</span>
            <button type="button" onClick={applyUpdate} disabled={updating} aria-busy={updating}>{updating ? 'Actualizando…' : 'Actualizar ahora'}</button>
          </m.aside>
        )}

        {installPrompt && !isInstalled() && (
          <m.aside
            className="pwa-card pwa-install"
            initial={enterFrom}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={leaveTo}
            transition={transition}
          >
            <span className="pwa-card-icon"><Download size={17} /></span>
            <span><strong>Instalar PR Control</strong><small>Úsala sin pestañas ni controles del navegador.</small></span>
            <button type="button" onClick={installApp}>Instalar</button>
            <button type="button" className="pwa-close" onClick={() => setInstallPrompt(null)} aria-label="Cerrar sugerencia de instalación"><X size={14} /></button>
          </m.aside>
        )}

        {showIosHint && (
          <m.aside
            className="pwa-card pwa-install pwa-ios"
            initial={enterFrom}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={leaveTo}
            transition={transition}
          >
            <span className="pwa-card-icon"><Share2 size={17} /></span>
            <span><strong>Instalar en este iPhone</strong><small>Pulsa Compartir y luego “Agregar a inicio”.</small></span>
            <button type="button" className="pwa-close" onClick={dismissIosHint} aria-label="Cerrar sugerencia de instalación"><X size={14} /></button>
          </m.aside>
        )}
      </AnimatePresence>
    </div>
  )
}
