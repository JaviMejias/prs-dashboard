# ReviewContext contract

`ReviewContext` is a practical transient object for preparing one review. It is
regenerated from Bitbucket data and local configuration, not persisted as a
complex record.

```text
repository · pullRequest · source/target branches · author
commits · diffstat · changed files · comments/activity
previous local snapshot · matched rules/rulepacks · instructions
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
