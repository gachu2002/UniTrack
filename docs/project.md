# Project

## Goal

Build UniTrack as a project-first web platform for teacher-supervised student work. Teachers supervise projects, students submit assignment progress, and the main navigation label is `Workspace`.

## Docs

Keep top-level docs as navigation, not duplicated feature manuals.

| File | Purpose |
| --- | --- |
| `docs/project.md` | Executive index: status, routes, risks, commands, next slices. |
| `docs/architecture.md` | System design, domain model, lifecycles, API/data/state boundaries. |
| `docs/security-auth.md` | Auth, sessions, roles, permissions, route guards, security review. |
| `docs/deployment.md` | Deployment decisions, launch steps, troubleshooting, rollback. |
| `docs/testing.md` | Verification strategy, commands, Playwright knobs, coverage gaps. |
| `docs/engineering-guide.md` | Task map: what to read/change/verify, vocabulary, stable decisions. |
| `docs/audit.md` | Audit rubric, scorecard, queue, open findings, residual risks, pass template. |
| `docs/features/*.md` | Vertical feature behavior with UI, API/data rules, source maps, tests, gaps. |

Feature docs cover admin accounts, dashboard, workspace/projects/team, assignment review, resources/evidence, and UI system.

Sync rules: update this file only for status/routes/top-risks/commands/doc-set/next-slice changes; update relevant feature docs for durable behavior/UI/API/schema/permission/user-flow/cache/test/gap changes; create a new feature doc when no owner exists.

## Reading Map

| Goal | Read |
| --- | --- |
| Learn the product | `project.md`, then `architecture.md`, then one feature doc. |
| Review a feature | Owning `features/*.md`, plus `architecture.md` or `security-auth.md` only if touched. |
| Plan a change | `engineering-guide.md`, owning feature doc, then source/tests. |
| Change auth/permissions | `security-auth.md`, `architecture.md`, relevant feature doc. |
| Change deployment/storage | `deployment.md`, `features/resources-evidence.md`, `security-auth.md`. |
| Choose checks | `testing.md` and `engineering-guide.md`. |
| Audit the project | `audit.md`, `engineering-guide.md`, owning feature doc, source/tests. |

## Current Status

| Area | Status | Primary Docs / Sources |
| --- | --- | --- |
| Architecture/API/data/frontend state | Implemented | `architecture.md`; `server.go`, `response.go`, migrations, query keys/invalidation |
| Auth/session/protected access | Implemented | `security-auth.md`; `auth.go`, `security.go`, `permissions.go`, route guards |
| Admin accounts | Implemented | `admin-accounts.md`; `admin_users.go`, admin UI |
| Dashboard | Implemented | `dashboard.md`; `dashboard.go`, dashboard page, `dashboard.spec.ts` |
| Workspace, projects, milestones, team | Implemented | `workspace-projects.md`; `classes.go`, `projects.go`, `milestones.go`, project UI |
| Assignments, submissions, reviews | Implemented | `assignment-review.md`; `tasks.go`, task/detail/review UI |
| Resources and evidence | Implemented; production hardening remains | `resources-evidence.md`; `resources.go`, `files.go`, `storage.go` |
| UI system | Implemented | `ui-system.md`; shared components, layout, theme tokens |
| Testing/QA | Partial | `testing.md`; strong backend lifecycle coverage, focused browser coverage |
| Admin all-project management, analytics, activity-log UI | Backlog/partial | `admin-accounts.md`, `dashboard.md`, future feature docs |
| Removed surfaces | Removed from active UI/API; some legacy schema names remain schema-only | Invitations, standalone course module, numeric assessments, feedback/replies, meeting notes, active child-task workflow |

## Active Product Routes

| Route | Purpose |
| --- | --- |
| `/login` | Existing user sign-in. |
| `/admin/users` | Admin-only account management. |
| `/dashboard` | Role-aware work summary. |
| `/workspace` | Main project workspace. |
| `/workspace/classes/:classId` | Teacher/admin folder detail and project movement. |
| `/workspace/projects/:projectId` | Project dossier, mission control, Work Plan, resources, team popover. |
| `/workspace/projects/:projectId/tasks/:taskId` | Assignment page with review desk, student workbench, history, resources/evidence. |

Legacy `/projects*` and `/classes*` paths redirect into `Workspace` routes for compatibility; they are not separate product surfaces.

## Top Risks And Invariants

- Keep the product flow `Teacher -> Project -> Assignment -> Submission -> Review`.
- UI/docs say folder and assignment; API/DB compatibility names still include `classes`, `course_sections`, and `tasks`.
- Backend/database are authoritative for auth, permissions, lifecycle, and integrity; frontend guards are UX only.
- Project-scoped writes must preserve transaction-scoped manager and lifecycle rechecks under project-row locks.
- Resource/evidence targets are polymorphic but backed by deferred project-match and reviewed-support immutability triggers.
- Evidence uses local files for development/tests and private R2 for production; hosted hardening still needs retention, MIME policy, malware scanning, quotas, backups, and cost monitoring.
- In-memory login rate limits and raw SQL are acceptable for first launch but need review before horizontal scale or larger deployments; keep `TRUSTED_PROXY_CIDRS` aligned with hosted proxy topology.
- Production bootstrap admin credentials are env-driven and must be strong; production startup requires either bootstrap credentials or an existing active admin.
- Preserve focused accessibility conventions: skip link, dialog semantics, keyboardable controls, labels, readable empty/error/forbidden states.

## Baseline

Frontend: React, TypeScript, Vite, Tailwind, shadcn/Radix, React Router, TanStack Query, Zustand, Axios, React Hook Form, Zod, Playwright. Backend: Go, chi, PostgreSQL, pgx, goose, REST, cookie sessions, raw SQL. First-launch deployment: Vercel frontend, Render API, Neon Postgres, Cloudflare R2, no custom CDN/LB.

## Commands

- Web: `pnpm --filter @unitrack/web build`, `pnpm --filter @unitrack/web lint`, `pnpm --filter @unitrack/web test:e2e`
- API: `make api-build`, `TEST_DATABASE_URL='<postgres-url>' make api-test`, `make api-test-unit` for non-DB tests
- DB: `make db-validate`
- Demo seed local DB: `cd apps/api && DATABASE_URL='<local-postgres-url>' go run ./cmd/seed`
- Demo seed non-local DB: set `DEMO_SEED_PASSWORD='<strong-demo-password>'`, add `-allow-non-local`; use `-timeout=15m` for larger hosted seeds; replace demo rows with `-reset -confirm-reset=demo.unitrack.local`

Use `docs/engineering-guide.md` and `docs/testing.md` to choose targeted verification.

## Next Slices

1. Continue data-safety audits for remaining API transaction boundaries and direct-write constraints.
2. Continue admin basics: all-project management, admin dashboard, activity-log UI.
3. Harden production evidence storage: retention, MIME allowlist, malware scanning, backup, quotas, cost policy.
4. Expand frontend tests for project/task forms, team flows, resources/evidence, redirects, archived affordances, empty/error states.
5. Polish submission/review status copy and derived assignment state.
6. Add milestone templates or richer reorder behavior only after core supervision flows stay stable.

## Source Documents

Use this file, `docs/audit.md`, `docs/architecture.md`, `docs/security-auth.md`, `docs/deployment.md`, `docs/testing.md`, `docs/engineering-guide.md`, feature docs, and current code/tests as the source of truth. If `references/` returns, treat it as canonical rebuild-spec input.
