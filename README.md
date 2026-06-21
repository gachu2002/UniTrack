# UniTrack

UniTrack is a university project supervision platform. The repository now contains the rebuilt MVP foundation for teachers supervising project progress and students reporting progress inside projects.

## Current State

- Frontend: Vite, React, TypeScript, Tailwind CSS, React Router, TanStack Query, Zustand, Axios, React Hook Form, and Zod.
- Backend: Go, chi, pgx, PostgreSQL, goose migrations, REST routes, and cookie-backed server sessions.
- Database: product migrations for users, sessions, project folders, projects, members, milestone-scoped assignments, progress updates/reviews, historical assessments, historical removed tables, resources, uploaded files, and account-management activity logs.
- UI: Academic Supervision Ledger direction with role-aware dashboard, a Workspace navigation area for projects, assignment dockets, progress timelines, resources, evidence files, and status stamps.

## Implemented Product Slices

- Auth, logout, current-session checks, and inactive-user login blocking.
- Admin-controlled account management for admins, teachers, and students.
- Admin-created accounts with teacher/admin direct add of existing active students into projects.
- Lightweight class/folder grouping for projects; standalone course routes and handlers are not part of the active product surface.
- Project create/list/detail/edit, optional class linkage, members, direct student add, member roles, and removal.
- Milestone-scoped assignment create/edit/detail and student work submissions.
- Official-task-scoped student progress submissions and teacher/admin reviews.
- Milestones, resource links, and evidence file upload/download for active supervision workflows.
- Backend lifecycle and permission tests for critical auth, project, member, assignment, progress, file, resource, and folder behavior.

## Still Partial Or Backlog

- Admin all-project management, admin dashboard, and activity-log UI.
- Forgot password, email verification, notifications, analytics, and advanced filtering.
- Production file-storage hardening such as persistence, retention, MIME policy, malware scanning, backup, and download policy.

## Commands

```bash
pnpm install
pnpm --filter @unitrack/web dev
pnpm --filter @unitrack/web build
pnpm --filter @unitrack/web lint
pnpm --filter @unitrack/web test:e2e:install
pnpm --filter @unitrack/web test:e2e
make api-build
make api-test
make db-validate
```

Playwright usage:

| Workflow | Command | Purpose |
| --- | --- | --- |
| Regression tests | `pnpm --filter @unitrack/web test:e2e` | Repeatable browser tests and HTML reports. |
| Headed tests | `pnpm --filter @unitrack/web test:e2e:headed` | Run the same tests in a visible browser. |
| Interactive UI | `pnpm --filter @unitrack/web test:e2e:ui` | Use the standard Playwright test UI for local debugging. |
| HTML report | `pnpm --filter @unitrack/web test:e2e:report` | Open the latest report with artifacts. |

On fresh Linux/WSL environments, run `pnpm --filter @unitrack/web test:e2e:install-deps` if Chromium reports missing system libraries.

Seed realistic demo data after migrations have run:

```bash
cd apps/api
DATABASE_URL='<postgres-url>' go run ./cmd/seed
```

The seed command creates deterministic demo accounts, folders, projects, teams, milestones, assignments, submissions, reviews, resources, and activity logs. By default it only inserts data; it does not delete existing demo rows. All demo users use password `DemoPass123!`; the demo admin is `demo.admin@demo.unitrack.local`.

The seed command no longer resets existing demo rows unless explicitly requested. To refresh demo data, run `DATABASE_URL='<postgres-url>' go run ./cmd/seed -reset -confirm-reset=demo.unitrack.local`.

Local database/API convenience commands:

```bash
make db-up-local
make api-run-local
```

Default local admin account when using `make api-run-local`:

| Field    | Value                  |
| -------- | ---------------------- |
| Email    | `admin@unitrack.local` |
| Password | `admin12345`           |

## References

Use `docs/project.md` for current repository status and `docs/features/` for feature onboarding references. This checkout currently does not include a `references/` directory.
