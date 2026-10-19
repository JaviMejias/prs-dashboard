import { useState, type Dispatch, type SetStateAction } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import PreparationDialog, { PreparationError } from './PreparationDialog'
import { emptyProjectProfile, isPreparationRepository, isRepositoryTechnology, parseProjectDiscovery, projectKey, technologyReference } from '../lib/projectPreparation'
import type { ProjectProfile, RepoConfig, RepositoryTechnology } from '../types'

const profileFields = [
  ['summary', '¿Qué hace esta aplicación?', 'Propósito, usuarios y módulos principales.'],
  ['architecture', 'Arquitectura y características', 'Por ejemplo: SaaS multitenant, PWA, módulos por país. Solo lo confirmado.'],
  ['reviewGuidelines', '¿Cómo debemos revisar este proyecto?', 'Restricciones, riesgos prioritarios, pruebas y qué queda fuera del alcance.'],
  ['evidence', 'Evidencia del proyecto', 'Archivos relativos que respaldan el contexto y las versiones.'],
  ['unknowns', 'Dudas o información pendiente', 'Lo inferido o no confirmado, sin presentarlo como un hecho.'],
] as const

function ProfileFields({ profile, setProfile }: { profile: ProjectProfile; setProfile: Dispatch<SetStateAction<ProjectProfile>> }) {
  const fields = profileFields.map(([key, label, help], index) => <label className="preparation-field" key={key}><span>{label}</span><textarea className="resize-none" rows={key === 'summary' ? 3 : 4} data-autofocus={index === 0 ? true : undefined} value={profile[key]} onChange={(event) => setProfile((current) => ({ ...current, [key]: event.target.value }))} maxLength={30_000} placeholder={help} /><small>{help}</small></label>)
  return <>{fields.slice(0, 3)}<details className="preparation-import-result"><summary>Evidencia y dudas del proyecto</summary>{fields.slice(3)}</details></>
}

function TechnologyFields({ item, onChange, onRemove }: { item: RepositoryTechnology; onChange: (item: RepositoryTechnology) => void; onRemove: () => void }) {
  const reference = technologyReference(item)
  return <fieldset className="preparation-technology"><legend>{item.name || 'Nueva tecnología'}</legend>
    <div className="preparation-field-grid">
      <label className="preparation-field"><span>Tecnología</span><input value={item.name} onChange={(event) => onChange({ ...item, name: event.target.value })} maxLength={200} placeholder="Ruby, Rails…" /></label>
      <label className="preparation-field"><span>Versión</span><input value={item.version} onChange={(event) => onChange({ ...item, version: event.target.value })} maxLength={100} placeholder="2.4.3 / No determinada" /></label>
      <label className="preparation-field"><span>Tipo</span><select value={item.kind} onChange={(event) => onChange({ ...item, kind: event.target.value as RepositoryTechnology['kind'] })}><option value="language">Lenguaje</option><option value="framework">Framework</option><option value="library">Biblioteca</option></select></label>
    </div>
    <details className="preparation-import-result"><summary>Evidencia y documentación de esta versión</summary><label className="preparation-field"><span>Evidencia de la versión</span><input value={item.evidence || ''} onChange={(event) => onChange({ ...item, evidence: event.target.value })} maxLength={2000} placeholder="Gemfile.lock:12" /></label><label className="preparation-field"><span>Referencia oficial HTTPS (opcional)</span><input type="url" value={item.documentationUrl || ''} onChange={(event) => onChange({ ...item, documentationUrl: event.target.value.trim() || undefined })} maxLength={2048} placeholder="https://…" /></label></details>
    <div className="preparation-actions">{reference && <a href={reference.url} target="_blank" rel="noreferrer">{reference.label}</a>}<button type="button" className="button button-ghost button-danger" onClick={onRemove}><Trash2 size={14} /> Quitar tecnología</button></div>
  </fieldset>
}

function TechnologyList({ technologies, setTechnologies }: { technologies: RepositoryTechnology[]; setTechnologies: Dispatch<SetStateAction<RepositoryTechnology[]>> }) {
  return <section className="preparation-editor-section"><h3>Tecnologías y versiones</h3><p>Las referencias ayudan a verificar compatibilidad; no descargan ni convierten documentación en reglas automáticamente.</p>
    {technologies.map((item) => <TechnologyFields key={item.id} item={item} onChange={(next) => setTechnologies((current) => current.map((row) => row.id === item.id ? next : row))} onRemove={() => setTechnologies((current) => current.filter((row) => row.id !== item.id))} />)}
    <button type="button" className="button button-secondary" disabled={technologies.length >= 100} onClick={() => setTechnologies((current) => [...current, { id: `technology-${Date.now()}-${current.length}`, name: '', version: '', kind: 'language' }])}><Plus size={15} /> Añadir tecnología</button>
  </section>
}

