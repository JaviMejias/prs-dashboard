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
| Daily project context | `ProjectSessionLauncher` + `PreparationDialog` | `src/lib/projectSession.ts` | recordatorio diario / apertura manual por proyecto | día local, versión, portapapeles, cuota, teclado y móvil |
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
- Resumen muestra inicialmente el mes actual, pero importa un inventario anual por cuenta, repositorio y zona horaria. Los meses del mismo año reutilizan ese inventario y su actividad. Los PR creados antes de enero también se incluyen si pudieron tener actividad durante el año; el límite final nunca descarta PR por haber sido actualizados después del período.
- El rango seleccionado pertenece al dashboard y se conserva al navegar entre Cola, Resumen y Preparar durante la sesión. Una nueva sesión comienza en el mes actual.
- La comparación con el período anterior solo descarga información al pedirla explícitamente; si ya hay cobertura guardada, puede mostrarla sin red.
- El estado de carga conserva la geometría aproximada del contenido final.
- Los números parciales se etiquetan como provisionales y nunca se presentan como un total remoto completo.

## Flow ledger

| Operation | Trigger | Pending | Success feedback | Failure recovery | Focus outcome |
|---|---|---|---|---|---|
| Refresh period | `Actualizar período` / `Reanudar importación` | etapa y avance por PR + Pausar importación | cifras actualizadas | conserva páginas y cursor de continuación | foco permanece en la acción |
| Reload period | `Recargar período` | confirmación del costo: vuelve a leer los años del período y su actividad | toast de inicio y estado persistente | conserva datos anteriores si falla | foco vuelve al disparador |
| Compare periods | `Comparar con período anterior` | indicador sin ocultar el resumen | deltas solo con cobertura suficiente | reintento explícito sin alterar el rango | foco permanece en el control |
| Change date range | preset/calendario | skeleton solo sin datos; avance de listado/actividad | métricas del rango seleccionado desde histórico compartido | rango y avance guardados; datos parciales etiquetados | foco permanece en el selector |
| Download report | `Descargar informe` | disponible solo con período completo y sin importación activa | archivo Markdown con totales y evidencia de cada evento propio del rango | error transitorio sin perder datos | foco permanece en el botón |

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
- La ficha sigue disponible en las exportaciones completas del proyecto y del PR, incluso con datos remotos en caché, sin forzar otra consulta. La guía compacta del PR referencia su versión sin repetirla. Desactivar preferencias personales también evita incluirlas en el JSON del contexto.
- El contexto inicial se copia una vez por chat y proyecto. Un único diálogo de jornada permite elegir proyecto; su resumen incluye ficha y preferencias, pero solo el índice de reglas avanzadas. Avisa que el contenido completo debe consultarse cuando una regla aplique; el índice no demuestra que el agente la conozca. Copiar contexto completo y AGENTS.md mantienen las reglas íntegras.
- El aviso diario usa el calendario local del navegador y una huella del contenido aplicable, no intervalos de 24 horas ni el timestamp de guardado. Se comprueba al abrir, volver a enfocar y cada minuto mientras la app puede ejecutar código. Con otra capa modal abierta, espera al siguiente chequeo. Cambiar el contenido vuelve a dejar el aviso pendiente. No hay notificación con la app cerrada.
- Cerrar o posponer registra el recordatorio por cuenta/navegador, no la entrega ni lectura por el agente. No se exporta ni se consulta la existencia de chats externos. Una escritura fallida mantiene el recibo en memoria hasta recargar y muestra su limitación. La apertura manual siempre sigue disponible desde la barra, la ficha y la guía del PR; un error de portapapeles conserva el texto seleccionable.
- Las referencias distinguen versión concreta y serie; no prueban compatibilidad automáticamente. Codex debe comprobar manifiestos/lockfiles y señalar conflictos entre evidencia, convenciones y preferencias. La app no interpreta lenguaje natural para resolverlos.
- Descargar respaldo exporta fichas, tecnologías, preferencias, selecciones y copias de las reglas en formato portable v2. Excluye sesión, aliases, estado Git y metadata de rutas del equipo. Se advierte revisar los textos libres antes de compartir. No hay sincronización automática entre PCs.
- Restaurar valida hasta 2 MB y muestra proyectos nuevos, fichas/reglas distintas y preferencias diferentes. Por defecto conserva lo actual y añade faltantes; usar el respaldo exige seleccionar esa opción. Nunca borra otros proyectos. Si la configuración cambia tras la vista previa, pide revisarla otra vez.
- Fichas, biblioteca y preferencias se guardan en una única clave canónica. Restaurar escribe todo junto y conserva un estado anterior acotado en esa misma escritura. Un fallo de cuota no aplica nada parcialmente. Deshacer está disponible hasta la siguiente edición; no modifica sesión ni Git. Las claves antiguas permanecen intactas como respaldo de migración.

