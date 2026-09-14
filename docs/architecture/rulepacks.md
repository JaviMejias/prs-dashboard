# Rule Library y composición local

PR Control Room mantiene una biblioteca local de reglas de revisión legibles y
versionadas en Git. La aplicación prepara contenido para Codex; no ejecuta,
evalúa ni interpreta las reglas.

```text
Rule Library → reglas reutilizables → composición del repositorio
             → ReviewContext → instrucciones para Codex
```

Una `Rule` es una unidad reutilizable con categoría, versión opcional,
descripción y contenido Markdown. Un `Rulepack` sigue siendo un grupo de
reglas relacionadas. El repositorio guarda referencias explícitas; no guarda el
contenido de las reglas en `localStorage`.

```text
rulepacks/<name>/
├── rulepack.json
└── sources/
    └── <fuentes respaldadas>.md
```

Metadata identifies nombre, versión, categoría, tecnología y compatibilidad.
Markdown carries human-readable rules. La composición solo resuelve referencias
exactas, elimina duplicados por referencia y conserva el orden configurado.
No hay DSL, condiciones ejecutables, parser, semver ni motor de evaluación.

The metadata currently used by the app is:

```json
{
  "id": "kontroller-official",
  "name": "Reglas oficiales de revisión de Kontroller",
  "version": "1.0.0",
  "description": "...",
  "reviewRules": "sources/agents.md",
  "references": ["sources/kontroller-test-qa.md", "sources/..."],
  "source": "git"
}
```

La aplicación valida metadata, contenido y referencias. Un repositorio puede
usar `ruleRefs` para seleccionar reglas individuales y `rulepackRefs` para
seleccionar el bundle oficial completo. No existe resolución `latest` ni
actualización automática.

Example local mapping:

```text
kontroller_test/kontroller_test
→ kontroller-review-guidelines@1.0.0
→ kontroller-ruby-rails-compatibility@1.0.0
```

The current bundled catalog contains `kontroller-official@1.0.0`, composed
from the seven official source documents supplied for Kontroller. Each source
is preserved in `rulepacks/kontroller-official/sources/` and exposed as one
reusable rule. These local identifiers organize sources; they are not official
`KPR-*` identifiers. A
Un repositorio sin referencias sigue siendo válido y no tiene reglas
aplicables. Las tecnologías/versiones se guardan aparte como contexto
explícito: seleccionar Ruby 2.4.3 no activa automáticamente Rails 5.1.

La UI de `Preparar` es el punto único para ver la biblioteca, seleccionar
reglas, agregar tecnologías/versiones y revisar la composición de cada
repositorio. `Configuración` queda reservada para notificaciones y sesión.