export default function ProjectProfileEditor({ repo, onSave, onClose }: { repo: RepoConfig; onSave: (repo: RepoConfig) => boolean; onClose: () => void }) {
  const [profile, setProfile] = useState(repo.profile || emptyProjectProfile)
  const [technologies, setTechnologies] = useState(repo.technologies || [])
  const [pasted, setPasted] = useState('')
  const [error, setError] = useState('')
  const [reviewingImport, setReviewingImport] = useState(false)
  const dirty = JSON.stringify({ profile, technologies }) !== JSON.stringify({ profile: repo.profile || emptyProjectProfile(), technologies: repo.technologies || [] }) || Boolean(pasted)

  const importResult = () => {
    try {
      const result = parseProjectDiscovery(pasted, repo)
      setProfile(result.profile)
      setTechnologies(result.technologies)
      setPasted('')
      setReviewingImport(true)
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo leer el resultado.') }
  }
  const save = () => {
    if (pasted.trim()) { setError('Primero pulsa Revisar resultado, o borra el JSON pegado. No se guardará texto sin revisar.'); return }
    const next = { ...repo, profile: { ...profile, updatedAt: new Date().toISOString() }, technologies }
    const invalidTechnology = technologies.findIndex((item) => !isRepositoryTechnology(item))
    if (invalidTechnology >= 0) { setError(`Revisa la tecnología ${invalidTechnology + 1} (${technologies[invalidTechnology].name || 'sin nombre'}): completa nombre y versión, y usa una referencia HTTPS válida si la agregaste.`); return }
    if (!isPreparationRepository(next)) { setError('Revisa las tecnologías: cada una necesita nombre, versión (o No determinada), tipo y una referencia HTTPS válida si la agregaste.'); return }
    try {
      if (!onSave(next)) { setError('No se pudo guardar en este navegador. La ficha anterior sigue intacta; conserva tus cambios y reintenta.'); return }
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar la ficha.') }
  }
  return <PreparationDialog title={`Ficha de ${repo.repo}`} description={projectKey(repo)} dirty={dirty} onClose={onClose}>
    <form noValidate onSubmit={(event) => { event.preventDefault(); save() }} className="preparation-form">
      <div className="preparation-dialog-body">
        <details className="preparation-import-result"><summary>Pegar el resultado de Codex</summary><p>Usa Conocer proyecto para obtener la instrucción. La app no analiza tu carpeta local.</p><label className="preparation-field"><span>Resultado JSON de Codex</span><textarea className="resize-none" rows={7} value={pasted} onChange={(event) => setPasted(event.target.value)} placeholder="Pega aquí el JSON completo…" /></label><button type="button" className="button button-secondary" disabled={!pasted.trim()} onClick={importResult}>Revisar resultado</button></details>
        {reviewingImport && <p role="status" className="preparation-notice">Resultado cargado como borrador. Revisa contexto, versiones y dudas antes de guardar; nada se ha aplicado todavía.</p>}
        <PreparationError message={error} />
        <ProfileFields profile={profile} setProfile={setProfile} />
        <TechnologyList technologies={technologies} setTechnologies={setTechnologies} />
        <section className="preparation-editor-section"><h3>Reglas que se aplicarán</h3><label className="preparation-check"><input type="checkbox" checked={profile.usePersonalPreferences} onChange={(event) => setProfile((current) => ({ ...current, usePersonalPreferences: event.target.checked }))} /> Aplicar mis preferencias personales</label><label className="preparation-check"><input type="checkbox" checked={profile.useLegacyRules} onChange={(event) => setProfile((current) => ({ ...current, useLegacyRules: event.target.checked }))} /> Incluir las reglas avanzadas asociadas a este proyecto</label><p>Las convenciones verificadas del proyecto tienen prioridad. Codex debe señalar cualquier contradicción; la app no interpreta reglas en lenguaje natural.</p></section>
      </div>
      <footer className="settings-footer"><button type="submit" className="button button-primary">Guardar ficha</button></footer>
    </form>
  </PreparationDialog>
}
