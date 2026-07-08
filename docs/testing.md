# Testing

Purpose: document verification commands, test ownership, browser-test knobs, and coverage gaps.

Scope: keep command forms, verification choice, Playwright knobs, suite map, and cross-feature coverage gaps here; keep feature behavior and expected UI/API rules in `docs/features/`.

## Commands

| Task | Command |
| --- | --- |
| Web lint/build | `pnpm --filter @unitrack/web lint`, `pnpm --filter @unitrack/web build` |
| Web e2e | `pnpm --filter @unitrack/web test:e2e`, `pnpm test:e2e:web`, or `make web-test-e2e` |
| Web e2e setup/debug | `pnpm --filter @unitrack/web test:e2e:install`, `test:e2e:install-deps`, `test:e2e:headed`, `test:e2e:ui`, `test:e2e:report` |
| API build/test | `make api-build`, `TEST_DATABASE_URL='<postgres-url>' make api-test`, `make api-test-unit` for non-DB tests |
| DB validate | `make db-validate` |
| Demo seed | `cd apps/api && DATABASE_URL='<postgres-url>' go run ./cmd/seed` |

## Verification Chooser

| Risk Touched | Prefer |
| --- | --- |
| Go handler, auth, permissions, lifecycle, storage, config | `make api-build` plus focused `go test`; use `TEST_DATABASE_URL='<postgres-url>' make api-test` when DB coverage is needed, or `make api-test-unit` for non-DB tests. |
| Database migration or trigger | `make db-validate` plus focused DB lifecycle tests. |
| Frontend TypeScript/UI behavior | `pnpm --filter @unitrack/web lint` and `pnpm --filter @unitrack/web build`. |
| User-visible role flow | Targeted Playwright spec or a new focused spec when the gap matters. |
| Docs-only change | Read-back and source cross-check; do not run unrelated builds. |

## Playwright Knobs

| Variable | Purpose |
| --- | --- |
| `PLAYWRIGHT_BASE_URL` | Frontend origin under test. |
| `PLAYWRIGHT_WEB_SERVER_COMMAND` | Override Vite command/port. |
| `PLAYWRIGHT_START_WEB_SERVER` | Set `false` to reuse an existing frontend. |
| `PLAYWRIGHT_SKIP_API_UNAVAILABLE` | Local-only escape hatch for intentionally skipping API-dependent specs. |
| `VITE_API_URL` | API base URL embedded in the frontend bundle. |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | Admin fixture credentials. |
| `E2E_TEACHER_EMAIL` / `E2E_TEACHER_PASSWORD` | Teacher fixture credentials used by role and accessibility flows. |

Keep frontend origin, API `CORS_ALLOWED_ORIGINS`, and `VITE_API_URL` aligned for cookie-authenticated browser tests.

## Suite Map

| Spec | Covers |
| --- | --- |
| `auth-flow.spec.ts` | Login smoke and navigation. |
| `admin-accounts.spec.ts` | Admin create/search teacher and teacher sign-in. |
| `access-control.spec.ts` | Forbidden routes/actions, inactive login, closed evidence read-only. |
| `accessibility.spec.ts` | Skip link, dialog/focus, folder color keyboard behavior. |
| `assignment-happy-path.spec.ts` | UI-driven teacher project, team, assignment, student submission, and teacher review happy path. |
| `dashboard.spec.ts` | Role queues and admin counts. |
| `database-integrity.spec.ts` | Folder/project owner-supervisor candidate filtering. |
| `state-flow.spec.ts` | Folder description clearing and stale candidate hiding. |
| `login-page.visual.spec.ts` | Login render artifact. |

## Rules

- Prefer API-created unique fixtures and accessible selectors.
- Missing API is a failure unless deliberately skipped for local UI-only work.
- `make api-test` requires `TEST_DATABASE_URL` so DB-backed lifecycle tests do not skip silently; use `make api-test-unit` when a database is intentionally unavailable.
- Keep DB and lifecycle invariants in Go tests.
- Add browser tests for user-visible workflows and stale affordances.
- For docs-only work, use read-back plus source/reference search.

## Gaps

- Additional team-flow permutations, resource/evidence happy paths, redirects, archived affordances, and empty/error states.
- Frontend unit/component runner.
- Axe-style accessibility scan.
