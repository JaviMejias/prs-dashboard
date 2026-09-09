---
version: alpha
name: "PR Control Room"
description: "Una bandeja de revisión de ingeniería que hace visible el relevo entre autor y QA con precisión, calma y velocidad."
colors:
  canvas: "#0A1018"
  surface-1: "#101823"
  surface-2: "#162130"
  surface-3: "#1C2939"
  surface-4: "#223145"
  line-subtle: "#263445"
  line-strong: "#38495D"
  text-primary: "#F2F4F3"
  text-secondary: "#AAB5C1"
  text-tertiary: "#8291A3"
  primary: "#61D2BE"
  signal-soft: "#163C3A"
  focus-ring: "#8BE7D6"
  qa-new: "#F2B95F"
  qa-review: "#FF8068"
  qa-waiting: "#A991F2"
  qa-current: "#58C99B"
  qa-ignored: "#8390A0"
  danger: "#F07B72"
typography:
  sans:
    fontFamily: "Instrument Sans, Aptos, system-ui, sans-serif"
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
rounded:
  control: "0.5rem"
  panel: "0.75rem"
  surface: "1rem"
spacing:
  control-gap: "0.5rem"
  component-gap: "0.75rem"
  section-gap: "1.5rem"
  page-gutter: "clamp(1.5rem, 2.5vw, 2.5rem)"
  page-max: "none"
components:
  app-shell:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text-primary}"
    typography: "{typography.sans}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.control}"
    height: "42px"
    padding: "0 14px"
  button-danger:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.danger}"
    rounded: "{rounded.control}"
  input:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
    height: "44px"
  filter-menu:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.panel}"
  filter-selected:
    backgroundColor: "{colors.signal-soft}"
    textColor: "{colors.primary}"
  pull-request-record:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.surface}"
  pull-request-record-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-primary}"
  raised-control:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text-secondary}"
  pressed-control:
    backgroundColor: "{colors.surface-4}"
    textColor: "{colors.text-primary}"
  divider:
    backgroundColor: "{colors.line-subtle}"
  divider-strong:
    backgroundColor: "{colors.line-strong}"
  metadata:
    textColor: "{colors.text-tertiary}"
    typography: "{typography.mono}"
  focus-indicator:
    backgroundColor: "{colors.focus-ring}"
  status-new:
    textColor: "{colors.qa-new}"
  status-review:
    textColor: "{colors.qa-review}"
  status-waiting:
    textColor: "{colors.qa-waiting}"
  status-current:
    textColor: "{colors.qa-current}"
  status-ignored:
    textColor: "{colors.qa-ignored}"
  notification-panel:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.panel}"
  dialog:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.surface}"
  bottom-sheet:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-primary}"
---

# PR Control Room Design System

## Overview

### Creative North Star

PR Control Room toma su carácter de una sala de control de despliegues: superficies oscuras y técnicas, señalética precisa, datos densos pero ordenados y un único color de sistema que confirma que todo está bajo control. No imita un terminal ni convierte cada dato en un panel. Su pieza distintiva es el diagrama compacto de relevo, que muestra de forma causal si el siguiente turno corresponde al autor o a QA.

### Product context and register

- **Audience and primary job:** revisores QA e ingenieros que necesitan decidir rápidamente qué pull request requiere acción, qué cambió y quién actuó al final.
- **Target market(s) and evidence:** herramienta interna del equipo Kontroller; los nombres de repositorios, autores y revisores provienen del flujo real de Bitbucket descrito en el brief del producto.
- **Locale(s) and language policy:** interfaz en español; nombres propios, ramas y términos técnicos de Bitbucket se preservan sin traducir. Fechas y horas usan `es-CL`.
- **Usage scene:** consulta frecuente en desktop y como PWA móvil, con decenas de PR, actualizaciones en segundo plano y alta necesidad de escaneo.
- **Register:** producto de ingeniería. La UI puede ser técnica, pero la explicación de estados debe permanecer humana y directa.
- **Memorable signature:** la señal de relevo autor→QA acompaña cada PR y explica quién debe actuar y por qué.
- **Restraint:** filtros, formularios y acciones mantienen patrones familiares. El color y el movimiento se reservan para estado, prioridad y feedback.
- **Anti-references:** dashboards administrativos de tarjetas repetidas, estética de plantilla Tailwind, glassmorphism, gradientes decorativos, franjas laterales de color y simulaciones de terminal que reduzcan legibilidad.
- **Token ownership/runtime mapping:** `src/styles.css` es la fuente runtime canónica. Este archivo refleja exactamente sus tokens aceptados y documenta su intención. Toda modificación global debe actualizar ambos archivos; la auditoría estricta y `designmd lint` son las barreras contra divergencia.

