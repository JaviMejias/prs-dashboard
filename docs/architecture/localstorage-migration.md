# localStorage compatibility plan

This is local schema evolution, not migration to another system. No current key
is removed in Phase 0.

| Key | Meaning | Treatment |
|---|---|---|
| `prcr:repos` | repository list | preserve and version |
| `prcr:git-workflow` | aliases/remotes/workflow | preserve; split only if useful |
| `prcr:ignore-rules` | ignored authors/PRs | preserve and normalize |
| `prcr:notification-preferences` | UI preferences | preserve |
| `prcr:notices` | local notice history | derived local state |
| `prcr:snapshot` | comparison baseline | rebuildable/disposable |
| `prcr:session` | current local session | preserve; never export raw token |
| `prcr:pwa-install-hint-dismissed` | browser preference | device-local |

Future changes require a storage version, safe parse fallback, backup and
idempotent migration. IndexedDB is not planned without a concrete need.
