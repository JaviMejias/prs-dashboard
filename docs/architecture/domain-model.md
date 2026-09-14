# Practical local concepts

These are data shapes, not entities, aggregates, repositories or services.
They should become TypeScript interfaces, schemas, pure functions, hooks or
configuration files only where the implementation needs them.

| Concept | Representation | Persisted? |
|---|---|---:|
| Repository | existing config/type | Yes |
| Author | Bitbucket-derived data | Usually derived |
| AuthorAlias | local config entry | Yes |
| IgnoreRule | local config entry | Yes |
| Preferences | local config object | Yes |
| Rulepack | Markdown/JSON + metadata | Git/local reference |
| RepositoryRulepackMapping | small local array/object | Yes |
| ReviewContext | transient typed object | No by default |
| LocalMachineRepository | optional diagnostic shape | Local only |
| ExportPackage | JSON file format | File only |

There is intentionally no User, Account, ProviderAccount, Review record,
Notification record, Webhook event or PushSubscription concept.
