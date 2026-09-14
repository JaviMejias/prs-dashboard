# PR Control Room — Master Architecture & Migration Plan

## 1. Product boundary

PR Control Room is deliberately personal and frontend-only. The browser is the
application; Bitbucket Cloud is the external source queried by the existing
integration. There is no remote account, server-side persistence, multi-user
model, or infrastructure to operate.

## 2. Explicit constraints

- Do not create repositories, services, use cases, entities, aggregates or
  artificial layers when the frontend does not need them.
- Use the simplest suitable representation: TypeScript types/interfaces,
  schemas, pure functions, hooks/stores and configuration files.
- Do not create an independent abstraction merely because a concept appears in
  documentation.
- Keep localStorage as the primary persistence mechanism.
- Add IndexedDB only after a concrete localStorage limitation is demonstrated.
- Treat Cache Storage as derived, disposable browser cache.
- Do not implement later phases now.

## 3. Current state

The app is Vite + React + TypeScript + pnpm. It queries Bitbucket from the
browser, uses React Query memory cache, and stores repositories, aliases,
preferences, notices, snapshots and review configuration in localStorage. The
existing PWA support remains unchanged. No server runtime is part of this
architecture.

## 4. Local domain

Use only the shapes needed by the UI and data flow:

```text
RepositoryConfig
Author / AuthorAlias
IgnoreRule
ReviewPreferences / NotificationPreferences
RepositoryRulepackMapping
ReviewContext (transient)
LocalMachineRepository (small optional metadata)
ExportPackage (file format only)
```

These can be TypeScript interfaces, schemas, pure selectors, hooks or config
files. They are not a persistence domain layer.

## 5. localStorage

Current compatibility keys are `prcr:repos`, `prcr:git-workflow`,
`prcr:ignore-rules`, `prcr:notification-preferences`, `prcr:notices`,
`prcr:snapshot`, `prcr:session` and `prcr:pwa-install-hint-dismissed`.

Configuration remains local. Notices and snapshots are rebuildable local state;
Cache Storage is disposable. Storage evolution requires versioning, safe parse,
backup, idempotent migration and no implicit deletion.

## 6. ExportPackage

ExportPackage is only a versioned portable JSON file, not an application
entity. It contains repository config, aliases, ignore rules, preferences,
review configuration and rulepack mappings. It excludes tokens, cookies,
credentials, absolute paths and machine Git state.

## 7. Rulepacks

Rulepacks are simple, readable Markdown/JSON plus metadata, versioned in Git or
loaded locally. Initially they are composition, not an executable rules engine:

```text
rulepack.json · review-rules.md · testing.md · references/
```

## 8. Repository → Rulepack mapping

Use a small local mapping of repository identifier to ordered rulepack
references and optional overrides. Example:

```text
kontroller_test/kontroller_test
→ kontroller-official@1.0.0
→ kontroller-qa@1.0.0
```

## 9. ReviewContext

ReviewContext is a practical transient contract for preparing one review. It
combines PR metadata, branches, author, commits, diffstat, changed files,
comments, previous local snapshot, matched rulepacks and testing notes. It can
be regenerated, copied or downloaded as Markdown/JSON; it is not a complex
persisted record.

## 10. Codex preparation

```text
Bitbucket data → ReviewContext → Markdown/prompt → Copy → Codex
```

The first integration is explicit copy/download. No Codex API integration is
needed.

## 11. Bitbucket integration

Keep the current direct client for user, repositories, PRs, activity,
comments, commits and diffstat. Continue deriving “cambios nuevos” locally by
comparing activity with the local review snapshot.

## 12. Machine-local information

LocalMachineRepository is only optional metadata for diagnostics and commands:
local path, current branch, SHA, merge-base and working-tree state. It is not a
repository manager. The browser may generate Git commands but cannot execute or
inspect the filesystem automatically.

## 13. Portability between PCs

```text
PC A: Export JSON → transfer file → PC B: Preview → Resolve conflicts → Import
```

Credentials are entered again on the new PC. Rulepacks are obtained separately
from their Git source.

## 14. Future local automation

Only if manual preparation becomes a measured bottleneck, evaluate an optional
local helper for Git and context generation. It must remain separate from the
PWA core and its local configuration model.

## 15. Security boundary

Never export or log Bitbucket tokens, cookies or SSH private keys. The current
local session behavior remains unchanged until a separate security decision.

## 16. Phase 0 deliverables

Local ownership, localStorage compatibility, simple rulepacks, repository
mapping, ReviewContext, export/import and optional machine metadata contracts.

## 17. Permanently out of scope

Backend, Fastify, PostgreSQL, OAuth, sessions, users, ProviderAccount,
Webhooks, Web Push, PushSubscription, Redis, queues, API propia, account sync,
server deployment and multi-user behavior.

## 18. Decisions pending

Exact export conflict UX; whether custom rulepacks are embedded or referenced;
final ReviewContext Markdown format; and whether machine metadata is useful
before a local helper exists.

## 19. Risks

localStorage is browser/profile-specific and limited in capacity. Tokens in the
current local session require careful handling. Rulepack Git sources may move;
browser-only code cannot verify Git state; snapshots can become stale.

## 20. Recommended architecture

```text
React UI
 ├── pure selectors and review-state functions
 ├── localStorage adapters
 ├── Bitbucket API client
 ├── transient ReviewContext builder
 ├── local JSON export/import
 └── local rulepack loader/mapping

Optional future: local Git/Codex helper, only if justified
```

## 21. Exact next step

This approved Phase 0 direction now requires only replacing the oversized
documentation and schemas with frontend-only versions. Do not start any later
implementation phase automatically.
