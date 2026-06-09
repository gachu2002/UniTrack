# UniTrack

This repository is intentionally scaffold-first.

## Working Mode

- Keep the codebase thin and slice-based.
- Do not invent new product modules, routes, or schema beyond what the current task requires.
- Treat `docs/project.md` as the main project reference.
- Treat files under `docs/features/` as feature onboarding references.
- If a `references/` directory is restored later, treat those files as rebuild specifications.

## Commands

- Web dev: `pnpm --filter @unitrack/web dev`
- Web build: `pnpm --filter @unitrack/web build`
- Web lint: `pnpm --filter @unitrack/web lint`
- API run: `go run ./apps/api/cmd/server`
- API build: `make api-build`
- API test: `make api-test`
- DB validate: `make db-validate`

## Workflow

- Read `docs/project.md` before major product or scope changes.
- Keep documentation in sync with implementation changes. For every code, UI, API, schema, route, permission, or workflow behavior change, update `docs/project.md` and the relevant `docs/features/*.md` onboarding doc before finishing. If no feature doc exists for the changed area, create one under `docs/features/` and add it to the documentation set in `docs/project.md`.
- In final responses for implementation work, mention which docs were updated or state that no durable behavior changed.