- La cola puede refrescarse en segundo plano sin ocultar datos existentes.
- La cola descarga primero PR abiertos, borradores y en cola de fusión. Los fusionados y rechazados se consultan al seleccionar su estado o Todos; sus contadores se omiten hasta completar esa lectura, sin presentar una caché parcial como total.
- Cada lectura de repositorio termina como máximo a los 90 segundos, incluida la espera por un turno de red. Al cancelar o fallar se abortan sus solicitudes pendientes. Se conserva la caché anterior y el error muestra repositorio, operación y motivo; la consola registra solo esos datos y el estado HTTP, nunca credenciales.
- El refresco automático reutiliza la actividad de PR cuyo `updated_on` no cambió. Actualizar pull requests invalida esa actividad aunque la fecha siga igual, vuelve a consultar las listas activas y renueva estadísticas y contexto ya abiertos; los detalles cerrados quedan pendientes para su próxima apertura, sin descargar todo el histórico. La invalidación se limita a la cuenta y repositorios actuales y conserva los datos ante fallos. Las consultas a Bitbucket omiten la caché HTTP del navegador; React Query sigue controlando la reutilización en memoria. Volver a enfocar la ventana no relanza la sincronización; se mantienen la consulta cada 10 minutos, reconexión y reintento manual.
- Las estadísticas técnicas de los registros esperan a que termine la lectura principal de la cola y se reutilizan mientras no cambie el PR; sus solicitudes se cancelan al retirar el registro.
- El histórico reanudable usa IndexedDB (`prcr-review-history-v2`) con registros por PR y un manifiesto por año. Cada página guarda datos y cursor en una transacción antes de anunciar avance. El histórico mensual anterior permanece intacto y sirve como evidencia provisional hasta completar la nueva lectura; no certifica cobertura anual.
- La importación se realiza por bloques de hasta diez páginas o 90 segundos y se continúa mientras Resumen esté abierto. No hay un tope de cien páginas ni muestreo: un bloque pendiente nunca se declara completo. Las peticiones individuales mantienen su límite de 30 segundos. Al salir se cancela la lectura sin adelantar el cursor de una página no guardada; volver permite continuar. Pausar importación conserva el último punto guardado.
- Las consultas históricas se serializan y separan al menos cinco segundos por cuenta. Donde Web Locks está disponible se coordinan también las pestañas y se relee el manifiesto dentro del bloqueo. La cola de revisión conserva sus controles actuales. Un 429 legible desde la importación pausa las siguientes peticiones de esa cuenta durante al menos un minuto, respetando Retry-After cuando el navegador lo permite. La pausa se conserva en localStorage. Un rechazo sin estado HTTP legible también pausa prudentemente y explica que puede ser conexión, timeout o CORS; nunca se afirma un 429 no observado. Reanudar antes de acabar la pausa no envía otra petición.
- Los PR con la misma versión se reutilizan desde disco; Actualizar período vuelve a leer el inventario y solo la actividad cambiada o pendiente. Recargar período fuerza las lecturas de los años afectados, con confirmación y conservación de los datos previos. Los cursores repetidos o externos al repositorio detienen la lectura con error; nunca reciben credenciales fuera de Bitbucket.
- Cambiar de mes no repite las páginas ya guardadas. El año actual se comprueba cada diez minutos mientras Resumen esté abierto; los años anteriores se actualizan manualmente. Al cambiar el día se amplía la cobertura. Los datos de otras cuentas, repositorios o zonas horarias no se mezclan.
- Las métricas y los límites remotos usan el mismo calendario local. Un período sin actividad solo se presenta como tal cuando su cobertura está completa.
- Si IndexedDB falla, la importación puede seguir en memoria y muestra un aviso persistente: cerrar o recargar puede perder ese avance. El almacenamiento es local, no un respaldo ni sincronización entre PCs. El informe descargable no incluye sesión ni tokens y debe revisarse antes de compartir referencias privadas.
- El informe solo se habilita después de recorrer las páginas necesarias sin errores pendientes. Incluye rango, revisor, zona horaria, fecha de generación, totales y todos los eventos propios del período, sin el recorte visual del timeline. Completo describe cobertura de la API, no un registro inmutable: Bitbucket puede eliminar o dejar de exponer información. Los comentarios se atribuyen a su creación, no a una edición posterior. Las solicitudes de cambios del registro de actividad se conservan aunque el estado actual del revisor haya cambiado; la participación inferida desde participantes se identifica como tal en el alcance del informe.
- La sincronización manual es segura de repetir; los errores por repositorio se muestran y permiten reintento.
- `Actualizar ahora` espera la activación de la versión PWA antes de recargar la página y bloquea clics duplicados. Si no termina en 15 segundos, conserva el aviso y muestra el error con opción de reintentar. Una activación desde otra pestaña mantiene la recarga que coordina el registro PWA.

## Acceso personal

