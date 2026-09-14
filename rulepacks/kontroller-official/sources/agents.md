# Pull Request Review Guidelines

## Kontroller project instructions

- When working anywhere inside `/home/javier/kontroller_test`, read `/home/javier/kontroller_test_qa.md` completely before reviewing or changing code and follow it as additional project instructions.
- The external instruction file is intentionally stored outside the Git repository so it remains available across branch changes and QA checkouts.

## Review behavior

- PR reviews are read-only unless the user explicitly requests changes.
- Do not modify files, branches, commits, remotes, or the working tree during a review.
- Compare the source branch against the specified target branch using the correct merge base.
- Inspect the complete resulting code, not only the added lines.
- Check that new behavior does not break or obstruct existing behavior.
- Prioritize functional errors, regressions, data loss, security, compatibility, and performance.
- Avoid cosmetic comments that do not provide meaningful value.
- If findings exist, return all comments in one complete Spanish text, ready to share.
- Each finding should identify the file, relevant line, problem, impact, and recommended correction.
- If there are no relevant findings, respond only: "El PR está bien y aprobado."

## Project compatibility

- Ruby 2.4.3.
- Rails 5.1.
- JavaScript uses jQuery.
- Do not recommend syntax or APIs incompatible with these versions.
- Isolated ES6 usage does not need to be reported unless it is extensive, inconsistent, or causes compatibility problems.

## General standards

- Use 2-space indentation.
- Code identifiers, variables, methods, classes, files, attributes, and technical comments must be in English.
- Only user-visible content should be in Spanish.
- Avoid unnecessary comments.
- Technical comments must be in English and should explain only non-obvious decisions or system limitations.
- Apply DRY when duplication is meaningful, but avoid unnecessary abstractions.

## Rails and architecture

- Controllers should coordinate and transfer data, not contain business logic or complex transformations.
- Move business logic to models or services as appropriate.
- Move presentation logic to helpers.
- Warn when a service, concern, helper, or model extraction is genuinely useful.
- Avoid heavy logic in ERB views.
- Do not request abstractions that add complexity without clear value.
- `schema.rb` should normally not be included in PRs, except for explicitly justified cross-country synchronization cases.

## Performance

- Look for N+1 queries.
- Review correct use of `joins`, `includes`, `preload`, and `eager_load`.
- Detect repeated queries, queries inside loops, unnecessary record loading, and avoidable Ruby-side processing.
- Review inefficient use of `all`, `to_a`, `map`, `select`, `pluck`, `count`, `size`, and `length`.
- Detect chained calls that repeat the same expensive method or calculation when reuse is appropriate.
- Consider indexes, scopes, transactions, callbacks, and bulk operations when relevant.
- Check that improvements do not degrade old workflows.

## JavaScript

- Only one `setup()` per file.
- All event registrations such as `click`, `change`, `input`, and `focus` must be placed inside `setup()`.
- Do not define functions inside other functions.
- Do not define functions inside event handlers.
- Extract complex event logic into a separate object method and call it from the event.
- Use jQuery and project-compatible JavaScript.
- Do not place JavaScript inside HTML or ERB files.
- Separate JavaScript by view or action when appropriate.
- Check for duplicate event registration and repeated plugin initialization.

## CSS

- Do not report isolated inline `style` attributes when they are reasonable or part of the existing template.
- Report excessive inline CSS or large presentation blocks inside views.
- Report `<style>` blocks embedded in views.
- Inline CSS remains acceptable for PDF and XLSX exports.
