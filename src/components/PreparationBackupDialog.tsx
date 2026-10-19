import { useState } from 'react'
import PreparationDialog, { PreparationError } from './PreparationDialog'
import { planPreparationRestore, type PreparationBackup, type RestorePolicy } from '../lib/preparationBackup'
import { projectKey } from '../lib/projectPreparation'
import type { PreparationData } from '../types'

export default function PreparationBackupDialog({ current, backup, onApply, onClose }: { current: PreparationData; backup: PreparationBackup; onApply: (data: PreparationData) => boolean; onClose: () => void }) {
  const [policy, setPolicy] = useState<RestorePolicy>('keep')
  const [error, setError] = useState('')
  const plan = planPreparationRestore(current, backup, policy)
  const restore = () => {
    if (plan.unresolved.length || plan.validationError) return
    try {
      if (!onApply(plan.data)) { setError('No se pudo guardar el respaldo. No se aplicó ningún cambio; libera espacio o revisa los permisos del navegador.'); return }
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo restaurar el respaldo.') }
  }
  return <PreparationDialog title="Revisar respaldo antes de restaurar" description={`Archivo del ${new Date(backup.exportedAt).toLocaleString('es-CL')}`} onClose={onClose}>
    <div className="preparation-dialog-body">
      <p>No se eliminarán proyectos que ya tienes. La sesión, los aliases Git y las rutas de este equipo no se importan.</p>
      <dl className="preparation-restore-summary"><div><dt>Proyectos nuevos</dt><dd>{plan.added.length}</dd></div><div><dt>Fichas diferentes</dt><dd>{plan.conflicts.length}</dd></div><div><dt>Reglas diferentes</dt><dd>{plan.ruleConflicts.length}</dd></div></dl>
      <fieldset className="preparation-restore-policy"><legend>Cuando el respaldo y este navegador sean diferentes</legend><label className="preparation-check"><input type="radio" name="restore-policy" value="keep" checked={policy === 'keep'} onChange={() => setPolicy('keep')} /> Conservar fichas, reglas y preferencias actuales; añadir lo que falta</label><label className="preparation-check"><input type="radio" name="restore-policy" value="incoming" checked={policy === 'incoming'} onChange={() => setPolicy('incoming')} /> Usar las fichas, reglas y preferencias del respaldo</label></fieldset>
      {plan.preferencesDiffer && <p className="preparation-notice">Tus preferencias personales son diferentes. Se {policy === 'keep' ? 'conservarán las actuales' : 'usarán las del respaldo'}.</p>}
      {plan.conflicts.length > 0 && <section><h3>Fichas con diferencias</h3><ul>{plan.conflicts.map((repo) => <li key={projectKey(repo)}>{projectKey(repo)}</li>)}</ul></section>}
      {plan.ruleConflicts.length > 0 && <section><h3>Reglas con diferencias</h3><ul>{plan.ruleConflicts.map((rule) => <li key={`${rule.id}@${rule.version}`}>{rule.name}</li>)}</ul></section>}
      <details className="preparation-context-preview"><summary>Ver las fichas y preferencias del respaldo</summary><pre>{JSON.stringify({ projects: backup.repositories, personalPreferences: backup.personalPreferences, rules: backup.rules.map((rule) => ({ name: rule.name, content: rule.content })) }, null, 2)}</pre></details>
      {plan.unresolved.length > 0 && <p className="preparation-error" role="alert">Hay referencias que no pueden recuperarse: {plan.unresolved.join(', ')}. Conserva el respaldo y revisa su biblioteca antes de restaurar.</p>}
      {plan.validationError && <p className="preparation-error" role="alert">No se puede restaurar esta combinación: {plan.validationError} Reduce proyectos, reglas o textos antes de reintentar. No se aplicó ningún cambio.</p>}
      <p className="preparation-notice">Se conservará una copia local del estado anterior para Deshacer última restauración. La opción desaparece al guardar cambios posteriores.</p>
      <PreparationError message={error} />
    </div>
    <footer className="settings-footer"><button type="button" className="button button-secondary" data-autofocus onClick={onClose}>Cancelar</button><button type="button" className="button button-primary" disabled={plan.unresolved.length > 0 || Boolean(plan.validationError)} onClick={restore}>Restaurar respaldo</button></footer>
  </PreparationDialog>
}