## Colors

La base usa azul grafito, no negro absoluto, para sostener sesiones largas sin perder contraste. `canvas` contiene la página; `surface-1` agrupa registros continuos; `surface-2` y `surface-3` elevan controles, popovers y estados hover; `surface-4` queda reservado para énfasis breves. Los bordes reemplazan sombras en superficies de datos y las sombras se reservan para capas flotantes.

`primary` es la identidad del producto y se mapea al token runtime `--signal`; comunica conexión, foco seguro y acciones primarias. Los estados QA tienen roles fijos: `qa-new` para primera revisión, `qa-review` para cambios que requieren volver a revisar, `qa-waiting` para turno del autor, `qa-current` para revisión vigente y `qa-ignored` para contenido fuera de la cola personal. Cada estado combina color, icono y texto. `danger` solo comunica error o acción destructiva. `focus-ring` debe permanecer visible en cualquier superficie.

La aplicación es dark-only por ahora. En alto contraste se conservan contornos del sistema y nunca se depende de fondos translúcidos para diferenciar controles.

## Typography

Instrument Sans es la voz principal: títulos compactos, etiquetas legibles y alta densidad sin apariencia administrativa. IBM Plex Mono identifica IDs, repositorios, ramas, tiempos y metadatos técnicos. El cuerpo usa 12–14 px según densidad; títulos de PR usan 15–17 px y la cabecera de pantalla usa una escala fluida de 28–38 px. El peso crea jerarquía antes que el tamaño.

Se evita uppercase en frases completas. Solo kickers y etiquetas técnicas breves usan mayúsculas con tracking. Los títulos admiten hasta tres líneas en móvil; ramas y repositorios pueden truncarse, pero conservan el valor completo mediante `title` cuando corresponde.

## Layout

El contenido ocupa el ancho disponible con gutters fluidos; no existe un `max-width` arbitrario. La pantalla desktop usa una cabecera global de 64 px, una introducción compacta, una sola barra de filtros y una superficie continua de registros. Cada registro usa tres zonas estables: información y relevo, revisores y acciones. Las estadísticas ocupan una franja inferior, no cards independientes.

La densidad se organiza con una escala principal de 8, 12, 16 y 24 px. Se permite 10 o 14 px cuando mejora la alineación óptica de controles compactos. Los skeletons reservan altura para impedir saltos al cargar estadísticas y repositorios.

A 960 px desaparecen las columnas explícitas y el registro reorganiza revisores debajo del contexto. A 760 px se utiliza una composición móvil propia: filtros en una hoja modal de pantalla completa, registros apilados, señal de relevo contenida, estadísticas planas en una cuadrícula adaptativa y configuración a pantalla completa. Los safe areas de PWA se respetan en cabecera, paneles y acciones.

## Elevation & Depth

La profundidad nace primero de capas tonales y bordes. La lista es una superficie continua, mientras cada fila se diferencia con separadores y un cambio tonal sutil en hover/focus. Popovers, notificaciones y menús usan `shadow-popover`; diálogos usan `shadow-dialog`. No se aplican sombras a badges, estadísticas ni a cada dato individual.

La cabecera sticky es casi opaca para proteger la legibilidad. Los overlays tienen un fondo sólido y nunca deben quedar detrás de filtros u otras capas. La jerarquía de z-index está tokenizada en dropdown, popover, header, backdrop, dialog, sheet y toast.

## Shapes

Los controles usan 8 px, paneles 12 px y superficies principales 16 px. Los avatares y puntos de estado son circulares por significado, no por decoración. Los iconos de producto viven en contenedores cuadrados suavemente redondeados. Los divisores son líneas de 1 px; no se utilizan franjas laterales para codificar prioridad.

## Components

### Foundational visual states

Todo control interactivo define default, hover, focus-visible y active. Los estados selected combinan contraste, icono y `aria-pressed` o `aria-expanded`. Busy conserva geometría y comunica progreso con icono animado más texto. Error utiliza una alerta persistente con recuperación; loading inicial combina progreso por repositorio y skeletons; background refresh mantiene los datos visibles. Empty distingue cola al día, filtros sin resultados y ausencia de repositorios.

