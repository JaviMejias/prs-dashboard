import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { emptyProjectProfile, projectKey } from '../lib/projectPreparation'
import { getPreparationSettings, savePreparationSettings } from '../lib/storage'
import type { PersonalReviewPreferences, PreparationData, RepoConfig } from '../types'

export function usePreparationSettings(setRepos: (repos: RepoConfig[]) => void) {
  const [data, setData] = useState(getPreparationSettings)
  useEffect(() => {
    const refresh = () => { const next = getPreparationSettings(); setData(next); setRepos(next.repositories) }
    window.addEventListener('prcr:preparation-changed', refresh)
    const onStorage = (event: StorageEvent) => { if (event.key === 'prcr:preparation-v1' || event.key === null) refresh() }
    window.addEventListener('storage', onStorage)
    return () => { window.removeEventListener('prcr:preparation-changed', refresh); window.removeEventListener('storage', onStorage) }
  }, [setRepos])

  const updateProject = (repo: RepoConfig, original: RepoConfig) => {
    const current = getPreparationSettings()
    const stored = current.repositories.find((item) => projectKey(item) === projectKey(repo))
    if (JSON.stringify(stored) !== JSON.stringify(original)) throw new Error('Este proyecto cambió mientras lo editabas. Conserva tu texto y vuelve a abrir la ficha actual antes de guardar.')
    if (!savePreparationSettings({ ...current, repositories: current.repositories.map((item) => projectKey(item) === projectKey(repo) ? repo : item) })) return false
    toast.success('Ficha guardada en este navegador', { description: 'Se incluirá en el contexto de los PR. Descarga un respaldo para llevarla a otro PC.' })
    return true
  }
  const addProject = (workspace: string, repo: string) => {
    const current = getPreparationSettings()
    if (current.repositories.length >= 200) throw new Error('El respaldo portable admite hasta 200 proyectos. Retira uno desde las opciones avanzadas antes de añadir otro.')
    if (current.repositories.some((item) => projectKey(item) === projectKey({ workspace, repo }))) throw new Error('Este proyecto ya está agregado. Edita su ficha desde la lista.')
    if (!savePreparationSettings({ ...current, repositories: [...current.repositories, { workspace, repo, profile: { ...emptyProjectProfile(), useLegacyRules: false } }] })) return false
    toast.success('Proyecto añadido', { description: 'Escribe su ficha o usa Conocer proyecto.' })
    return true
  }
  const updatePreferences = (preferences: PersonalReviewPreferences, original: PersonalReviewPreferences) => {
    const current = getPreparationSettings()
    if (current.personalPreferences.instructions !== original.instructions) throw new Error('Las preferencias cambiaron en otra pestaña. Conserva tu texto y vuelve a abrir la versión actual.')
    if (!savePreparationSettings({ ...current, personalPreferences: preferences })) return false
    toast.success('Preferencias guardadas en este navegador')
    return true
  }
  const restore = (next: PreparationData, original: PreparationData) => {
    if (JSON.stringify(getPreparationSettings()) !== JSON.stringify(original)) throw new Error('La configuración cambió desde la vista previa. Cierra este diálogo y vuelve a seleccionar el respaldo para revisar los cambios actuales.')
    if (!savePreparationSettings(next, true)) return false
    toast.success('Respaldo restaurado', { description: 'Puedes deshacerlo mientras no guardes otros cambios.' })
    return true
  }
  const undoRestore = () => {
    const previous = getPreparationSettings().previous
    if (!previous || !savePreparationSettings(previous)) return false
    toast.success('Restauración deshecha')
    return true
  }
  return { data, updateProject, addProject, updatePreferences, restore, undoRestore }
}
