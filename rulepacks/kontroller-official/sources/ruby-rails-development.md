---
name: ruby-rails-development
description: Implement, debug, test, review, or modernize Ruby on Rails applications across legacy Ruby 2.4.3-era systems and current Ruby/Rails stacks. Use only for Ruby or Rails work; detect actual versions before choosing syntax, APIs, commands, or upgrade advice.
---

# Ruby Rails Development

Work from the repository's declared versions and conventions, not from current Rails defaults.

## Establish compatibility

- Read applicable `AGENTS.md`, then inspect `.ruby-version`, `Gemfile`, `Gemfile.lock`, Rails configuration, database configuration, and relevant JavaScript manifests.
- Determine Ruby, Rails, Bundler, database adapter, test framework, asset pipeline or bundler, and deployment constraints. If evidence conflicts, report the ambiguity before making version-sensitive changes.
- Treat Ruby 2.4.3 as a supported legacy baseline. Do not introduce syntax, standard-library APIs, gem versions, Rails APIs, or Bundler behavior unavailable to the detected runtime.
- Preserve the existing application architecture and conventions unless the user explicitly requests modernization or an upgrade.

## Change safely

- Use `bundle exec` with repository-provided commands when dependencies are available.
- Follow the project's existing patterns for controllers, models, services, jobs, serializers, views, routes, authorization, and tests. Do not impose modern abstractions on a legacy application without a concrete benefit in scope.
- For PostgreSQL changes, inspect existing schema and migrations first. Make migrations reversible when practical, separate data backfills from risky schema changes, and flag locks, table rewrites, destructive changes, or version-specific SQL behavior.
- Do not regenerate lockfiles, upgrade gems, or change Ruby/Rails versions unless requested or necessary for the scoped fix; explain any unavoidable dependency movement.
- Add or update focused tests using the repository's framework. Run the narrowest relevant tests first, then broader checks when justified.

When an upgrade is requested, plan it as explicit compatibility stages. Preserve behavior with tests and do not combine a large framework upgrade with unrelated refactoring.
