# UX Contract

## Product context

- Audience: revisor QA personal de Pull Requests de Bitbucket.
- Primary jobs: detectar qué revisar, preparar contexto local y consultar la propia actividad.
- Target market(s): herramienta interna personal del equipo Kontroller.
- Active locales: español de Chile (`es-CL`).
- Language/content register and native-review policy: español claro; nombres técnicos, ramas y nombres propios se conservan.
- Timezone/calendar policy: fechas formateadas con la zona horaria local del navegador.
- Accessibility target: WCAG 2.2 AA.

## Visual contract

- Project `DESIGN.md`: fuente de intención visual y tokens.
- Token ownership model: `DESIGN.md` documenta el sistema; `src/styles.css` es la fuente runtime canónica.
- Runtime design-system/token source: variables CSS en `src/styles.css`.
- Supported themes: dark-only actualmente.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Date | `DateRangePicker` | `src/components/DateRangePicker.tsx` | presets + calendario propio | teclado, locale, viewport estrecho |
| Table Selection | `QueueView` | `src/components/QueueView.tsx` | selección no masiva | foco + responsive |
| Select/Listbox | Native `<select>` | `AuthorsView` + browser popup | selección nativa | teclado + viewport |
| Toast | `sonner` en `src/main.tsx` | `src/main.tsx` | success / warning / error | live region + feedback visual |
| PWA update | `usePwaUpdate` + `PwaManager` | `src/hooks/usePwaUpdate.ts` | activación manual + recarga coordinada | builds sucesivos, timeout y reintento |
| Local review preparation | `LocalReviewGuide` + `useReviewContext` + `ReviewContextDialog` | `src/lib/reviewContext.ts` | copia directa / vista previa con el mismo texto | conversaciones, país, datos parciales, portapapeles, móvil |
| Project preparation | `PreparationView` + `ProjectProfileEditor` | `src/lib/projectPreparation.ts` | ficha manual / resultado de Codex revisado | migración, JSON inválido, borrador, copia y contexto de PR |
| Preparation form dialog | `PreparationDialog` + `useModalDialog` | `src/components/PreparationDialog.tsx` | diálogo nativo con protección de cambios | foco, Escape, descartar, móvil |
| Portable backup | `PreparationBackupDialog` + `preparationBackup` | `src/lib/preparationBackup.ts` | conservar actuales / usar respaldo | preview, conflictos, cuota, deshacer e idempotencia |
| Form | formularios nativos con `noValidate` | componentes propietarios | alta / edición | validación inline |
| Scrollbar | `src/styles.css` | variables CSS runtime | densidad por superficie | computed style + contraste |
| CRUD | `AuthorsView` | `src/components/AuthorsView.tsx` | retorno a la vista propietaria | toast + foco |

## Component behavior

- Buttons and icon buttons tienen estados hover, focus-visible, active, disabled y busy sin cambiar de tamaño.
- El resumen distingue carga inicial con skeleton, histórico parcial con aviso persistente, error de sincronización con reintento y período sin actividad con empty state.
- Las métricas numéricas animan cambios de valor; `prefers-reduced-motion` desactiva el movimiento.
- El gráfico de actividad siempre acompaña una etiqueta textual y no es la única forma de conocer un valor.

## Dataset navigation

- La cola de PR usa carga incremental explícita.
- Resumen carga inicialmente el mes actual. Los meses se consultan bajo demanda y se guardan en `localStorage`, separados por cuenta, repositorio y zona horaria; los años reutilizan los meses disponibles.
- El rango seleccionado pertenece al dashboard y se conserva al navegar entre Cola, Resumen y Preparar durante la sesión. Una nueva sesión comienza en el mes actual.
- La comparación con el período anterior solo descarga información al pedirla explícitamente; si ya hay cobertura guardada, puede mostrarla sin red.
- El estado de carga conserva la geometría aproximada del contenido final.
- Los números parciales se etiquetan como provisionales y nunca se presentan como un total remoto completo.

## Flow ledger

