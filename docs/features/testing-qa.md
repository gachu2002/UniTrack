# Testing And QA Onboarding

This document covers the current UniTrack test suites, QA commands, browser-test environment knobs, and known coverage gaps.

## Current Status

| Capability | Status | Notes |
| --- | --- | --- |
| Backend lifecycle tests | Implemented | `apps/api/internal/app/lifecycle_test.go` covers auth/session, admin accounts, lifecycle gates, dashboard, folders, projects, members, assignments, submissions, reviews, resources, evidence files, and database integrity. Tests require `TEST_DATABASE_URL`; otherwise lifecycle tests skip. |
| Backend config tests | Implemented | `apps/api/internal/config/config_test.go` covers cookie/CORS/bootstrap validation. |
| Web lint/build | Implemented | `pnpm --filter @unitrack/web lint` and `pnpm --filter @unitrack/web build` are the minimal static checks. |
| Playwright browser tests | Implemented partial | `apps/web/e2e/` covers auth smoke, access control, accessibility, admin account create/search/sign-in, dashboard role queues, folder integrity, state-flow regressions, and login visual artifact. API-dependent specs fail on missing API by default and only skip when explicitly configured. |
| Root QA aliases | Implemented | Root `package.json` and `Makefile` expose web e2e aliases in addition to the package-local scripts. |
| Isolated browser server command | Implemented | `PLAYWRIGHT_WEB_SERVER_COMMAND` can override the default Vite command so tests can run on a non-default port with a matching `PLAYWRIGHT_BASE_URL`. |

## Commands

| Task | Command |
| --- | --- |
| Web lint | `pnpm --filter @unitrack/web lint` or `make web-lint` |
| Web build | `pnpm --filter @unitrack/web build` or `make web-build` |
| Web browser suite | `pnpm --filter @unitrack/web test:e2e`, `pnpm test:e2e:web`, or `make web-test-e2e` |
| Web headed browser suite | `pnpm --filter @unitrack/web test:e2e:headed`, `pnpm test:e2e:web:headed`, or `make web-test-e2e-headed` |
| Web browser report | `pnpm --filter @unitrack/web test:e2e:report`, `pnpm test:e2e:web:report`, or `make web-test-e2e-report` |
| API tests | `TEST_DATABASE_URL='<postgres-url>' make api-test` |
| DB migration validation | `make db-validate` |

## Playwright Environment

| Variable | Purpose |
| --- | --- |
| `PLAYWRIGHT_BASE_URL` | Frontend origin used by browser tests. Defaults to `http://localhost:5173`. |
| `PLAYWRIGHT_WEB_SERVER_COMMAND` | Optional Vite command override. Useful with alternate ports, for example `pnpm dev -- --host 0.0.0.0 --port 5174`. |
| `PLAYWRIGHT_START_WEB_SERVER` | Set to `false` to use an already running frontend server. |
| `PLAYWRIGHT_SKIP_API_UNAVAILABLE` | Optional local escape hatch. Set to `true` only when intentionally skipping API-dependent browser specs because the API is unavailable. By default, missing API availability fails those specs. |
| `VITE_API_URL` | API base URL embedded in the Vite dev server bundle. Must match the API under test. |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | Admin credential used by specs that create fixtures or verify admin UI. Defaults to local bootstrap admin. |
| `E2E_TEACHER_EMAIL` / `E2E_TEACHER_PASSWORD` | Teacher credential used by accessibility smoke checks. Defaults to demo seed teacher. |

When using a non-default frontend port, the API must trust the same origin through `CORS_ALLOWED_ORIGINS`; otherwise cookie-authenticated writes fail the origin guard.

Example isolated run shape:

```sh
PLAYWRIGHT_BASE_URL=http://localhost:5174 \
PLAYWRIGHT_WEB_SERVER_COMMAND='pnpm dev -- --host 0.0.0.0 --port 5174' \
VITE_API_URL=http://localhost:18080/api/v1 \
pnpm --filter @unitrack/web test:e2e
```

## Browser Suite Map

| Spec | Coverage |
| --- | --- |
| `auth-flow.spec.ts` | Admin sign-in smoke test and primary navigation presence. |
| `admin-accounts.spec.ts` | Admin creates/searches a teacher account through the UI and verifies teacher sign-in. |
| `access-control.spec.ts` | Non-admin route denial, hidden manager actions, non-member rejection, closed evidence read-only state, inactive login blocking. |
| `accessibility.spec.ts` | Protected skip link, dialog close/focus semantics, and folder color radio keyboard behavior. |
| `dashboard.spec.ts` | Admin counts plus teacher/student actionable queues. |
| `database-integrity.spec.ts` | Folder/project owner-supervisor candidate filtering. |
| `state-flow.spec.ts` | Folder description clearing and stale candidate hiding. |
| `login-page.visual.spec.ts` | Login page render and screenshot artifact. |

## Maintenance Rules

- Prefer API-created unique fixtures over demo row assumptions.
- Keep tests on accessible labels, roles, and visible product copy instead of CSS selectors.
- Use `E2E_ADMIN_EMAIL` overrides or a fresh API process for repeated local runs that might trip login rate limits.
- Keep `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_WEB_SERVER_COMMAND`, `VITE_API_URL`, and API `CORS_ALLOWED_ORIGINS` aligned when running isolated browser tests.
- Do not rely on API-dependent specs silently skipping; missing API availability is a failure unless `PLAYWRIGHT_SKIP_API_UNAVAILABLE=true` is deliberately set for local UI-only work.
- Add focused Playwright specs for user-visible workflows; keep backend lifecycle and integrity invariants in Go tests.

## Known Gaps

- Project create/edit, assignment edit, team add/remove, resource dialog, and evidence upload/delete happy paths still need broader browser coverage.
- No frontend unit/component test runner is configured.
- No automated axe-style accessibility scan is wired.
- Backend lifecycle tests depend on a PostgreSQL test database and skip without `TEST_DATABASE_URL`.
