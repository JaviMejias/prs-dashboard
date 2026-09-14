# Kontroller legacy JavaScript

Use the repository's jQuery and Turbolinks-era style. Prefer `var` and ordinary functions; avoid adding arrow functions, `let`, `const`, template literals, and other ES6 features.

During review, do not request a change solely for a small, isolated, harmless use of ES6. Report it when it is substantial, repeated, incompatible with the supported runtime or toolchain, inconsistent enough to impair maintenance, or part of a larger JavaScript change that should follow the established style.

- Keep JavaScript out of HTML and ERB files. Use view- or action-specific JavaScript files when appropriate.
- Define at most one `setup()` method per file or module.
- Put page-load initialization and event bindings such as `click`, `change`, `input`, and `focus` inside `setup()`.
- Define reusable functions as module methods before `setup()`. Do not nest named helper functions inside other functions or event callbacks.
- Keep only trivial logic inside an event callback. Move substantial logic into a separately named module method and call it from the event.
- Use `data-resource` to scope initialization to the relevant resource and `data-action` to separate index, form, and other view behavior according to existing project patterns.
- Guard plugins that may be initialized repeatedly, such as Select2 or DataTables, using the repository's established initialized-state checks. Make setup idempotent when the page lifecycle may invoke it more than once.
- Keep identifiers and source comments in English. Direct user-facing feedback emitted at interaction time may be Spanish.

Before adding a retry or fallback `setup()` call, inspect the existing lifecycle and plugin state. Do not duplicate event handlers or initialize widgets twice.
