# Local data ownership

PR Control Room has one personal browser owner. Ownership is a storage and
configuration concern, not a backend domain model.

| Data | Owner | Portable | Derived |
|---|---|---:|---:|
| Repository configuration | local user | Yes | No |
| Friendly names and aliases | local user | Yes | No |
| Ignore rules | local user | Yes | No |
| Review/notification preferences | local user | Yes | No |
| Rulepack mappings | local project config | Yes | No |
| ReviewContext | current review | Optional | Transient |
| PR snapshot and notices | browser state | No | Yes |
| Local paths and Git state | current machine | No | Yes |

Use the simplest representation that fits each feature. Never export secrets or
machine paths as normal configuration. Cache and fetched snapshots are
disposable. Do not create an abstraction solely because a document names it.