| Operation | Trigger | Pending | Success feedback | Failure recovery | Focus outcome |
|---|---|---|---|---|---|
| Refresh period | `Actualizar período` | botón ocupado + estado de carga | cifras actualizadas | reintentar sin perder la caché anterior | foco permanece en el control |
| Reload period | `Recargar período` | confirmación; vuelve a leer también la actividad de los PR | toast de inicio y estado persistente | conserva datos anteriores si falla | foco vuelve al disparador |
| Compare periods | `Comparar con período anterior` | indicador sin ocultar el resumen | deltas solo con cobertura suficiente | reintento explícito sin alterar el rango | foco permanece en el control |
| Change date range | preset/calendario | skeleton solo sin caché; avance por meses/repositorio | métricas del rango seleccionado | rango y caché previa conservados; datos parciales etiquetados | foco permanece en el selector |

## Navigation and responsive behavior

- La navegación principal permanece en la cabecera en desktop y pasa a navegación inferior en móvil.
- Resumen cambia de dos columnas a una sola columna; los KPI conservan sus agrupaciones y el timeline elimina solo la fecha redundante, no la acción ni el PR.
- Los paneles no fuerzan un `max-width` arbitrario ni crean scroll horizontal en móvil.

## Overlays and feedback

- Los diálogos propios usan `role="dialog"` o `role="alertdialog"`, foco atrapado, Escape, fondo inerte y restauración de foco.
- No se usan `alert()`, `confirm()` ni `prompt()` del navegador.
- Los toasts comunican resultado de una acción; los estados de carga, error y cobertura permanecen en la superficie que los originó.

## Async and resilience

- Preparar se centra en fichas con propósito, arquitectura, versiones, criterios, evidencia y dudas. Las preferencias personales se guardan una sola vez y se aplican por proyecto. Las reglas antiguas se conservan como avanzadas; los proyectos nuevos no heredan las reglas de Kontroller por defecto.
- Conocer proyecto copia una instrucción limitada y de solo lectura. La app no analiza carpetas ni ejecuta Codex. Pegar su JSON valida repositorio, formato y referencias HTTPS y llena un borrador; se revisa antes de Guardar ficha. La edición manual sigue disponible.
- Los formularios usan el diálogo nativo compartido con el control de foco existente. Cierran con su botón o Escape, no al pulsar el fondo. Con cambios sin guardar ofrecen Seguir editando o Descartar; recargar/cerrar usa la protección de navegación del navegador. Una escritura fallida conserva el borrador y muestra un error persistente.
- La ficha se añade a la copia del proyecto y al contexto del PR, incluso con datos remotos en caché, sin forzar otra consulta. Desactivar preferencias personales también evita incluirlas en el JSON del contexto.
- Las referencias distinguen versión concreta y serie; no prueban compatibilidad automáticamente. Codex debe comprobar manifiestos/lockfiles y señalar conflictos entre evidencia, convenciones y preferencias. La app no interpreta lenguaje natural para resolverlos.
- Descargar respaldo exporta fichas, tecnologías, preferencias, selecciones y copias de las reglas en formato portable v2. Excluye sesión, aliases, estado Git y metadata de rutas del equipo. Se advierte revisar los textos libres antes de compartir. No hay sincronización automática entre PCs.
- Restaurar valida hasta 2 MB y muestra proyectos nuevos, fichas/reglas distintas y preferencias diferentes. Por defecto conserva lo actual y añade faltantes; usar el respaldo exige seleccionar esa opción. Nunca borra otros proyectos. Si la configuración cambia tras la vista previa, pide revisarla otra vez.
- Fichas, biblioteca y preferencias se guardan en una única clave canónica. Restaurar escribe todo junto y conserva un estado anterior acotado en esa misma escritura. Un fallo de cuota no aplica nada parcialmente. Deshacer está disponible hasta la siguiente edición; no modifica sesión ni Git. Las claves antiguas permanecen intactas como respaldo de migración.

