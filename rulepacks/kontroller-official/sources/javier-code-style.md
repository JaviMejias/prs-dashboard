---
name: javier-code-style
description: Apply Javier's cross-project source-code style preferences during implementation, refactoring, and code review. Use for programming tasks in Javier's projects; repository-specific instructions and formatters take precedence when they conflict.
---

# Javier Code Style

- Write identifiers, filenames, classes, methods, attributes, tests, and developer-facing code in English.
- Write user-visible interface text in Spanish unless the project or requested audience establishes another locale. Strings emitted directly by real-time JavaScript interactions count as user-visible text and may be Spanish.
- Use two-space indentation. Preserve generated files and repository-enforced formatting when changing them manually would conflict with the active formatter or language toolchain.
- Avoid commented-out code and explanatory comments that merely restate the implementation. Prefer clear names and small functions.
- Add a source comment only when it preserves a non-obvious technical decision, system limitation, compatibility constraint, or necessary warning. Write every source-code comment in English.
- Follow applicable `AGENTS.md` and established project conventions. When a repository-specific rule conflicts with these preferences, preserve the repository behavior and disclose the conflict if it affects the requested change.
