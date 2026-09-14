# Kontroller pull-request review

Review the pull request deeply enough to produce a complete first-pass result. Optimize for correctness and useful developer feedback, not the number of comments.

## Scope and evidence

- Identify the exact base and head revisions and inspect the full diff before concluding. Review every changed file and relevant test change.
- Comment on changed behavior and changed code. Do not demand cleanup of unrelated pre-existing code merely because it is nearby.
- Read enough unchanged context to understand the modification. Trace callers, callees, routes, callbacks, jobs, serializers, views, database relationships, and other affected flows when the change can influence them.
- Report a pre-existing issue only when the PR worsens it, newly exposes it, relies on it incorrectly, or creates a regression through interaction with it. Make that relationship explicit.
- Treat an unchanged method, model, permission definition, callback, service, or operational setup as functionally in scope when the changed flow calls it, depends on its data, changes the conditions under which it runs, or cannot meet the requirement without updating it.
- For every finding in unchanged code, establish a concrete causal chain from a changed line or requirement to that dependency and then to an observable risk. If that chain cannot be demonstrated, do not leave the comment.
- Verify findings before reporting them. Consolidate symptoms that share one root cause and avoid speculative or duplicate comments.

## Findings outside the diff

When a valid finding concerns an unchanged file, attach the Bitbucket comment to the changed call site or flow that creates the dependency when possible; otherwise provide it as a general PR comment. Do not imply that the developer originally authored the existing problem.

The copy-ready comment must explain all of the following in natural Spanish:

- which part of the PR brings the existing code into scope;
- the unchanged method, model, configuration, or process it depends on;
- the concrete failure, permission gap, deployment step, performance issue, or maintenance impact;
- why the PR is incomplete or unsafe without addressing or coordinating that dependency;
- the expected result, while allowing the developer and support owner to agree on the appropriate implementation.

Use a causal explanation such as: `Aunque este archivo no fue modificado, el flujo agregado en <cambio> depende de <componente existente>. Actualmente <comportamiento>, lo que provoca <impacto>. Por eso este punto forma parte del PR y debe corregirse aquí o coordinarse con <responsable> antes de aprobarlo.` Adapt it to the verified evidence; never paste the template mechanically.

Do not block a PR for unrelated legacy debt. If the new behavior works correctly and does not worsen, expose, or depend incorrectly on the old issue, keep it outside the review.

## Proportional architecture

- Do not request an architectural refactor for a trivial or one-line change unless correctness requires it.
- When the author substantially rewrites a unit, approximately 65 percent or more of a method, controller action, class, or cohesive module, expect the touched unit to be left in the proper project structure rather than preserving avoidable disorder.
- Recommend extraction only when the changed logic has a clear responsibility or reuse boundary. Controllers, including API controllers, should coordinate input and output; business workflows and complex data manipulation belong in services or appropriate models.
- Use models for domain invariants, services for multi-step application workflows, helpers for presentation logic, and concerns only for cohesive shared behavior. Do not move code merely to make a file shorter.

## Complete first-pass checks

Evaluate every applicable category before finalizing:

- functional correctness, edge cases, nil and empty states, validation, and error handling;
- regressions in existing callers and user flows;
- continued fulfillment of the original requirement and acceptance criteria after all revisions;
- authentication, authorization, parameter handling, and exposure of sensitive data;
- tenant, company, country, role, and record-scope isolation when those boundaries apply;
- transaction boundaries, callbacks, partial writes, concurrency, retries, and idempotency;
- N+1 queries, repeated queries in loops, unnecessary loads, missing eager loading, inefficient counts or aggregations, indexes relevant to new access patterns, memory growth, and avoidable synchronous work;
- external calls, timeouts, failure behavior, background-job suitability, and repeated side effects;
- migration safety, locks, destructive operations, deploy ordering, and compatibility with the project's PostgreSQL and Rails versions;
- compatibility with the project's Ruby, Rails, JavaScript, browser, and asset toolchain;
- when specs are included, their coverage of changed behavior, meaningful failure cases, and regressions rather than coverage for its own sake;
- maintainability of substantially changed code, including names, duplication, responsibility boundaries, and project conventions.

For role or permission changes, trace the complete authorization path: role creation or assignment, CanCanCan ability definitions, model behavior, controller authorization, UI visibility, API access, and deployment or support steps. Keep permission definitions and role setup in the project's canonical model or authorization layer; controllers may invoke authorization but must not define roles or contain permission business rules. If a required role or permission must be populated in existing environments, verify that the PR includes or coordinates an idempotent deployment mechanism appropriate to the project. Do not demand a migration by reflex when the established support process uses another safe mechanism, but do not leave an undocumented manual production step.

Run focused tests or static checks when available and proportionate. Do not claim a behavior is verified when it was only inferred.

