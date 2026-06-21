# Project

## Goal

Build UniTrack as a web platform for teacher-supervised student project work. The product is project-first: teachers supervise project progress, students report progress, and the main navigation label for this area is `Workspace`.

## Documentation Set

Keep the docs small and feature-onboarding focused:

| File | Purpose |
| --- | --- |
| `docs/project.md` | Current feature index, implementation status, source map, risks, and next slices. |
| `docs/deployment.md` | Free deployment reference: recommended provider stack, environment shape, CDN/load-balancing decisions, and storage caveats. |
| `docs/deployment-guide.md` | Step-by-step launch guide for Vercel, Render, Neon, Cloudflare R2, verification, troubleshooting, and rollback. |
| `docs/audit.md` | Working audit tracker: audit queue, status values, findings log, and pass template. |
| `docs/features/backend-api.md` | Backend API onboarding: route registration, strict JSON decoding, route ID validation, error helpers, source map, and tests. |
| `docs/features/auth-session.md` | Auth/session onboarding: behavior, flows, sequence diagrams, source map, security notes, and tests. |
| `docs/features/admin-accounts.md` | Admin accounts onboarding: bootstrap admin, user management, role/status correction, password setting, audit writes, and tests. |
| `docs/features/protected-access.md` | Protected access onboarding: app route guards, project permissions, class/folder restrictions, API guard patterns, and tests. |
| `docs/features/dashboard.md` | Dashboard onboarding: role-aware stats, review queues, attention projects, student work summaries, source map, and tests. |
| `docs/features/workspace-project-folders.md` | Workspace/project folders onboarding: folder shelves, search, class-detail movement, project assignment rules, source map, and tests. |
| `docs/features/projects.md` | Projects onboarding: create/edit/list/detail behavior, folder assignment, rollups, project cards, audit notes, and tests. |
| `docs/features/team-members.md` | Team/members onboarding: member list, direct student add, header team popover, roles, removal, source map, and tests. |
| `docs/features/official-tasks.md` | Official tasks/assignments onboarding: assignment create/edit/detail behavior, deadlines, derived assignment state, submissions, review decisions, source map, and tests. |
| `docs/features/resources-evidence.md` | Resource/evidence onboarding: resource links, evidence file upload/download/delete, reviewed-support immutability, lifecycle gates, source map, and tests. |
| `docs/features/database-integrity.md` | Database integrity onboarding: project-aware assignment constraints, submission consistency, pending-submission uniqueness, support target triggers, source map, and remaining risks. |
| `docs/features/frontend-state.md` | Frontend state/data-flow onboarding: query keys, invalidation helpers, stale-error refreshes, auth-store sync, form target resets, and tests. |
| `docs/features/ui-system.md` | UI system onboarding: academic ledger styling, shared shadcn/Radix primitives, source map, and verification. |
| `docs/features/testing-qa.md` | Testing/QA onboarding: backend tests, Playwright suite map, root QA aliases, environment knobs, and gaps. |

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
| Auth/session | Implemented | Cookie-backed login/logout/current user, idempotent stale-session cookie clearing on logout, login/session creation serialized with account-control mutations, configurable session cookie `Secure`/`SameSite` flags, startup validation for unsafe cookie/CORS combinations, session revocation, active-account gate, origin guard that rejects untrusted origins, does not trust wildcard CORS origins, and rejects missing-origin session-cookie writes, bounded in-memory login rate limits, missing-account login timing hardening | Audited A04/A05: `docs/features/auth-session.md`; `apps/api/internal/app/auth.go`, `apps/api/internal/app/security.go`, `apps/api/internal/config/config.go`, `apps/web/src/features/auth`, `apps/api/internal/app/lifecycle_test.go`, `apps/api/internal/app/security_test.go` |
| Backend API request boundary | Implemented | `/api/v1` route registration, shared JSON responses, strict 1 MB single-value JSON decoding with unknown-field rejection, malformed route ID `400`s before UUID-column database casts for active task/milestone/progress/resource/file/member routes, and audited web API client/server route alignment | Audited A14: `docs/features/backend-api.md`; `apps/api/internal/app/server.go`, `apps/api/internal/app/response.go`, `apps/api/internal/app/tasks.go`, `apps/api/internal/app/milestones.go`, `apps/api/internal/app/files.go`, lifecycle tests |
| Admin accounts | Implemented | Validated bootstrap admin, admin-only account list/search with an explicit first-200 cap and 25-row frontend paging, create admin/teacher/student, role/status correction with serialized last-active-admin guard, guided account transitions for open teacher work and active student work, dedicated replacement-supervisor candidate loading, password set with session revocation and self-reset sign-out, deactivation session revocation serialized against login, stale-admin-list forbidden handling, cross-feature cache invalidation after account mutations, account-change audit writes | Audited A05/A15: `docs/features/admin-accounts.md`; `apps/api/internal/app/admin_users.go`, `apps/api/internal/app/bootstrap.go`, `apps/api/internal/config/config.go`, `apps/web/src/features/admin`, lifecycle tests |
| Database integrity | Implemented | Project-aware task-assignee constraints, same-project progress submission FK, one pending submission per assignment at the schema level, assigned-active-student validation for new or retargeted progress submissions, same-project historical child-task FK, deferred folder owner/project supervisor triggers, deferred support target project-match triggers, reviewed-support immutability triggers, current-membership dashboard submission scoping, project-aware progress joins | Audited A13 plus post-audit hardening: `docs/features/database-integrity.md`; `apps/api/db/migrations/20260619000100_assignment_submission_integrity.sql`, `apps/api/db/migrations/20260620000100_folder_and_task_integrity.sql`, `apps/api/db/migrations/20260621000100_support_target_integrity.sql`, `apps/api/db/migrations/20260621000200_reviewed_support_immutability.sql`, `apps/api/db/migrations/20260621000300_progress_submitter_integrity.sql`, `apps/api/internal/app/tasks.go`, `apps/api/internal/app/dashboard.go`, lifecycle tests, `/tmp/opencode/unitrack-a13-audit-20260620/` |
| Protected routing/access | Implemented | Protected frontend shell, teacher/admin class guard, backend project view/manage checks on protected project routes, project-status mutation gates, Playwright access-control regressions for key forbidden states and stale action affordances | Audited: `docs/features/protected-access.md`; `apps/web/src/app/router.tsx`, `apps/api/internal/app/permissions.go`, `apps/web/e2e/access-control.spec.ts`, lifecycle tests |
| Dashboard | Implemented | Role-aware dashboard data, compact role-specific summary chips with admin/teacher people counts, teacher/admin review queue oldest-first, overdue assignment follow-ups, SQL-filtered lifecycle-aware project follow-up candidates, grouped student actionable assignment queue, recent submissions; frontend avoids generic KPI cards | Audited A12: `docs/features/dashboard.md`; `apps/api/internal/app/dashboard.go`, `apps/web/src/features/dashboard/pages/dashboard-page.tsx`, `apps/web/e2e/dashboard.spec.ts`, lifecycle tests, `/tmp/opencode/unitrack-a12-audit-20260620/` |
| Workspace/project folders | Implemented | Colored lightweight class folders with balanced card ratios, active/archived folder shelves with show-more guards, folder search, clearable folder descriptions, server-filtered standalone project tray, stale-safe server-side add-existing candidate search with archived exclusion, admin folder-owner selection on create, subtly tinted class detail with labeled project open actions and archived-folder add guidance, transaction-locked project movement into folders, deferred DB owner/supervisor matching triggers | Audited A06/A13/A15: `docs/features/workspace-project-folders.md`; `apps/api/internal/app/classes.go`, `apps/api/internal/app/projects.go`, `apps/web/src/features/workspace`, `apps/web/src/features/classes`, lifecycle tests, `apps/web/e2e/database-integrity.spec.ts`, `apps/web/e2e/state-flow.spec.ts` |
| Projects | Implemented | Create/edit/list/detail projects with a 200-item list cap, class assignment, visible date-range validation, transaction-locked status lifecycle gates, progress summary, project rollups, balanced compact project-card grids, labeled project detail header, compact mission-control strip with lifecycle-aware next actions, dialog checkpoint creation, grouped assignment-first Work Plan with role-aware filters/search, atomic checkpoint reorder, non-blocking reference-link loading, quiet default rows, and a manage-plan mode for editing controls | Audited A03/A07: `docs/features/projects.md`; `apps/api/internal/app/projects.go`, `apps/api/internal/app/milestones.go`, `apps/web/src/features/projects`, lifecycle tests |
| Team/members | Implemented | Member list, low-emphasis header team trigger with count, direct add of existing active students by email with locked account-state revalidation, inactive account markers, active-student-only assignment selectors, remove student with task-unassignment cleanup and cleanup-count audit metadata, one `leader` maximum per project, promote/set `leader` or `member` role, project-scoped activity-log writes; team mutations require active/on-hold projects | Audited A08: `docs/features/team-members.md`; `apps/api/internal/app/projects.go`, project team popover, lifecycle tests |
| Assignments / official tasks | Implemented | Teacher/admin milestone-scoped assignment create/edit/detail, transaction-safe milestone/current-row validation for assignment create/edit, compact scroll-safe assignment edit dialog, date-only deadline, priority, assignee validation, batched list assignee loading, project-status gates, derived assignment state, assignment-scoped submissions/reviews, historical child-task progress exclusion, teacher review desk with sticky decision panel, student workbench/read-only states, structured assignment dossier UI, scalable assignment search UI | Audited A09: `docs/features/official-tasks.md`; `apps/api/internal/app/tasks.go`, `apps/web/src/features/tasks`, lifecycle tests |
| Nested child work items | Removed from active product | UI, API client functions, protected API routes, active progress queues, review endpoints, and rollups exclude child-task rows to keep assignment workflow simple; historical `parent_task_id` schema remains unused. | `apps/api/internal/app/tasks.go`, assignment detail page, lifecycle tests |
| Invitation onboarding | Removed from active product | Public invite links, `/accept-invite`, invitation API routes, frontend invite UI, invitation DTOs, and active `invitations` table are removed. Student accounts are admin-created, then project managers add existing active students directly. | `apps/api/db/migrations/20260609000100_remove_invitations.sql`, `docs/features/team-members.md` |
| Progress submissions | Implemented | Assigned students submit assignment-scoped work only while projects are active, with trimmed title/description/blockers, transaction-rechecked active assignment/member/student eligibility, duplicate-pending guard, completed-assignment guard, assignment timeline, child-task target exclusion, and project rollups | Audited A10: `docs/features/official-tasks.md`; `apps/api/internal/app/tasks.go`, progress timeline UI, lifecycle tests |
| Progress review | Implemented | Teacher/admin review of assignment submissions for non-archived projects, transaction-rechecked manager authority, one final review per submission, stale-review guard, pending-review completion guard, review/state contradiction checks, support-data load/error blocking in the review desk, status-specific review history tones, and required revision guidance when returning/rejecting work | Audited A10: `docs/features/official-tasks.md`; `apps/api/internal/app/tasks.go`, review form, lifecycle tests, `/tmp/opencode/unitrack-a10-audit-20260620/` |
| Milestones | Implemented with polish remaining | Project milestones, CRUD, guarded delete when assignments exist, atomic manual up/down reorder, required assignment linking, milestone rollups | `apps/api/internal/app/milestones.go`, project plan tree, lifecycle tests |
| Numeric assessments | Removed from active product | Frontend grading UI, API routes, DTOs, and handlers are removed for now; historical `assessments` schema remains unused except cleanup on milestone deletion. | Historical migration/table only |
| Feedback/replies | Removed from active product | Project/milestone/assignment discussion UI, feedback API routes, DTOs, dashboard previews, lifecycle tests, and active tables are removed; assignment review comments remain on `progress_reviews.review_comment`. | `apps/api/db/migrations/20260608000300_remove_feedback.sql` |
| Resource links | Implemented | Resource CRUD for project, milestone, assignment, and pending assignment-submission targets on active/on-hold projects, transaction-scoped access/target rechecks, database-backed project/target matching, database-backed reviewed-submission immutability, project-level reference chips in the detail side rail, compact checkpoint/assignment/submission inline actions, target-keyed scrollable centered management dialog, duplicate URL guard per target | Audited A11/A15 plus post-audit integrity hardening: `docs/features/resources-evidence.md`; `apps/api/internal/app/resources.go`, resource dialog/shelves, lifecycle tests, `/tmp/opencode/unitrack-a11-audit-20260620/` |
| Meeting notes | Removed from active product | API routes, handlers, DTOs, project UI section, resource targets, file targets, and lifecycle tests are removed; removal migration drops meeting-note tables. | `apps/api/db/migrations/20260608000200_remove_meeting_notes.sql` |
| Evidence files | Implemented for assignment progress submissions | Upload/download/delete files for pending submissions, reviewed-submission download/read preservation with upload/delete blocked, visible per-submission evidence panels with compact file lists and styled upload docket, local development storage under `UPLOAD_STORAGE_DIR`, production R2 storage through private API-proxied downloads, client/server 10 MB limit, transaction-scoped access/target checks, database-backed project/target matching, database-backed reviewed-support immutability, closed-project downloads, lifecycle-gated writes/deletes, lifecycle-aware owner-delete affordances | Audited A11 plus post-audit integrity hardening: `docs/features/resources-evidence.md`; `apps/api/internal/app/files.go`, `apps/api/internal/app/storage.go`, evidence file panel, access-control Playwright spec, lifecycle tests, `/tmp/opencode/unitrack-a11-audit-20260620/` |
| Academic ledger UI | Implemented | Ocean/dark-blue visual system, dark navy navigation with keyboard skip link, line-only water/current SVG mark and nav icons, animated current-line accents, wider protected content frame, compact centered auth card, foam-like ledger sections, compact command headers, labeled project status stamps, project mission-control strips, quiet grouped Work Plans with manage-plan mode, divider-based checkpoint/task rows, assignment ledger filters with local search/caps, structured assignment review desks and student workbench states with native radio review decisions, divider-based history feeds with visible styled evidence panels, focus-trapped fixed-shell dialogs with one named close control, confirmation dialogs, scroll-safe assignment form footers, compact inline shelves, keyboardable folder color radios, low-emphasis team popovers, violet edit buttons, status stamps, shadcn/Radix form primitives, accessible auth labels, scrollable auth shell, shared loading/error/empty/forbidden states | Audited A16: `docs/features/ui-system.md`; `apps/web/src/components`, `apps/web/src/components/shared/ocean-lines.tsx`, `apps/web/src/index.css`, `apps/web/e2e/accessibility.spec.ts` |
| Frontend state/data flow | Implemented | Centralized query keys, shared workspace/class/project/admin/assignment/support/evidence invalidation helpers, stale `403`/`409` refresh helpers, auth-store clearing only on confirmed `401`, dedicated admin replacement-supervisor candidates, stale-safe folder add-project search, clearable folder descriptions, and target-keyed resource forms | Audited A15: `docs/features/frontend-state.md`; `apps/web/src/lib/query-keys.ts`, `apps/web/src/lib/query-invalidation.ts`, `apps/web/src/features/auth/hooks.ts`, `apps/web/src/features/admin`, `apps/web/src/features/workspace`, `apps/web/src/features/classes`, resource dialogs, `apps/web/e2e/state-flow.spec.ts` |
| Admin basics | Partial | Admin account management and lightweight global dashboard summary are implemented; admin all-project management, richer admin analytics, and activity-log UI are still missing | `docs/features/admin-accounts.md`, `docs/features/dashboard.md` |
| Activity logs | Partial | `activity_logs` table exists and account-management plus project member add/role/remove writes are wired; admin audit UI and broader override writes are not wired | `apps/api/internal/app/admin_users.go`, `apps/api/internal/app/projects.go` |
| Frontend automated tests | Partial | Backend lifecycle coverage is strong, including focused project-lifecycle lock regressions; Playwright browser coverage checks local admin login/dashboard, admin account create/search/sign-in, dashboard role branches and admin count chips, folder candidate owner/supervisor filtering, folder description clearing, stale folder candidate hiding, keyboard skip link/dialog/color-radio accessibility, key access-control forbidden states and stale action affordances, inactive login blocking, closed-project evidence read-only behavior, and a login-page visual artifact; API-dependent browser specs fail when the API is missing unless explicitly configured to skip; root QA aliases and isolated web-server command overrides are documented; broader route/component coverage is still missing | `docs/features/testing-qa.md`, `apps/web/playwright.config.ts`, `apps/web/e2e/` |

