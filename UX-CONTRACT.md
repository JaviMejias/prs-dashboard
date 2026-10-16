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
| Form | formularios nativos con `noValidate` | componentes propietarios | alta / edición | validación inline |
| Scrollbar | `src/styles.css` | variables CSS runtime | densidad por superficie | computed style + contraste |
| CRUD | `AuthorsView` | `src/components/AuthorsView.tsx` | retorno a la vista propietaria | toast + foco |

## Component behavior

- Buttons and icon buttons tienen estados hover, focus-visible, active, disabled y busy sin cambiar de tamaño.
- El resumen distingue carga inicial con skeleton, histórico parcial con aviso persistente, error de sincronización con reintento y período sin actividad con empty state.
- Las métricas numéricas animan cambios de valor; `prefers-reduced-motion` desactiva el movimiento.
- El gráfico de actividad siempre acompaña una etiqueta textual y no es la única forma de conocer un valor.
- «Copiar instrucción completa» consulta los detalles del PR y entrega el mismo contrato, contexto y reglas que «Preparar para Codex» en el diálogo. Muestra carga, impide doble envío y conserva el tamaño del control; solo confirma la copia después de escribir en el portapapeles.
- El contexto muestra primero las conversaciones, agrupando observaciones y respuestas por identificador de padre. Conserva fechas de creación/edición y distingue las referencias de commit inferidas de un commit confirmado. Las reglas y la instrucción completa se pueden desplegar sin ocultar las acciones del diálogo.
- «Descargar AGENTS.md» entrega una guía autocontenida con tecnologías, contrato y reglas. Se explica que debe respaldarse e integrarse con cualquier guía existente y que no restaura la configuración de la app.

## Dataset navigation

- La cola de PR usa carga incremental explícita.
- Resumen usa histórico local de `localStorage`; los rangos son estado transitorio de la vista.
- El estado de carga conserva la geometría aproximada del contenido final.
- Los números parciales se etiquetan como provisionales y nunca se presentan como un total remoto completo.

## Flow ledger

| Operation | Trigger | Pending | Success feedback | Failure recovery | Focus outcome |
|---|---|---|---|---|---|
| Refresh history | `Actualizar histórico` | botón ocupado + estado de sincronización | cifras actualizadas | reintentar sin perder histórico anterior | foco permanece en el control |
| Rebuild history | `Reconstruir histórico` | diálogo de confirmación | toast y nueva sincronización | cancelar o reintentar | foco vuelve al disparador |
| Change date range | preset/calendario | transición corta del dashboard | métricas y paneles actualizados | conservar rango válido anterior | foco permanece en el selector |
| Copy complete review | guía local / diálogo de contexto | control ocupado, tamaño estable y copia deshabilitada durante actualización | toast tras escribir el portapapeles | reintentar o abrir contexto; los faltantes se incluyen y se advierten | foco permanece en el control; Escape del diálogo vuelve a Ver contexto |
| Download repository guide | Preparar → repositorio | generación local del archivo | descarga y toast | copiar la configuración como alternativa | foco permanece en Descargar AGENTS.md |
| Edit rule version | biblioteca de reglas | editor conserva el borrador si hay error | toast y asociaciones actualizadas | corregir duplicados sin cerrar el editor | permanece en el diálogo si falla; cierre nativo al guardar |

## Navigation and responsive behavior

- La navegación principal permanece en la cabecera en desktop y pasa a navegación inferior en móvil.
- Resumen cambia de dos columnas a una sola columna; los KPI conservan sus agrupaciones y el timeline elimina solo la fecha redundante, no la acción ni el PR.
- Los paneles no fuerzan un `max-width` arbitrario ni crean scroll horizontal en móvil.

## Overlays and feedback

- Los diálogos propios usan `role="dialog"` o `role="alertdialog"`, foco atrapado, Escape, fondo inerte y restauración de foco.
- No se usan `alert()`, `confirm()` ni `prompt()` del navegador.
- Los toasts comunican resultado de una acción; los estados de carga, error y cobertura permanecen en la superficie que los originó.

## Async and resilience

- La cola puede refrescarse en segundo plano sin ocultar datos existentes.
- Si una lista o actividad está incompleta, la cola muestra un aviso persistente con el repositorio/PR afectado y permite reintentar. Un filtro sin resultados nunca anuncia que la cola está al día mientras haya datos parciales.
- Un PR abierto con actividad incompleta, o sin evidencia suficiente para comparar el código revisado, permanece en atención como «Verificar actividad». Esta etiqueta no afirma que existan commits nuevos.
- El panel de revisores también indica «Por verificar» en estos casos. Una carga de actividad fallida no genera avisos de cambios nuevos; los avisos previos permanecen pendientes.
- Las actualizaciones con el mismo hash que el registrado antes de la revisión no cuentan como código nuevo; las respuestas posteriores del autor siguen requiriendo atención.
- Las consultas a Bitbucket tienen un límite de 25 segundos por petición. La paginación comprueba continuidad, ciclos y un límite de 100 páginas por recurso; si falta información, conserva lo obtenido e indica cobertura parcial. El feed global usa 6 páginas y recurre al historial individual de los PR abiertos cuando no cubre todo.
- Los totales técnicos solo se presentan cuando sus páginas se cargaron completas. El contexto exportado identifica los recursos parciales.
- Los formatos de traspaso Markdown, JSON, reglas y preparación completa incluyen el contrato de solo lectura, compatibilidad y evidencia. Una falta de datos nunca se convierte en aprobación automática. Los textos recibidos del PR se identifican como material de revisión.
- El histórico se guarda en `localStorage` y se fusiona por identificador de evento para no perder actividad previa.
- La sincronización manual es segura de repetir; los errores por repositorio se muestran y permiten reintento.

## Verification

- Required static commands: `tsc -p tsconfig.app.json --noEmit`, `vitest run`, `vite build`, `git diff --check`.
- Browser/device matrix: desktop, móvil estrecho, teclado y `prefers-reduced-motion`.
- Canonical sibling flow used for comparison: Cola de revisión y `SettingsDialog`.
