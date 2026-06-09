# Project

## Goal

Build UniTrack as a web platform for teacher-supervised student project work. The product is project-first: teachers supervise project progress, students report progress, and the main navigation label for this area is `Workspace`.

## Documentation Set

Keep the docs small and feature-onboarding focused:

| File | Purpose |
| --- | --- |
| `docs/project.md` | Current feature index, implementation status, source map, risks, and next slices. |
| `docs/features/auth-session.md` | Auth/session onboarding: behavior, flows, sequence diagrams, source map, security notes, and tests. |
| `docs/features/admin-accounts.md` | Admin accounts onboarding: bootstrap admin, user management, role/status correction, password setting, audit writes, and tests. |
| `docs/features/protected-access.md` | Protected access onboarding: app route guards, project permissions, class/folder restrictions, API guard patterns, and tests. |
| `docs/features/dashboard.md` | Dashboard onboarding: role-aware stats, review queues, attention projects, student work summaries, source map, and tests. |
| `docs/features/workspace-project-folders.md` | Workspace/project folders onboarding: folder shelves, search, class-detail movement, project assignment rules, source map, and tests. |
| `docs/features/projects.md` | Projects onboarding: create/edit/list/detail behavior, folder assignment, rollups, project cards, audit notes, and tests. |
| `docs/features/team-members.md` | Team/members onboarding: member list, direct student add, header team popover, roles, removal, source map, and tests. |
| `docs/features/official-tasks.md` | Official tasks/assignments onboarding: assignment create/edit/detail behavior, deadlines, derived assignment state, submissions, review decisions, source map, and tests. |
| `docs/features/resources-evidence.md` | Resource/evidence onboarding: resource links, evidence file upload/download/delete, lifecycle gates, source map, and tests. |
| `docs/features/ui-system.md` | UI system onboarding: academic ledger styling, shared shadcn/Radix primitives, source map, and verification. |

Add new feature onboarding documents under `docs/features/` as each feature is documented.

## Documentation Sync Policy

Every implementation change must keep documentation current before the work is considered complete.

- Update `docs/project.md` when feature status, implemented surface, routes, risks, source maps, or recommended next slices change.
- Update the relevant `docs/features/*.md` onboarding document when behavior, UI, API contracts, permissions, schema, workflows, cache behavior, tests, or known gaps change.
- Create a new `docs/features/<feature>.md` file when a changed area has no existing onboarding document, then add it to the Documentation Set above.
- Final implementation responses should name the docs updated, or explicitly state that no durable behavior changed.

## Current Feature Index

