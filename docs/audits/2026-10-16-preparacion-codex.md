# Segunda etapa: contexto de revisión portátil y guía completa

Implementada en el mismo worktree `.worktrees/review-reliability`, rama `codex/review-reliability`. No se restauraron las eliminaciones del checkout original ni se publicaron cambios.

## Resultado

- **F03:** catálogo oficial 1.1.0 con reglas coherentes de solo lectura y evidencia. Se retiraron dependencias de rutas personales, permisos implícitos para descartar el checkout y respuestas de aprobación sin comprobaciones. Las referencias oficiales conocidas 1.0 se resuelven explícitamente a 1.1 y la preparación identifica esa versión real.
- **F05:** «Copiar instrucción completa» consulta los detalles y compone el mismo contexto que el diálogo. Incluye contrato, versiones, descripción del PR, remotos/repositorios, ramas, SHA publicados, referencia anterior deducida de actividad, archivos, commits, totales y conversaciones. Cada fuente de regla aparece una vez en el Markdown.
- Los hilos conservan la observación original, sus respuestas y respuestas anidadas, IDs, autores, creación/edición y ubicación original. Los padres ausentes se identifican; los eliminados conservan un marcador. No se exportan borradores no publicados.
- Los commits de comentarios se etiquetan como referencias temporales inferidas. Se usa la fecha original de creación y actividad completa; una historia ambigua no recibe un hash inventado. La app no obtiene el merge base del clon ni convierte una referencia deducida en checkpoint verificado.
- El contrato aparece en todas las salidas: instrucción, contexto Markdown, JSON, reglas y guía del repositorio. Exige comprobar compatibilidad con las versiones de producción y declarar comandos, runtime, resultados y comprobaciones pendientes. El texto del PR se presenta como material a revisar.
- **F04, parte de portabilidad:** Preparar descarga `AGENTS.md` autocontenido con tecnologías/versiones, contrato y reglas. El archivo puede respaldarse e integrarse en el clon conservando cualquier guía previa. Su contenido coincide con «Copiar configuración para Codex».
- **F06:** editar una regla local conserva las asociaciones al cambiar su versión y preserva otras versiones del mismo ID. El editor identifica la referencia completa, rechaza colisiones y conserva el borrador cuando falla el guardado. La prueba de navegador detectó un fallo de integración del editor, corregido antes de cerrar la etapa.

## Verificación

- **100 pruebas pasan en 14 archivos**, frente a 82 al comenzar esta etapa. Casos nuevos: agrupación y ciclos, padres ausentes/eliminados, creación frente a edición, inferencia ambigua, compatibilidad y contrato en todos los formatos, descripción, remotos/SHA, datos parciales, separación de caché, migración oficial y conservación de asociaciones entre versiones.
- `pnpm build` pasa: TypeScript, Vite y PWA. `tsc -p tsconfig.app.json --noEmit`, auditoría estática estricta y `git diff --check` pasan.
- Navegador con API ficticia: copia real al portapapeles de una instrucción de 35.078 caracteres con dos hilos y ocho reglas (una creada para la prueba), sin duplicar el contrato ni las fuentes.
- Descarga real de `AGENTS.md` y comparación exacta con la configuración copiada. El archivo de ejemplo contiene las siete reglas oficiales y Ruby 2.4.3 / Rails 5.1.7; no contiene dependencias de rutas personales.
- Edición real 1.0.0 → 2.0.0: la regla sigue marcada y su versión nueva llega a la instrucción de la cola sin recargar.
- Carga simulada lenta: botón ocupado y deshabilitado, ancho estable de 220 px antes y durante la petición. Carga parcial: aviso explícito de comentarios faltantes, sin inventar respuestas.
- JSON copiado desde la interfaz validado estructuralmente con AJV 2020 contra el esquema del proyecto actualizado; sin errores. La comprobación estructural no validó formatos de fecha/URI.
- Escritorio y viewport móvil 390 × 844: guía, conversaciones y acciones disponibles sin desbordamiento horizontal. Escape del diálogo restaura el foco a «Ver contexto».
- No se consultó la cuenta real de Bitbucket, no se ejecutó una revisión del monolito ni se simuló que las pruebas del frontend certificaran un PR de Rails. No se probaron dispositivos físicos, lector de pantalla, permisos de portapapeles denegados o movimiento reducido emulado.

## Evidencia

![Conversaciones del PR y preparación completa](C:/Users/desti/.codex/visualizations/2026/10/16/01a14609-4f6c-7c61-aac8-607dc109560a/review-preparation/01-contexto-desktop.png)

![Guía descargable del repositorio](C:/Users/desti/.codex/visualizations/2026/10/16/01a14609-4f6c-7c61-aac8-607dc109560a/review-preparation/02-guia-repositorio-desktop.png)

![Guía en móvil](C:/Users/desti/.codex/visualizations/2026/10/16/01a14609-4f6c-7c61-aac8-607dc109560a/review-preparation/03-guia-repositorio-mobile.png)

![Versión actualizada y asociación conservada](C:/Users/desti/.codex/visualizations/2026/10/16/01a14609-4f6c-7c61-aac8-607dc109560a/review-preparation/04-regla-version.png)

![Contexto en móvil](C:/Users/desti/.codex/visualizations/2026/10/16/01a14609-4f6c-7c61-aac8-607dc109560a/review-preparation/06-contexto-mobile.png)

Las salidas capturadas con datos ficticios están en la misma carpeta de evidencias: `instruccion-copiada.md`, `contexto-copiado.json` y `kontroller_test-AGENTS.md`.

## Pendiente

La guía descargable recupera el texto general de revisión, pero no es un respaldo/restauración de Preparar. Siguen pendientes la exportación completa de repositorios, remotos, tecnologías, biblioteca y asociaciones, la previsualización de importaciones y los errores de persistencia (F04 restante, F08, F15), además de métricas y navegación. La compatibilidad del código del PR sigue requiriendo las comprobaciones descritas en la guía; la app no ejecuta ni certifica esa revisión.
