# Pull Request Review Guidelines

## Review summary

- At the end of every PR review, state that the complete PR was reviewed generally, not only the latest commits.
- Identify the exact source and target remote branches that were compared.
- Calculate the review scope from the correct merge base using the effective three-dot diff between the target and source branches.
- Always report the following review totals:
  - Number of changed files.
  - Number of commits in the source branch since the merge base, including merge commits.
  - Number of added lines.
  - Number of deleted lines.
- When useful for verification, distinguish merge commits from non-merge commits.
- These totals must describe the complete effective PR diff, not only the commits added since the previous review.
- If the reported branches or totals do not match the PR the user intended, flag the discrepancy before presenting approval or findings.

## Review completeness and regression tracing

- Deliver all observable relevant findings together in the first review. Do not publish a partial batch while relevant review work remains.
- Before finishing, perform at least two complete passes:
  - A functional review of the effective PR diff and the complete resulting code.
  - A regression review that traces changed behavior through every relevant consumer.
- When a PR changes a source of truth, data contract, method signature, persisted field, callback, calculation, or serialized structure:
  - Search the entire repository for every direct and indirect consumer.
  - Trace transformed values through models, services, controllers, helpers, concerns, jobs, serializers, APIs, JavaScript, views, PDFs, XLSX exports, imports, and reports.
  - Inspect relevant consumers even when the PR did not modify their files.
  - Review positional array contracts, hash keys, aliases, delegates, callbacks, and other indirect data flows.
  - Verify both current and historical behavior when the data is period-dependent or persisted.
- Do not assume unchanged files remain compatible with a changed contract or source of truth.
- Inspect relevant tests and identify important functional branches that remain uncovered. Tests do not replace inspection of the resulting production code.
- Before stating that no additional findings remain, complete the repository-wide consumer inventory and the regression pass.
- On every subsequent review of the same PR, compare both:
  - The complete effective PR against the target branch.
  - The commits added since the exact source revision reviewed previously.
- For every finding first reported in a subsequent review, explicitly state whether it:
  - Was introduced by the new commits.
  - Existed in the previously reviewed revision and was missed.
  - Was exposed or introduced by a correction made after the previous review.
- Verify finding provenance from Git history before attributing it to a new commit.
- Do not claim that the review is exhaustive or that no findings remain if consumer tracing, resulting-code inspection, or regression analysis is incomplete.