| Area | Current Status | Implemented Surface | Audit / Evidence |
| --- | --- | --- | --- |
| Auth/session | Implemented | Cookie-backed login/logout/current user, configurable session cookie `Secure`/`SameSite` flags, session revocation, active-account gate, origin guard, in-memory rate limits | Audited: `docs/features/auth-session.md`; `apps/api/internal/app/auth.go`, `apps/api/internal/app/security.go`, `apps/web/src/features/auth`, `apps/api/internal/app/lifecycle_test.go` |
| Admin accounts | Implemented | Bootstrap admin, admin-only account list/search with an explicit first-200 cap, create admin/teacher/student, role/status correction, password set, deactivation session revocation, account-change audit writes | Audited: `docs/features/admin-accounts.md`; `apps/api/internal/app/admin_users.go`, `apps/web/src/features/admin`, lifecycle tests |
| Protected routing/access | Implemented | Protected frontend shell, teacher/admin class guard, backend project view/manage checks on protected project routes, project-status mutation gates | Audited: `docs/features/protected-access.md`; `apps/web/src/app/router.tsx`, `apps/api/internal/app/permissions.go`, lifecycle tests |
| Dashboard | Implemented | Role-aware dashboard data, teacher review queue oldest-first, overdue assignment follow-ups, lifecycle-aware project follow-ups, student actionable assignment queue, recent submissions; frontend avoids generic KPI cards | Audited: `docs/features/dashboard.md`; `apps/api/internal/app/dashboard.go`, `apps/web/src/features/dashboard/pages/dashboard-page.tsx`, lifecycle tests |
| Workspace/project folders | Implemented | Colored lightweight class folders, active/archived folder shelves with show-more guards, folder search, searchable standalone project tray, subtly tinted class detail, project movement into folders | Audited: `docs/features/workspace-project-folders.md`; `apps/api/internal/app/classes.go`, `apps/web/src/features/workspace`, `apps/web/src/features/classes`, lifecycle tests |
| Projects | Implemented | Create/edit/list/detail projects with a 200-item list cap, class assignment, date range, authoritative status lifecycle gates, progress summary, project rollups, compact project-card grids, quiet project fact strip, centralized resource overview, flat split Work Plan with a wider milestone column and searchable selected-assignment panel | Audited: `docs/features/projects.md`; `apps/api/internal/app/projects.go`, `apps/web/src/features/projects`, lifecycle tests |
| Team/members | Implemented | Member list, low-emphasis header team trigger with count, direct add of existing active students by email, remove student, one `leader` maximum per project, promote/set `leader` or `member` role; team mutations require active/on-hold projects | Audited: `docs/features/team-members.md`; `apps/api/internal/app/projects.go`, project team popover, lifecycle tests |
| Assignments / official tasks | Implemented | Teacher/admin milestone-scoped assignment create/edit/detail, date-only deadline, priority, assignee validation, batched list assignee loading, project-status gates, derived assignment state, submission/review-driven lifecycle, flat assignment dossier UI, scalable assignment search UI | Audited: `docs/features/official-tasks.md`; `apps/api/internal/app/tasks.go`, `apps/web/src/features/tasks`, lifecycle tests |
| Nested child work items | Removed from active product | UI, API client functions, and protected API routes are removed to keep assignment workflow simple; historical `parent_task_id` schema remains unused. | `apps/api/internal/app/tasks.go`, assignment detail page, lifecycle tests |
| Invitation onboarding | Removed from active product | Public invite links, `/accept-invite`, invitation API routes, frontend invite UI, invitation DTOs, and active `invitations` table are removed. Student accounts are admin-created, then project managers add existing active students directly. | `apps/api/db/migrations/20260609000100_remove_invitations.sql`, `docs/features/team-members.md` |
| Progress submissions | Implemented | Assigned students submit assignment-scoped work only while projects are active, with title, description, blockers, duplicate-pending guard, completed-assignment guard, assignment timeline, and project rollups | Audited: `docs/features/official-tasks.md`; `apps/api/internal/app/tasks.go`, progress timeline UI, lifecycle tests |
| Progress review | Implemented | Teacher/admin review of submitted work for non-archived projects, one final review per submission, stale-review guard, review/state contradiction checks | Audited: `docs/features/official-tasks.md`; `apps/api/internal/app/tasks.go`, review form, lifecycle tests |
| Milestones | Implemented with polish remaining | Project milestones, CRUD, guarded delete when assignments exist, manual up/down reorder, required assignment linking, milestone rollups | `apps/api/internal/app/milestones.go`, project plan tree, lifecycle tests |
| Numeric assessments | Removed from active product | Frontend grading UI, API routes, DTOs, and handlers are removed for now; historical `assessments` schema remains unused except cleanup on milestone deletion. | Historical migration/table only |
| Feedback/replies | Removed from active product | Project/milestone/assignment discussion UI, feedback API routes, DTOs, dashboard previews, lifecycle tests, and active tables are removed; assignment review comments remain on `progress_reviews.review_comment`. | `apps/api/db/migrations/20260608000300_remove_feedback.sql` |
| Resource links | Implemented | Resource CRUD for project, milestone, assignment, and submission targets on active/on-hold projects, centralized project resource overview, compact inline chips/actions, scrollable centered management dialog, duplicate URL guard per target | Audited: `docs/features/resources-evidence.md`; `apps/api/internal/app/resources.go`, resource dialog/shelves, lifecycle tests |
| Meeting notes | Removed from active product | API routes, handlers, DTOs, project UI section, resource targets, file targets, and lifecycle tests are removed; removal migration drops meeting-note tables. | `apps/api/db/migrations/20260608000200_remove_meeting_notes.sql` |
| Evidence files | Implemented for progress submissions | Upload/download/delete files, compact per-submission evidence lists, local storage under `UPLOAD_STORAGE_DIR`, 10 MB limit, submitter/supervisor upload rules, lifecycle-gated writes | Audited: `docs/features/resources-evidence.md`; `apps/api/internal/app/files.go`, evidence file panel, lifecycle tests |
| Academic ledger UI | Implemented | Dark academic navigation, wider protected content frame, paper-like ledger sections, compact command headers, quiet project fact strips, centralized resource overview, flat split Work Plan hierarchy, divider-based milestone/task rows, selected assignment panel with local search/caps, flat assignment dossier pages, divider-based submission feeds, fixed-shell and confirmation dialogs, compact inline shelves, low-emphasis team popovers, violet edit buttons, status stamps, shadcn/Radix form primitives, shared loading/error/empty/forbidden states | Audited: `docs/features/ui-system.md`; `apps/web/src/components`, `apps/web/src/index.css` |
| Admin basics | Partial | Admin account management is implemented; admin all-project management, dashboard, and activity-log UI are still missing | `docs/features/admin-accounts.md` |
| Activity logs | Partial | `activity_logs` table exists and account-management writes are wired; admin audit UI and broader override writes are not wired | `apps/api/internal/app/admin_users.go` |
| Frontend automated tests | Missing/partial | Backend lifecycle coverage is strong; frontend route/component tests are still minimal or absent | Backlog item |

## Current Routes

