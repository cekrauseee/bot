# Feature Delivery and Review

This document describes the repository workflow for delivering a cross-service
feature through review. It is development and Harness/process documentation,
not a product agent behavior harness. It adds no restrictions to agents,
models, tools, or users.

## Documentation routing

Start at [`docs/index.md`](index.md), then read the narrowest routed document:

- [`docs/development.md`](development.md) for setup, commands, and testing.
- [`docs/architecture.md`](architecture.md) for boundaries and data flow.
- [`docs/modules/api.md`](modules/api.md) for Elysia and persistence contracts.
- [`docs/modules/ai.md`](modules/ai.md) for FastAPI, models, and checkpoints.
- [`docs/modules/runtime.md`](modules/runtime.md) for sandbox operations.

Update the narrowest canonical document affected by a stable contract. Link
related documents with relative paths. Keep operational session state, drafts,
and temporary evidence in the Harness rather than versioned documentation.

## Branch and PR topology

Use one aggregate integration branch for the feature. The aggregate branch is
the complete feature tree and targets the owner-approved destination branch.
Deliver the feature through cohesive, small child PRs that merge into the
feature branch, not directly into the final target.

Each child PR is a review unit, not necessarily an independently deployable
release. This matters when API, AI, runtime, and database contracts transition
together. A child may depend explicitly on an earlier child; record the
dependency in its description and keep the order unambiguous.

Every child PR should have one cohesive goal, an explicit change map, and a
clear boundary. Do not split a contract transition so that either side is
misleading or unverifiable in isolation. The aggregate branch is the place to
integrate the full compatible set.

## PR description contract

Use these six sections, in this order:

1. **Goal** — the user or system outcome, in one concise statement.
2. **Desired behavior** — observable behavior and compatibility expectations.
3. **Change map** — files, modules, migrations, and explicit child dependencies.
4. **Verification** — exact commands, fixtures, environments, and results.
5. **Review focus** — the risks and invariants reviewers should inspect first.
6. **Risks** — known limits, rollout concerns, and safe follow-up boundaries.

Use Conventional Commits for commit messages and PR titles. Branches use the
repository's separate `<type>/<short-kebab-case-slug>` convention, such as
`feat/durable-agent-events` or `fix/runtime-replay`. The PR title type matches
the head branch type. Do not invent a release claim from a review unit.

## Evidence and verification

Report evidence with an immutable revision, commit, or other revision-qualified
identifier. Say which tree was inspected and which commands actually ran.
Record screenshot routes, viewports, appearances, revisions, and capture times.
Label inherited screenshots as historical evidence and note missing provenance;
do not present them as newly captured or as proof of live provider execution.

Separate local, fake, and fixture verification from live provider or production
verification. `npm run check` covers checks and builds without integration
infrastructure; `npm run verify` is the complete repository and authentication
integration gate. Use focused commands such as `npm run api:test`,
`npm run ai:test`, `npm run runtime:test`, and their lint/typecheck/build peers
when isolating a change. Do not claim live provider, deployed, or production
tests unless they were run and their environment is identified. Use isolated
PostgreSQL and Redis test targets; do not migrate or reset another worktree's
active development database merely to verify a feature branch.

Before final integration, run the full verification on the complete aggregate
tree, then check that the tree contains every intended child change and no
required dependency is missing. A passing partial child is not final evidence.

## Integration and rollout

Merge child PRs only into the aggregate feature branch, in dependency order.
Coordinate API, AI, and runtime changes as one contract rollout: verify bearer
authentication, event envelopes, operation identifiers, working directories,
and failure/recovery behavior across their boundaries.

Apply and verify database migrations with the application changes. Drizzle
migrations are versioned and non-destructive; use `npm run db:migrate` and
`npm run db:check` for the local database contract, and include migration
history in the Change map and Verification sections. Do not treat a fixture or
fake provider as proof that a live dependency is configured or compatible.

After the aggregate tree is complete and fully verified, keep the aggregate PR
open for owner review. The owner decides when it is ready to merge into the
approved destination branch.

## Preservation and lifecycle

The worktree may be dirty or may contain unrelated edits. Preserve those edits;
do not reset, clean, stash, or overwrite work that is outside the owned scope.
Inspect the requested pinned revision when checkout state is changing, and do
not infer source truth from a moving `HEAD`.

Merging the aggregate PR, closing unrelated PRs, deleting feature branches, and
publishing or deploying are separate actions. Never perform or imply any of
those actions without explicit authorization. Preserve merged feature branches
unless branch deletion is separately requested.