## Current Routes

| Route | Status | Purpose |
| --- | --- | --- |
| `/login` | Implemented | Existing user sign-in. |
| `/admin/users` | Implemented | Admin-only account list/search, creation, role/status correction, and password setting. |
| `/dashboard` | Implemented | Role-aware work summary. |
| `/workspace` | Implemented | Main project workspace with folders and projects. |
| `/workspace/classes/:classId` | Implemented | Teacher/admin folder detail, labeled project open actions, server-side add-existing project search, and transaction-locked project movement. |
| `/workspace/projects/:projectId` | Implemented | Project dossier, labeled command header, compact mission-control strip, grouped assignment-first Work Plan with role-aware filters/search, manage-plan mode for edit/reorder/add controls, quiet detail/reference cards below the board, centered resource dialog, and low-emphasis team popover. |
| `/workspace/projects/:projectId/tasks/:taskId` | Implemented | Structured assignment page with concise command header, teacher review desk with sticky decision panel, student workbench/read-only states, brief/context panels, history feed, visible styled submission resource/evidence panels, pending-submission support management, reviewed-support read-only state, and review decisions. |

## Database Foundation

Implemented migrations cover:

- users, sessions, session revocation, case-insensitive user email index, and admin account-control writes
- projects and project members including direct add of existing active students and one-leader-per-project enforcement; historical invitation migrations remain, but `20260609000100_remove_invitations.sql` drops the active `invitations` table
- class folders through `course_sections` and `course_section_projects`, including deferred owner/supervisor matching triggers
- assignments stored as tasks, project-aware task assignees, date-only deadlines, and a same-project historical child-task FK; `tasks.parent_task_id` remains historical schema but has no active feature surface
- progress submissions stored as progress updates with same-project task constraints, trigger-backed assigned-active-student validation for new or retargeted submissions, one pending submission per assignment, and one-review-per-submission progress reviews
- project milestones and milestone-linked assignments through official-task records
- historical assessments table remains, but active grading routes and UI are removed
- feedback and feedback-reply tables are removed by `20260608000300_remove_feedback.sql`; assignment review comments remain in `progress_reviews`
- resource links with deferred support target project-match and reviewed-support immutability triggers
- meeting-note tables are removed by `20260608000200_remove_meeting_notes.sql`
- uploaded file metadata with deferred support target project-match and reviewed-support immutability triggers
- activity-log placeholders plus account-management and project-member writes

