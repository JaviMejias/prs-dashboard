# Portable preparation backup

Preparar implements portable JSON v2 (`schemas/portable-export.schema.json`).
It includes project profiles, technologies and evidence, personal preferences,
rule selections and complete rule snapshots. It excludes session credentials,
Git aliases/state and machine source-path metadata. Free-text content is not a
secret scanner: users are warned to inspect it before sharing.

`createPreparationBackup` serializes an explicit allowlist. Import accepts up
to 2 MB, checks version, project/rule identities, duplicate entries, field
shapes and safe HTTPS documentation URLs. Legacy rule-only v1 files remain
available through the advanced library; they are not full backups.

Restore is previewed and defaults to keeping current projects, rules and
preferences while adding missing entries. The user can select incoming values
for conflicts. Unrelated projects are never deleted. Rule snapshots can be
recovered as local rules, preserving exact references and contents even if the
installed catalog no longer has them. Provenance-only differences do not count
as content conflicts.

`prcr:preparation-v1` is the canonical local envelope for repositories, custom
rules and preferences. It adopts the old repositories/rules keys on first
write, retaining those keys unchanged. Restore writes the full state and one
previous snapshot in a single storage operation. A write failure leaves the
old state intact. Undo restores that snapshot; subsequent edits expire undo.

The UI checks the current state against the captured preview before restoring
and rejects stale edits to a project or personal preferences. Storage events
refresh the preparation view across tabs. This is local persistence, not cloud
backup or cross-machine synchronization. Git remains machine-local.
