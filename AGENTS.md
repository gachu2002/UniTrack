# UniTrack

This repository is intentionally scaffold-first.

## Working Mode

- Keep the codebase thin and slice-based.
- Do not invent new product modules, routes, or schema beyond what the current task requires.
- Treat `docs/project.md` as the main project reference.
- Treat `docs/engineering-guide.md` as the task-based map for what to read, change, and verify.
- Treat `docs/architecture.md`, `docs/security-auth.md`, `docs/deployment.md`, and `docs/testing.md` as cross-cutting review references.
- Treat files under `docs/features/` as vertical feature references that include UI, API/data rules, source maps, tests, gaps, and review checklists.
- If a `references/` directory is restored later, treat those files as rebuild specifications.
- Prefer the smallest correct change. Ask before changes that affect product scope, user flow, permissions, data retention, deployment cost, unclear schema invariants, or long-term maintenance burden.

## Commands

- Web dev: `pnpm --filter @unitrack/web dev`
- Web build: `pnpm --filter @unitrack/web build`
- Web lint: `pnpm --filter @unitrack/web lint`
- API run: `go run ./apps/api/cmd/server`
- API build: `make api-build`
- API test: `TEST_DATABASE_URL='<postgres-url>' make api-test`; non-DB tests use `make api-test-unit`
- DB validate: `make db-validate`

## Documentation

- Read `docs/project.md` before major product or scope changes.
- Keep documentation in sync with implementation changes. For durable code, UI, API, schema, route, permission, cache, test, or user-flow behavior changes, update the owning feature doc before finishing. Update `docs/project.md` only for status, routes, top risks, commands, doc-set, or next-slice changes. If no feature doc exists for the changed area, create one under `docs/features/` and add it to the documentation set in `docs/project.md`.
- In final responses for implementation work, mention which docs were updated or state that no durable behavior changed.
