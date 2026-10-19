# ReviewContext contract

`ReviewContext` is a practical transient object for preparing one review. It is
regenerated from Bitbucket data and local configuration, not persisted as a
complex record.

```text
repository · pullRequest · source/target branches · author
commits · diffstat · changed files · comments/activity
review date / known reviewed commit · matched rules/rulepacks · instructions
testing expectations · output format
```

The current app builds this object on demand for one PR, displays Markdown and
JSON, and lets the user copy either representation into Codex. Applicable
Las reglas aplicables aparecen como unidades categorizadas y versionadas; los
rulepacks se conservan en JSON para compatibilidad y para sus expectativas de
testing/referencias. Un repositorio sin reglas sigue produciendo un contexto
válido.

El diálogo ofrece tres acciones distintas: copiar únicamente reglas, copiar
el contexto técnico del PR y preparar un bloque Markdown combinado para Codex.
Todas son operaciones de copia; no ejecutan Codex ni modifican el repositorio.

`LocalReviewGuide` y `ReviewContextDialog` comparten `useReviewContext` y la
misma clave por cuenta/repositorio/PR/versión. La copia directa refresca bajo
demanda; abrir el diálogo reutiliza la lectura reciente durante 30 segundos y
ofrece actualización explícita. No se carga el contexto por cada tarjeta al
abrir la cola. El consumidor transmite cancelación y la lectura completa se
limita a 90 segundos, además del timeout de cada solicitud.

`commentReplies` conserva respuestas directas y continuaciones con un ancestro
del revisor, usando UUID y nombre normalizado como fallback. El recorrido
tolera ancestros faltantes y corta ciclos. `pendingCommentReplies` es el
subconjunto posterior a la última participación; no es un registro de lectura
ni prueba de que el resto esté resuelto. Se usa la actividad recién consultada
para derivar la revisión; solo se reutiliza la actividad de la cola si falla
esa lectura, señalada en `unavailable`.

`buildCodexPreparation` añade a los datos remotos el mapeo de Git y una nota
manual opcional, sin modificar ni persistir el objeto remoto. El destino Chile
se deriva de `propyme*`/`pine*`; otros destinos distintos de `peru` se etiquetan
Perú inferido. Los remotos actualizados no se comprueban en el frontend.
Las notas externas no se consultan ni persisten: pertenecen solo al registro
montado. El texto distingue datos del autor de instrucciones del revisor y
pide comprobar cada observación con el código actual.

Si `comments` no está disponible, la copia combinada queda bloqueada con
reintento; Markdown y JSON siguen permitiendo inspección con las limitaciones
explícitas. Una respuesta fallida no se representa como cero comentarios.