### Buttons and actions

`button-primary` se reserva para la decisión segura principal; `button-secondary` para acciones de soporte; `button-ghost` para utilidades y `button-danger` para salida o eliminación. Los botones importantes miden al menos 42 px y los icon-only tienen nombre accesible y 36–40 px. Acciones reversibles como ocultar un PR o eliminar un repositorio muestran toast con Deshacer. El menú de cada PR contiene organización personal; la navegación a Bitbucket queda únicamente en el título.

### Navigation and data display

La cabecera contiene identidad, ubicación actual, sincronización, notificaciones y configuración. Los filtros desktop son disclosures diseñados por la aplicación; en móvil se consolidan en una hoja inferior modal. La cola usa registros semánticos, no una tabla rígida, porque su contenido necesita reordenarse en móvil sin perder datos. El botón “Mostrar 20 más” hace explícita la carga incremental y preserva los elementos actuales.

Los badges de ciclo de vida son secundarios. El badge QA y la señal de relevo son la jerarquía operativa principal. Los avatares usan iniciales estables y un aro semántico cuando existe actividad de revisión.

### Forms and overlays

Inputs tienen label visible, 44–48 px de alto, validación propia, estados hover/focus/error y contraste estable. El token secreto ofrece mostrar/ocultar. El diálogo de configuración atrapa foco, cierra con Escape, restaura foco y bloquea el fondo; en móvil ocupa la pantalla. Popovers y paneles no modales cierran al pulsar fuera o Escape.

El centro de notificaciones es una cola de atención, no un historial de toda la actividad. Solo conserva PR nuevos y transiciones en las que vuelve a ser turno del usuario; excluye borradores, PR en cola, estados cerrados y reglas marcadas como “No revisar”. Cada aviso expresa actor, acción y pull request mediante enlaces independientes, icono semántico, referencia técnica y tiempo. Abrir el panel no marca avisos como leídos: la lectura se confirma al seleccionar uno o seguir uno de sus enlaces. Seleccionarlo ajusta el contexto de filtros, desplaza y enfoca el registro con un contorno temporal, nunca con una franja lateral; si el PR cambió de ciclo se comunica su estado real y si dejó de estar cargado se ofrece Bitbucket como recuperación sin afirmar un resultado desconocido. Una ráfaga se agrupa en un único toast y sonido, aunque cada PR se conserva en el panel. La consulta se ejecuta cada 60 segundos mientras la aplicación puede permanecer activa. Los toasts son la capa canónica de feedback transitorio.

### Iconography

Lucide es la única familia. Se usa trazo estándar sin mezclar iconos filled. Tamaños: 14–16 px en metadatos, 17–20 px en controles y 24–25 px en estados vacíos. Los iconos de acciones críticas siempre acompañan texto; solo controles universales como cerrar, refrescar o más opciones pueden quedar sin texto y requieren `aria-label` y tooltip nativo cuando aporta contexto.

### Motion

La interacción usa 100–160 ms y la aparición de contenido 160–240 ms, con desplazamientos de 4–10 px. La curva de sheets es `[0.22, 1, 0.36, 1]`. El movimiento solo comunica apertura, cierre, reordenación, carga o actualización. `prefers-reduced-motion` reduce toda transición a un cambio prácticamente instantáneo; nada esencial depende de animación.

### Content and data visualization

La voz es breve, precisa y accionable: “Tu turno”, “Turno del autor”, “Revisión al día”. Cada explicación responde qué ocurrió y qué debe hacer el usuario. Los números técnicos usan IBM Plex Mono. Adiciones y eliminaciones comparten icono, número y etiqueta; el color es refuerzo, no la única diferencia.

## Do's and Don'ts

- **Do:** hacer visible el siguiente responsable mediante estado, icono y explicación causal.
- **Do:** mantener una superficie continua y aireada para comparar muchos PR sin fragmentar la pantalla.
- **Do:** conservar todos los datos útiles al transformar el layout entre desktop y móvil.
- **Don't:** crear una card independiente para cada métrica, filtro o bloque de contexto.
- **Don't:** introducir colores fuera de los roles semánticos o usar el acento de marca como decoración.
- **Don't:** convertir el móvil en una versión comprimida de las columnas desktop.