- Resumen, Reglas, Tecnologías y versiones, Remoto local en Preparar → Autores, y Revisión local se muestran solo cuando el correo de la sesión validada es `javier.mejias@kontrollererp.cl`; la navegación también bloquea Resumen para otras cuentas.
- Este filtro vive en el cliente y sirve para separar la interfaz de uso cotidiano. No es autorización de seguridad: los datos locales y el código de la aplicación no quedan protegidos ante alguien con acceso al mismo navegador o a las herramientas de desarrollo. Para confidencialidad real se necesita autorización en un backend o despliegues separados.
- El login verifica el API token contra Bitbucket antes de crear la sesión. Las solicitudes abortan a los 30 segundos y muestran un error recuperable, en lugar de dejar el formulario cargando indefinidamente.
- `Copiar para Codex` consulta bajo demanda los detalles del PR seleccionado y copia una guía compacta; abrir la cola o desplegar la guía no dispara consultas de contexto por cada PR. `Vista previa de la guía` comparte la consulta, permite actualizarla y previsualiza exactamente la guía copiada. Incluir contexto completo del proyecto añade ficha y reglas sin cambiar la selección de conversaciones. Cada lectura tiene un límite total de 90 segundos, cancelación y límite por petición.
- Últimos comentarios orienta a continuar este PR en el mismo chat; Todo el historial orienta a un chat nuevo o recuperar antecedentes. Son ayudas, no detección de chats externos. La primera es una aproximación explícita: observaciones propias creadas dentro de cinco minutos respecto de la última y actividad posterior, con hilos completos. Las fechas de edición no anclan rondas. Los comentarios sin fecha y respuestas sin padre se conservan. Sin identidad, observaciones propias o fechas fiables, se usa todo el historial y se explica la limitación.
- Tras una consulta correcta, el selector compartido se oculta si ambas opciones incluyen exactamente los mismos comentarios, sin cambiar la selección guardada en memoria. En ese caso ambas guías generan el mismo texto de conversaciones; si no hay comentarios, solo indican «No se recibieron comentarios de Bitbucket». Mientras faltan datos o la consulta falla, no se presupone equivalencia ni se informa cero. Con opciones diferentes, los conteos y omisiones aparecen en UI y copia. No se infiere resolución ni lectura. La selección es transitoria por registro; las exportaciones técnicas JSON/Markdown siguen siendo completas.
- Esperando al autor conserva la evidencia personal disponible (fecha de participación y commits), aunque el bloqueo corresponda a otro revisor. Nunca usa la fecha de ese otro revisor como propia y no cambia las reglas de clasificación de la cola. La evidencia faltante sigue identificada como desconocida.
- La guía pide cubrir el diff completo sin cupo ni mínimo de hallazgos, con pasadas complementarias y una comprobación final de omisiones. Los seguimientos abarcan correcciones y el resto del diff; una nueva revisión puede buscar omisiones aunque no existan commits nuevos. Elegir conversaciones recientes no reduce el alcance del código. Exige hallazgos sustentados, sin duplicar causas ni inventar problemas, y declarar cobertura parcial, pendientes y limitaciones cuando corresponda. La app solo prepara la instrucción: no ejecuta ni certifica la exhaustividad de la revisión del agente.
- La guía contiene referencia de la ficha, descripción, URL, ramas, repositorios, remotos, compatibilidad breve, cambios y conversaciones. La referencia no recupera memoria ni exige coincidencia si el chat o AGENTS.md ya contienen instrucciones equivalentes; sí se pide información indispensable ausente o conflictos reales. Las descripciones solo de espacios/caracteres de formato invisibles se identifican como vacías, sin modificar Unicode útil. Cada comentario aparece una vez en la guía, con padre, archivo/línea y relación con observaciones propias. Se identifican intervenciones recibidas del autor y respuestas vinculadas, sin asegurar que no respondió remotamente. Las reglas completas se solicitan cuando son necesarias y faltan. La última participación y abrir un hilo no demuestran lectura ni resolución. La actividad recién consultada tiene prioridad sobre la de la cola, salvo fallo identificado.
- El país depende de la rama destino: prefijos `propyme`/`pine` corresponden a Chile, `peru` a Perú y el resto a Perú inferido, con advertencia de confirmar excepciones. Una rama ausente no determina país. «Remotos actualizados» es una declaración del usuario, no una comprobación de Git.
- El contexto adicional permite pegar respuestas externas o notas de revisiones anteriores. Es opcional y transitorio por registro: se conserva al cerrar el diálogo o contraer la guía, pero se pierde al retirar el PR, salir de la cola o recargar. No se persiste ni se consulta WhatsApp. La interfaz explica esta excepción al flujo de formularios guardados.
- Mientras se prepara la copia se bloquean duplicados y se conserva el tamaño del botón. Una consulta de comentarios fallida bloquea la guía combinada con error persistente y reintento; no se interpreta como ausencia de respuestas. Otros datos faltantes se advierten también dentro del texto. La copia espera al portapapeles antes de confirmar y, si falla, permite consultar o seleccionar la vista previa.

## Verification

- Required static commands: `tsc -p tsconfig.app.json --noEmit`, `vitest run`, `vite build`, `git diff --check`.
- Browser/device matrix: desktop, móvil estrecho, teclado y `prefers-reduced-motion`.
- Canonical sibling flow used for comparison: Cola de revisión y `SettingsDialog`.