## Known Implementation Risks

- `classes` are implemented as lightweight colored project folders. Keep daily UX aligned around `Teacher -> Project -> Assignment -> Submission -> Review`; do not reintroduce course code/title, section, or term fields unless explicitly requested.
- Historical course migrations and table names remain, but standalone course routes and handlers have been removed from the active code. Keep the product surface on lightweight `/classes` project folders unless a standalone course module is explicitly requested.
- Milestones are planning checkpoints above assignments. Submissions and reviews remain assignment-scoped; milestones are not direct submission or review targets.
- Project status is authoritative for writes: `active` allows all work, `on_hold` blocks new assignments/submissions but allows manager maintenance, `completed` allows metadata/status updates plus pending reviews while blocking new work/team/support writes, and `archived` is read-only except status reactivation.
- Resource and file targets are polymorphic, but deferred database triggers now enforce project/target matching and reviewed-submission support immutability for project, milestone, assignment, assignment-submission, and resource-link support targets. Preserve historical target labels and update trigger helpers if target types change.
- File storage is local filesystem storage under `UPLOAD_STORAGE_DIR` for development and private Cloudflare R2 object storage for production. Production startup rejects local storage, but hosted usage still needs backup/retention decisions, MIME policy, malware scanning, quotas, and repair handling for rare DB/object-storage drift.
- Separate HTTPS frontend/API hosts such as default Render `onrender.com` services require `SESSION_SECURE=true`, `SESSION_SAME_SITE=none`, exact HTTPS `CORS_ALLOWED_ORIGINS`, and a matching frontend `VITE_API_URL` so cookie sessions persist; startup rejects `SameSite=None` without `Secure`, wildcard/malformed CORS origins, production HTTP CORS origins, production insecure cookies, and missing production `DATABASE_URL`.
- Account-management admin actions and project member add/role/remove actions write activity logs, but broader project override behavior is not fully audited yet and the activity-log UI is still missing.
- Account role/status changes serialize active-admin preservation and login/session creation; guided account transitions now require teacher/admin replacement for open supervised work and confirmation before active student work cleanup.
- Project member add serializes target student account-state revalidation with admin account-control mutations before membership insert.
- Existing project-scoped lifecycle writes now re-check project status under transaction-scoped project-row locks, but this remains a per-handler convention that future write routes must preserve.
- Progress submission author validation is trigger-backed for inserts and submitter/project/task retargets; historical submissions remain readable after member or assignment cleanup because later membership deletion does not rewrite existing `progress_updates` rows.
- Strict JSON decoding and route ID validation are shared helpers, but route ID validation remains a per-handler convention for new endpoints unless a relationship/permission helper already converts malformed UUIDs into `400`.
- Frontend cache refresh behavior is centralized in shared helpers, but remains a mutation-by-mutation convention. New mutations that can affect workspace, folder, project, assignment workflow, support, evidence, dashboard, or account state should use `queryKeys` plus `query-invalidation` helpers and refresh affected queries after stale `403`/`409` responses.
- Accessibility coverage is focused rather than comprehensive. Preserve the protected skip link, single named dialog close control, native or fully keyboarded radio groups, and explicit names for compact icon actions when changing the UI system.
- Resource/evidence writes now re-check current project access and target state under transaction-scoped project locks; reviewed submission support records are immutable in the API and database while reads/downloads remain available.
- Dashboard aggregates and project follow-up candidates are hand-written SQL; keep stats, role scopes, lifecycle filters, and frontend `projectNeedsAttention` semantics aligned when project or assignment states change.
- Folder owner/project-supervisor matching is enforced by API checks plus deferred database triggers, so legitimate account-transition transactions can update linked projects/folders together while final mismatches are rejected at commit.

