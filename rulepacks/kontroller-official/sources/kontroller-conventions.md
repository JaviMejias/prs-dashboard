---
name: kontroller-conventions
description: Apply Kontroller's engineering, pull-request, legacy JavaScript, CSS, Rails view, and schema conventions. Use only when working in a Kontroller repository or when the user explicitly requests Kontroller conventions; do not apply its legacy JavaScript rules to unrelated modern projects.
---

# Kontroller Conventions

First apply repository instructions and the general English-code, Spanish-UI, minimal-comment, and two-space preferences. Then apply the rules below without modernizing legacy patterns unless requested.

## Pull requests

- Before declaring a branch ready for a pull request, verify it has been updated from its remote branch and conflicts were resolved locally.
- The team's expected operation is `git pull` before pushing. Because this changes the working tree and contacts a remote, run it only within the user's authorized workflow; otherwise state that this readiness step remains.
- Do not include `schema.rb` in a pull request merely because local migrations regenerated it. Preserve the local file and avoid staging its change rather than deleting user work. The Chile-to-Peru exception applies only when the user or repository context explicitly establishes it.
- When reviewing a pull request, read and follow [references/pull-request-review.md](references/pull-request-review.md).

## Rails and views

- Keep heavy logic out of ERB views. Put domain logic in models or the project's established service layer, and presentation-specific logic in helpers.
- Keep controllers thin, including API controllers. Controllers receive input, invoke the appropriate domain operation, and render or redirect; they must not own business rules, multi-step data manipulation, or complex persistence workflows.
- Put domain invariants close to models, multi-step application workflows in services, presentation logic in helpers, and genuinely shared cohesive behavior in concerns. Do not use services, concerns, helpers, or models as generic dumping grounds.
- Follow the detected Ruby and Rails versions; Kontroller conventions do not authorize dependency or framework upgrades.

## CSS

- Do not add inline CSS to views. Inline CSS is allowed only for PDF rendering and XLSX exports when those formats require it.

## Legacy JavaScript

When editing Kontroller JavaScript, read [references/legacy-javascript.md](references/legacy-javascript.md). Do not apply that reference to a separate modern React, Vite, or Node.js application merely because it belongs to the same user.
