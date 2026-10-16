# Preparación portátil de revisiones

La app compone instrucciones legibles; no ejecuta las reglas ni revisa código por sí misma.

```text
Preparar → tecnologías + referencias de reglas → AGENTS.md del repositorio
Bitbucket → descripción + SHA + commits + archivos + actividad + comentarios
          → ReviewContext → instrucción completa para Codex
```

## Contrato común

`src/lib/reviewPolicy.ts` contiene el contrato de solo lectura, comprobación de compatibilidad y evidencia. Se incluye en la guía del repositorio y en los formatos Markdown, JSON, reglas y preparación completa. Las reglas especializadas lo complementan; un conflicto se debe declarar antes de concluir.

Las versiones configuradas se contrastan con los manifiestos reales del proyecto. Ejecutar un check con un runtime moderno no prueba compatibilidad con Ruby 2.4.3 / Rails 5.1. Las verificaciones pendientes impiden una aprobación automática. El resultado declara SHA, merge base, alcance, versiones encontradas, comprobaciones ejecutadas y límites.

## Referencias

El catálogo incluido es `kontroller-official@1.1.0`, con siete reglas de fuentes relativas. La versión 1.1 elimina dependencias de rutas personales y contradicciones entre solo lectura, descartado de archivos y aprobación sin evidencia. El frontmatter de antiguas fuentes de skills se omite al componer una regla.

Las referencias oficiales conocidas de la versión 1.0 se migran explícitamente al contenido 1.1 al resolverlas; la salida identifica la versión real 1.1. Esto conserva selecciones existentes. No hay resolución `latest` ni rangos semánticos; las versiones desconocidas quedan como no disponibles.

Las reglas generales se aplican a todos los repositorios. Las demás se seleccionan con `ruleRefs` o con el pack mediante `rulepackRefs`. La composición elimina duplicados por referencia resuelta. Seleccionar una tecnología no activa otras reglas automáticamente.

Cambiar la versión de una regla local actualiza sus referencias en los repositorios. La versión editada se identifica por su referencia completa para preservar otras versiones y rechazar colisiones. Las reglas oficiales no pueden sobrescribirse mediante este editor.

## Contexto y conversaciones

`reviewPreparation.ts` centraliza la consulta y composición usadas por la copia rápida y el diálogo. La caché separa cuenta, repositorio, PR y revisiones de origen/destino. Cada copia solicita detalles actuales; la configuración local se lee al preparar la instrucción.

Los datos publicados por la API se acompañan de advertencias si faltan versiones, remotos, SHA o recursos. Los SHA informados por Bitbucket deben verificarse en el clon; el checkbox de remotos actualizados es una declaración manual. La app no conoce el merge base local ni ejecuta Git.

Los comentarios conservan ID, padre, autor, creación, edición y ubicación original. Se excluyen borradores no publicados; los eliminados conservan un marcador para no romper el hilo. Los padres ausentes y las relaciones cíclicas se indican como contexto incompleto.

La referencia temporal de un comentario se deduce del último evento de actualización anterior a su **creación**, solo con actividad completa y sin hashes ambiguos en el mismo instante. Siempre se etiqueta como inferida. No demuestra el commit exacto comentado ni constituye un checkpoint de revisión. El esquema consultado y el alcance de los comentarios están descritos en la [API oficial de Bitbucket](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-comments-get).

La descripción y los comentarios se presentan como material del PR, separados del contrato. Cada fuente de regla aparece una vez en el Markdown incluso si también se seleccionó su pack. El JSON conserva datos estructurados y es validable contra `schemas/review-context.schema.json`.

## Portabilidad

Preparar permite copiar la configuración y descargar el mismo contenido como `AGENTS.md`, con tecnologías/versiones y texto completo de las reglas. Se puede conservar y respaldar independientemente del chat o del equipo. Si existe una guía en el proyecto, se deben integrar las instrucciones sin sobrescribirla.

Esta descarga no restaura repositorios, remotos, preferencias ni asociaciones dentro de la app. El respaldo/restauración completa de Preparar es un flujo diferente y sigue pendiente.
