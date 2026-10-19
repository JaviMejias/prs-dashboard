import { useState } from 'react'
import PreparationDialog, { PreparationError } from './PreparationDialog'
import type { PersonalReviewPreferences } from '../types'

export default function PreparationPreferencesDialog({ preferences, onSave, onClose }: { preferences: PersonalReviewPreferences; onSave: (preferences: PersonalReviewPreferences) => boolean; onClose: () => void }) {
  const [instructions, setInstructions] = useState(preferences.instructions)
  const [error, setError] = useState('')
  const save = () => {
    try {
      if (!onSave({ instructions })) { setError('No se pudieron guardar las preferencias en este navegador. Conserva el texto y reintenta.'); return }
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudieron guardar las preferencias.') }
  }
  return <PreparationDialog title="Mis preferencias de revisión" description="Se guardan una vez y puedes aplicarlas a cada proyecto." dirty={instructions !== preferences.instructions} onClose={onClose}>
    <form noValidate className="preparation-form" onSubmit={(event) => { event.preventDefault(); save() }}>
      <div className="preparation-dialog-body"><label className="preparation-field"><span>Preferencias personales</span><textarea className="resize-none" rows={12} maxLength={30_000} data-autofocus value={instructions} onChange={(event) => setInstructions(event.target.value)} /><small>Por ejemplo: 2 espacios, código en inglés, interfaz en español y no agregar comentarios.</small></label><p className="preparation-notice">Las convenciones verificadas del proyecto tienen prioridad. Codex debe señalar los conflictos, no resolverlos silenciosamente.</p><PreparationError message={error} /></div>
      <footer className="settings-footer"><button type="submit" className="button button-primary">Guardar preferencias</button></footer>
    </form>
  </PreparationDialog>
}
