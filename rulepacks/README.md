# PR Control Room Rule Library

Rules and rulepacks are small, human-readable review guidance bundles loaded
from this repository at build time. Repositories reference them explicitly
with stable `id@version` values in local configuration.

They contain review guidance only, not executable rules, scripts, credentials,
Codex skills or automatic version resolution. The bundled Kontroller catalog
preserves the seven supplied source documents and exposes each source as one
reusable rule. Its local identifiers are organizational only; the sources do
not contain official `KPR-*` identifiers.