- La cola puede refrescarse en segundo plano sin ocultar datos existentes.
- La cola descarga primero PR abiertos, borradores y en cola de fusión. Los fusionados y rechazados se consultan al seleccionar su estado o Todos; sus contadores se omiten hasta completar esa lectura, sin presentar una caché parcial como total.
- Cada lectura de repositorio termina como máximo a los 90 segundos, incluida la espera por un turno de red. Al cancelar o fallar se abortan sus solicitudes pendientes. Se conserva la caché anterior y el error muestra repositorio, operación y motivo; la consola registra solo esos datos y el estado HTTP, nunca credenciales.
- El refresco reutiliza la actividad de PR cuyo `updated_on` no cambió. Volver a enfocar la ventana no relanza la sincronización; se mantienen la consulta cada 10 minutos, reconexión y reintento manual.
- Las estadísticas técnicas de los registros esperan a que termine la lectura principal de la cola y se reutilizan mientras no cambie el PR; sus solicitudes se cancelan al retirar el registro.
- La caché mensual es independiente del histórico antiguo y de la cola rápida: no se mezcla cobertura ni actividad de otras cuentas. Una lectura completa reemplaza su mes; un error o una lectura limitada conserva lo ya disponible.
- Las consultas terminan y guardan sus resultados aunque se salga de Resumen; una respuesta tardía no reemplaza el rango activo. Se permiten dos trabajos de período concurrentes y cuatro lecturas de actividad por trabajo, con timeout por petición.
- Navegar no vuelve a descargar meses guardados. Mientras Resumen está abierto, el mes actual se actualiza en segundo plano cada 10 minutos; los meses anteriores se actualizan manualmente. Al cambiar el día local se amplía la cobertura del mes actual.
- Las métricas y los límites remotos usan el mismo calendario local. Un período sin actividad solo se presenta como tal cuando su cobertura está completa.
- Si falla `localStorage`, la caché en memoria sigue funcionando y se muestra la limitación de persistencia.
- La sincronización manual es segura de repetir; los errores por repositorio se muestran y permiten reintento.
- `Actualizar ahora` espera la activación de la versión PWA antes de recargar la página y bloquea clics duplicados. Si no termina en 15 segundos, conserva el aviso y muestra el error con opción de reintentar. Una activación desde otra pestaña mantiene la recarga que coordina el registro PWA.

## Acceso personal

- Resumen, Reglas, Tecnologías y versiones, Remoto local en Preparar → Autores, y Revisión local se muestran solo cuando el correo de la sesión validada es `javier.mejias@kontrollererp.cl`; la navegación también bloquea Resumen para otras cuentas.
- Este filtro vive en el cliente y sirve para separar la interfaz de uso cotidiano. No es autorización de seguridad: los datos locales y el código de la aplicación no quedan protegidos ante alguien con acceso al mismo navegador o a las herramientas de desarrollo. Para confidencialidad real se necesita autorización en un backend o despliegues separados.
- El login verifica el API token contra Bitbucket antes de crear la sesión. Las solicitudes abortan a los 30 segundos y muestran un error recuperable, en lugar de dejar el formulario cargando indefinidamente.
- `Copiar para Codex` consulta bajo demanda los detalles del PR seleccionado y copia una guía autocontenida; abrir la cola o desplegar la guía no dispara consultas de contexto por cada PR. `Ver contexto` comparte la consulta y permite actualizarla y previsualizar exactamente la guía copiada. Cada lectura tiene un límite total de 90 segundos, cancelación y límite por petición.
- La guía contiene identidad, descripción, URL, ramas, repositorios, remotos configurados, reglas, cambios, comentarios y respuestas directas o anidadas a tus observaciones. Separa el histórico de las respuestas posteriores a tu última participación. Esa fecha y abrir un hilo no demuestran lectura ni resolución. La actividad recién consultada tiene prioridad sobre la de la cola, salvo fallo identificado.
- El país depende de la rama destino: prefijos `propyme`/`pine` corresponden a Chile, `peru` a Perú y el resto a Perú inferido, con advertencia de confirmar excepciones. Una rama ausente no determina país. «Remotos actualizados» es una declaración del usuario, no una comprobación de Git.
- El contexto adicional permite pegar respuestas externas o notas de revisiones anteriores. Es opcional y transitorio por registro: se conserva al cerrar el diálogo o contraer la guía, pero se pierde al retirar el PR, salir de la cola o recargar. No se persiste ni se consulta WhatsApp. La interfaz explica esta excepción al flujo de formularios guardados.
- Mientras se prepara la copia se bloquean duplicados y se conserva el tamaño del botón. Una consulta de comentarios fallida bloquea la guía combinada con error persistente y reintento; no se interpreta como ausencia de respuestas. Otros datos faltantes se advierten también dentro del texto. La copia espera al portapapeles antes de confirmar y, si falla, permite consultar o seleccionar la vista previa.

## Verification

- Required static commands: `tsc -p tsconfig.app.json --noEmit`, `vitest run`, `vite build`, `git diff --check`.
- Browser/device matrix: desktop, móvil estrecho, teclado y `prefers-reduced-motion`.
- Canonical sibling flow used for comparison: Cola de revisión y `SettingsDialog`.
