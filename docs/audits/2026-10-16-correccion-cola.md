# Primera etapa: confianza de la cola

Implementada sobre `218df05a` en la rama `codex/review-reliability`, dentro de `.worktrees/review-reliability`. El checkout original conserva sus eliminaciones preparadas y sus archivos locales. No se han publicado cambios.

## Comportamiento corregido

- **F01:** la actividad que no pudo cargarse deja el PR abierto en atención como «Verificar actividad», incluso si había una aprobación. La comparación sin evidencia suficiente también permanece pendiente. El panel de revisores distingue incertidumbre de una revisión desactualizada. Una solicitud de cambios sin fecha tampoco basta para ocultar el PR como esperando al autor.
- **F02:** las listas, los detalles del contexto y los totales técnicos recorren las páginas restantes. Los ciclos, errores intermedios y el límite de 100 páginas producen cobertura parcial explícita. El feed global conserva su presupuesto de seis páginas y consulta individualmente los PR abiertos si no alcanza a cubrir la actividad. Los totales técnicos incompletos no se presentan como completos.
- **F07:** se compara el hash anterior a la revisión antes de afirmar que el autor envió código nuevo. Una actualización del autor con el mismo hash no cuenta como commit nuevo. Sus respuestas posteriores siguen devolviendo el PR a atención.
- **F13:** un fallo de actividad individual conserva los demás PR. Los errores de listas de cerrados conservan la lista abierta. El fallo inicial de la lista abierta conserva el snapshot anterior de React Query. Cada petición tiene un límite de 25 segundos. Las credenciales expiradas y los permisos se explican sin confundirlos con falta de conexión a internet.
- **F14:** la fusión incremental del histórico procesa todos los resultados disponibles aunque el primero sea parcial.
- **F16:** la cola vuelve a asociar la configuración local actual de cada repositorio a sus PR, sin esperar una nueva lectura remota. Las claves de caché de cola y estadísticas incluyen identidad y repositorio para evitar reutilizar datos ajenos.

El contexto del PR usa la actividad recién consultada para calcular su estado y etiqueta los recursos parciales. Una carga fallida de actividad no crea una notificación que afirme que el autor actualizó el PR; conserva el aviso anterior.

## Verificación

- 82 pruebas pasan en 12 archivos. Se agregaron 19 casos respecto de la base de 63 pruebas: séptima página, límites y ciclos de paginación, errores parciales, fallos individuales, conservación de resultados, comparación de hashes, incertidumbre, histórico, contexto y timeout. Se ajustaron expectativas previas que ocultaban la incertidumbre y una comparación de contenido sensible a la nueva línea final del archivo.
- `pnpm build` pasa: TypeScript, Vite y PWA.
- `tsc -p tsconfig.app.json --noEmit`, auditoría estática estricta y `git diff --check` pasan.
- Navegador con API simulada: aviso parcial persistente, PR incierto visible, reintento mediante Enter, recuperación de la clasificación, lista vacía parcial y credenciales expiradas conservando los PR previos.
- Escritorio y viewport móvil de 390 × 844; sin desbordamiento horizontal en el aviso. No se consultó la cuenta real de Bitbucket. No se verificaron dispositivos físicos, lector de pantalla ni una preferencia de movimiento reducido emulada.

## Evidencia visual

![Cola parcial en escritorio](C:/Users/desti/.codex/visualizations/2026/10/16/01a14609-4f6c-7c61-aac8-607dc109560a/review-reliability/01-cola-parcial-desktop.png)

![Aviso parcial en móvil](C:/Users/desti/.codex/visualizations/2026/10/16/01a14609-4f6c-7c61-aac8-607dc109560a/review-reliability/02-cola-parcial-mobile.png)

![Recuperación tras reintentar](C:/Users/desti/.codex/visualizations/2026/10/16/01a14609-4f6c-7c61-aac8-607dc109560a/review-reliability/03-recuperacion.png)

![Cola vacía con datos parciales](C:/Users/desti/.codex/visualizations/2026/10/16/01a14609-4f6c-7c61-aac8-607dc109560a/review-reliability/04-vacio-parcial.png)

![Credenciales expiradas con datos conservados](C:/Users/desti/.codex/visualizations/2026/10/16/01a14609-4f6c-7c61-aac8-607dc109560a/review-reliability/05-credenciales.png)

## Siguiente etapa

Quedan pendientes las reglas coherentes y portátiles para Ruby/Rails, la guía enriquecida con descripción, conversaciones y SHA, la exportación/restauración completa de Preparar, y los demás hallazgos de métricas, persistencia y navegación. Esta etapa mejora la detección y la transparencia de los datos; todavía no resuelve la recuperación del contexto de revisión entre equipos.