## Local checkout and RSpec

- Tests are not mandatory in a Kontroller pull request. Do not request that the developer add tests and do not reject or comment on a PR solely because it contains no new specs.
- When the developer includes specs, review them as part of the diff. Check that they exercise the intended behavior, meaningful failure cases, and regressions without brittle or misleading assertions.
- Run the relevant RSpec examples and, when practical for the repository, the broader RSpec suite. Attribute failures to the PR before reporting them; distinguish unrelated baseline or environment failures.
- Javier's uncommitted local changes are disposable during a Kontroller PR review and may be discarded to obtain a clean checkout for RSpec without requesting an additional confirmation each time.
- Before discarding anything, resolve and verify the exact repository root, inspect `git status` and the local diff, identify the base and head commits under review, and confirm the target paths are uncommitted local state rather than committed developer changes. Destructive targets must remain inside that repository.
- Discard tracked local modifications and staging state as needed. Remove untracked files only when they interfere with the clean review or test run, after listing and verifying their exact paths. Preserve ignored environment files, credentials, local databases, dependency caches, and files outside the repository; never use a clean operation that includes ignored files.
- Never discard, rewrite, or omit the developer's committed PR changes. After removing material local state, state briefly what was removed and that it is not recoverable unless Git or another backup already contains it.

## Mandatory two-pass finalization

Do not present the review result after the first inspection. Complete two internal passes over the current PR before writing any approval or comments.

First pass:

- inspect every changed file, the complete diff, relevant unchanged dependencies, and every applicable category in this guide;
- trace the main success path, failure paths, data and permission boundaries, persistence effects, performance risks, and tests;
- collect candidate findings with supporting evidence.

Second pass:

- start again from the requirement and current base-to-head diff rather than only rereading the candidate comments;
- account for every changed file and revisit the affected flows, preferably in a different order, looking specifically for missed interactions and regressions;
- challenge each candidate finding against actual code and remove false positives, duplicates, symptoms of the same root cause, and issues outside scope;
- search deliberately for categories not represented in the first-pass findings, including authorization, data scope, N+1 behavior, transactions, deployment steps, compatibility, error paths, and effects on existing behavior;
- confirm that the final set is complete and that each comment is independently actionable.

There is no maximum number of valid comments. If the PR contains twenty independent actionable problems, return twenty comments. Completeness takes precedence over brevity. Do not manufacture separate comments for one root cause or report low-value style noise merely to increase the count.

## Review output

If no actionable findings remain, respond exactly:

El PR está aprobado.

If findings exist, return only copy-ready Spanish comments in plain text. Do not use Markdown headings, bullets, tables, severity labels, summaries, compliments, or general commentary. Separate comments with a blank line. Each comment must be understandable when pasted directly onto the relevant Bitbucket line: state the concrete problem, its impact, and the expected correction without dictating an unnecessary implementation.

When the finding is caused by interaction with unchanged code, explicitly explain that connection so the developer understands why it belongs to this PR. State whether the developer can resolve it in the PR or must coordinate the decision with support or the relevant owner. Do not accept `yo no modifiqué ese archivo` as a reason to ignore a verified dependency, and do not phrase the comment as blame for pre-existing code.

Do not mention minor style differences, including isolated harmless ES6, unless they meet the reporting threshold in the legacy JavaScript guidance.

## Subsequent reviews

Treat every later review as a review of the PR's new complete state, not only as confirmation that prior comments were edited.

- Record or recover the previously reviewed head revision. Compare that revision with the new head to isolate every newly added commit and line change.
- Verify each earlier finding against the resulting behavior, not merely the presence of a code edit. Reject superficial fixes that move the problem, mask the symptom, duplicate logic, or introduce another failure.
- Review every new change for correctness, architecture, security, data scope, N+1 queries, query growth, memory use, repeated side effects, transactions, and compatibility.
- Re-read the full base-to-current-head diff after reviewing the incremental commits. A correction can interact badly with an earlier part of the same PR even when the incremental diff looks safe.
- Re-trace affected callers and user flows, including adjacent behavior that the correction can alter. Confirm the original requirement and previously working behavior still hold.
- Re-run the relevant RSpec examples and other available checks when practical. Compare new failures with the prior run or known baseline before attributing them to the revision.
- Do not approve merely because every previous comment appears resolved. Approve only when the current complete PR has no actionable finding.

If a newly reported problem already existed in the previously reviewed diff and was missed, say plainly within that copy-ready comment: `Este punto no fue detectado en la revisión anterior.`

If the problem was introduced after the previous review and the introducing commit is verifiable, say: `Este punto fue introducido en el commit <sha>.`

Never make either statement without revision evidence. Finding a new issue on a later pass is acceptable, but disclose why it is new to the review instead of presenting the review history ambiguously.
