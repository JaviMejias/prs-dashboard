import { useState } from 'react'
import PreparationDialog, { PreparationError } from './PreparationDialog'
import { repositorySlug } from '../lib/projectPreparation'

export default function PreparationAddProject({ onSave, onClose }: { onSave: (workspace: string, repo: string) => boolean; onClose: () => void }) {
  const [workspace, setWorkspace] = useState('')
  const [repo, setRepo] = useState('')
  const [error, setError] = useState('')
  const save = () => {
    if (!repositorySlug(workspace.trim()) || !repositorySlug(repo.trim())) { setError('Escribe el workspace y el slug del repositorio de Bitbucket, sin URL, espacios ni barras.'); return }
    try {
      if (!onSave(workspace.trim(), repo.trim())) { setError('No se pudo guardar el proyecto en este navegador. Reintenta sin cerrar este diálogo.'); return }
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo agregar el proyecto.') }
  }
  return <PreparationDialog title="Añadir proyecto" description="Después podrás escribir la ficha o pedirle a Codex que la prepare." dirty={Boolean(workspace || repo)} onClose={onClose}>
    <form noValidate className="preparation-form" onSubmit={(event) => { event.preventDefault(); save() }}><div className="preparation-dialog-body"><label className="preparation-field"><span>Workspace de Bitbucket</span><input data-autofocus value={workspace} onChange={(event) => setWorkspace(event.target.value)} placeholder="kontroller_test" maxLength={200} /></label><label className="preparation-field"><span>Repositorio</span><input value={repo} onChange={(event) => setRepo(event.target.value)} placeholder="mi_proyecto" maxLength={200} /></label><PreparationError message={error} /></div><footer className="settings-footer"><button type="submit" className="button button-primary">Añadir proyecto</button></footer></form>
  </PreparationDialog>
}