## Source Documents

This checkout currently keeps documentation lean. Use this file, feature onboarding docs under `docs/features/`, and the current code/tests as the source of truth.

The docs still reserve `references/` as the canonical rebuild-spec location if those files are restored later, but this checkout currently does not contain the `references/` directory.

## Technology Baseline

- Frontend: React, TypeScript, Vite, Tailwind CSS, shadcn/Radix primitives, React Router, TanStack Query, Zustand, Axios, React Hook Form, Zod, Playwright.
- Backend: Go, chi, PostgreSQL, pgx, goose, REST, cookie-backed sessions, raw SQL.
- Database: PostgreSQL migrations under `apps/api/db/migrations`.
- Local services: Docker Compose for PostgreSQL.

## Deployment Reference

Recommended free launch stack: Vercel for the Vite frontend, Render for the Go API, Neon for PostgreSQL, and Cloudflare R2 for durable evidence files. Keep the full rationale, environment values, and launch checklist in `docs/deployment.md`.

No separate CDN or load balancer is needed for the first launch. Vercel already provides CDN-backed frontend hosting, Render already provides HTTPS routing to the API, and the API should stay single-instance until in-memory rate limits are replaced with a shared mechanism and database connection pressure is reviewed.

## Current Minimal Commands

- Web build: `pnpm --filter @unitrack/web build`
- Web lint: `pnpm --filter @unitrack/web lint`
- Web browser tests: `pnpm --filter @unitrack/web test:e2e` or `pnpm test:e2e:web` or `make web-test-e2e`
- Web headed browser tests: `pnpm --filter @unitrack/web test:e2e:headed`, `pnpm test:e2e:web:headed`, or `make web-test-e2e-headed`
- Web browser install: `pnpm --filter @unitrack/web test:e2e:install`; on fresh Linux/WSL images, `pnpm --filter @unitrack/web test:e2e:install-deps` may also be required with sudo.
- Web browser UI mode: `pnpm --filter @unitrack/web test:e2e:ui`
- Web browser report: `pnpm --filter @unitrack/web test:e2e:report`, `pnpm test:e2e:web:report`, or `make web-test-e2e-report`
- API build: `make api-build`
- API test: `make api-test`
- DB validate: `make db-validate`
- Demo seed: `cd apps/api && DATABASE_URL='<postgres-url>' go run ./cmd/seed`; to replace existing demo rows, add `-reset -confirm-reset=demo.unitrack.local`

## Next Recommended Slices

1. Continue data-safety audits with remaining API transaction boundaries and direct-write constraints beyond lifecycle, account-control gates, folder matching, support-record target project matching, and progress submitter validation.
2. Continue admin basics: all-project management, admin dashboard, and activity-log UI for account and override history.
3. Harden production evidence storage with retention, MIME allowlist, malware scanning, backup, quotas, repair jobs, and optional signed-download policy if API-proxied R2 downloads become too expensive or slow.
4. Expand frontend automated tests beyond the current auth/access-control/accessibility/admin-account/dashboard/database-integrity/state-flow Playwright coverage to cover dashboard empty/error states, project/task forms, team member add/remove flows, redirects, archived-project affordances, and file/resource flows.
5. Continue polishing submission status copy, review decisions, and derived assignment state.
6. Add optional milestone templates or richer reorder behavior only after core supervision flows remain stable.
7. Keep class/folder polish modest unless many-project organization becomes a real usage bottleneck.