| Route | Status | Purpose |
| --- | --- | --- |
| `/login` | Implemented | Existing user sign-in. |
| `/admin/users` | Implemented | Admin-only account list/search, creation, role/status correction, and password setting. |
| `/dashboard` | Implemented | Role-aware work summary. |
| `/workspace` | Implemented | Main project workspace with folders and projects. |
| `/workspace/classes/:classId` | Implemented | Teacher/admin folder detail and project movement. |
| `/workspace/projects/:projectId` | Implemented | Project dossier, quiet command header/fact strip, centralized resource overview, flat split Work Plan with selectable checkpoints and selected-assignment rows, centered resource dialog, and low-emphasis team popover. |
| `/workspace/projects/:projectId/tasks/:taskId` | Implemented | Flat assignment dossier with inline state summary, instructions, divider details/resources, single primary action, clean submissions feed, evidence, and review decisions. |

## Database Foundation

Implemented migrations cover:

- users, sessions, session revocation, case-insensitive user email index, and admin account-control writes
- projects and project members including direct add of existing active students and one-leader-per-project enforcement; historical invitation migrations remain, but `20260609000100_remove_invitations.sql` drops the active `invitations` table
- class folders through `course_sections` and `course_section_projects`
- assignments stored as tasks, task assignees, and date-only deadlines; `tasks.parent_task_id` remains historical schema but has no active feature surface
- progress submissions stored as progress updates and one-review-per-submission progress reviews
- project milestones and milestone-linked assignments through official-task records
- historical assessments table remains, but active grading routes and UI are removed
- feedback and feedback-reply tables are removed by `20260608000300_remove_feedback.sql`; assignment review comments remain in `progress_reviews`
- resource links
- meeting-note tables are removed by `20260608000200_remove_meeting_notes.sql`
- uploaded file metadata
- activity-log placeholders plus account-management writes

## Known Implementation Risks

- `classes` are implemented as lightweight colored project folders. Keep daily UX aligned around `Teacher -> Project -> Assignment -> Submission -> Review`; do not reintroduce course code/title, section, or term fields unless explicitly requested.
- Historical course migrations and table names remain, but standalone course routes and handlers have been removed from the active code. Keep the product surface on lightweight `/classes` project folders unless a standalone course module is explicitly requested.
- Milestones are planning checkpoints above assignments. Submissions and reviews remain assignment-scoped; milestones are not direct submission or review targets.
- Project status is authoritative for writes: `active` allows all work, `on_hold` blocks new assignments/submissions but allows manager maintenance, `completed` allows metadata/status updates plus pending reviews while blocking new work/team/support writes, and `archived` is read-only except status reactivation.
- Resource and file targets are validated in backend code instead of database foreign keys. Preserve historical target labels or add stronger constraints before destructive delete behavior expands.
- File storage is local filesystem storage under `UPLOAD_STORAGE_DIR`; production deployment still needs explicit persistence, backup, retention, MIME policy, and malware-scanning decisions.
- Separate HTTPS frontend/API hosts such as default Render `onrender.com` services require `SESSION_SECURE=true`, `SESSION_SAME_SITE=none`, exact `CORS_ALLOWED_ORIGINS`, and a matching frontend `VITE_API_URL` so cookie sessions persist.
- Account-management admin actions write activity logs, but project override behavior is not fully audited yet and the activity-log UI is still missing.

## Source Documents

This checkout currently keeps documentation lean. Use this file, feature onboarding docs under `docs/features/`, and the current code/tests as the source of truth.

The docs still reserve `references/` as the canonical rebuild-spec location if those files are restored later, but this checkout currently does not contain the `references/` directory.

## Technology Baseline

- Frontend: React, TypeScript, Vite, Tailwind CSS, shadcn/Radix primitives, React Router, TanStack Query, Zustand, Axios, React Hook Form, Zod.
- Backend: Go, chi, PostgreSQL, pgx, goose, REST, cookie-backed sessions, raw SQL.
- Database: PostgreSQL migrations under `apps/api/db/migrations`.
- Local services: Docker Compose for PostgreSQL.

## Current Minimal Commands

- Web build: `pnpm --filter @unitrack/web build`
- Web lint: `pnpm --filter @unitrack/web lint`
- API build: `make api-build`
- API test: `make api-test`
- DB validate: `make db-validate`

## Next Recommended Slices

1. Continue admin basics: all-project management, admin dashboard, and activity-log UI for account and override history.
2. Tighten file storage/security for production: persistent storage, retention, MIME allowlist, malware scanning, backup, and download policy.
3. Improve frontend automated tests for auth redirects, dashboard rendering, project/task forms, team member add/remove flows, and file/resource flows.
4. Continue polishing submission status copy, review decisions, and derived assignment state.
5. Add optional milestone templates or richer reorder behavior only after core supervision flows remain stable.
6. Keep class/folder polish modest unless many-project organization becomes a real usage bottleneck.
