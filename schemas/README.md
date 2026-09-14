# Frontend-only contracts

These schemas describe local configuration, a portable JSON file, transient
ReviewContext and optional machine metadata. They are contracts for files and
TypeScript boundaries, not runtime classes or backend models.

- `domain.schema.json`: reusable local shapes.
- `portable-export.schema.json`: portable configuration file.
- `review-context.schema.json`: one review preparation context.
- `machine.schema.json`: optional local diagnostics metadata.

No schema contains users, accounts, sessions, server persistence, Web Push or
webhook data. Secrets and absolute machine paths are excluded from normal
export.
