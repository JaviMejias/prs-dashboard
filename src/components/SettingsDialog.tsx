import { useCallback, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { BellRing, Check, LogOut, Monitor, Volume2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useModalDialog } from '../hooks/useDismissableLayer'
import { PULL_REQUEST_POLL_INTERVAL_MS } from '../lib/notifications'
import { saveNotificationPreferences } from '../lib/storage'
import type { NotificationPreferences } from '../types'

export default function SettingsDialog({
  preferences,
  setPreferences,
  triggerRef,
  requestDesktop,
  testSound,
  onClose,
  onLogout,
}: {
  preferences: NotificationPreferences
  setPreferences: (preferences: NotificationPreferences) => void
  triggerRef: RefObject<HTMLButtonElement>
  requestDesktop: () => void
  testSound: () => void
  onClose: () => void
  onLogout: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const close = useCallback(onClose, [onClose])
  useModalDialog(true, dialogRef, close, triggerRef)

  const togglePreference = (key: keyof NotificationPreferences) => {
    if (key === 'sound' && !preferences.sound) {
      testSound()
      return
    }
    const next = { ...preferences, [key]: !preferences[key] }
    setPreferences(next)
    saveNotificationPreferences(next)
  }

  return (
    <motion.div
      className="dialog-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0.08 : 0.18 }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.section
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
        transition={{ duration: reduceMotion ? 0.08 : 0.2 }}
      >
        <header className="overlay-heading settings-heading">
          <div><span className="section-kicker">Configuración</span><h2 id="settings-title">Preferencias del control room</h2></div>
          <button type="button" className="icon-button" aria-label="Cerrar configuración" onClick={onClose}><X size={20} /></button>
        </header>

        <div className="settings-body">
          <section className="settings-section" aria-labelledby="notifications-heading">
            <div className="settings-section-heading"><span className="settings-section-icon"><BellRing size={18} /></span><div><h3 id="notifications-heading">Notificaciones</h3><p>Solo PR nuevos o turnos de revisión · consulta cada {PULL_REQUEST_POLL_INTERVAL_MS / 60_000} min.</p></div></div>
            <div className="preference-list">
              <div className="preference-row"><span className="preference-icon"><Monitor size={18} /></span><span><strong>Notificaciones del sistema</strong><small>Avisa aunque la pestaña esté en segundo plano.</small></span><div className="preference-controls"><button type="button" className={`switch ${preferences.desktop ? 'is-on' : ''}`} role="switch" aria-label="Notificaciones del sistema" aria-checked={preferences.desktop} onClick={preferences.desktop ? () => togglePreference('desktop') : requestDesktop}><span /></button></div></div>
              <div className="preference-row"><span className="preference-icon"><Volume2 size={18} /></span><span><strong>Sonido</strong><small>Suena una vez cuando aparece una acción para ti.</small></span><div className="preference-controls"><button type="button" className="text-button test-sound" onClick={testSound}><Volume2 size={15} /> Probar</button><button type="button" className={`switch ${preferences.sound ? 'is-on' : ''}`} role="switch" aria-label="Sonido" aria-checked={preferences.sound} onClick={() => togglePreference('sound')}><span /></button></div></div>
              <div className="preference-row"><span className="preference-icon"><BellRing size={18} /></span><span><strong>Título de la pestaña</strong><small>Muestra el número de novedades sin leer.</small></span><div className="preference-controls"><button type="button" className={`switch ${preferences.title ? 'is-on' : ''}`} role="switch" aria-label="Título de la pestaña" aria-checked={preferences.title} onClick={() => togglePreference('title')}><span /></button></div></div>
            </div>
          </section>

          <section className="settings-section settings-session" aria-labelledby="session-heading">
            <div className="settings-section-heading"><span className="settings-section-icon settings-session-icon"><LogOut size={18} /></span><div><h3 id="session-heading">Sesión</h3><p>Desconecta esta cuenta del navegador actual.</p></div></div>
            <div className="session-action">
              <span><strong>Cuenta de Bitbucket</strong><small>Podrás volver a conectarte con tus credenciales.</small></span>
              <button type="button" className="button button-ghost button-danger" onClick={onLogout}><LogOut size={16} /> Cerrar sesión</button>
            </div>
          </section>
        </div>

        <footer className="settings-footer">
          <button type="button" className="button button-primary" data-autofocus onClick={onClose}><Check size={17} /> Cerrar configuración</button>
        </footer>
      </motion.section>
    </motion.div>
  )
}
