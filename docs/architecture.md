# Architecture

Purpose: explain UniTrack's system design, domain model, authority boundaries, state/lifecycle rules, API shape, data integrity, and frontend state model.

Scope: keep cross-feature system rules here; keep feature UI/API details in `docs/features/`, hosted launch steps in `docs/deployment.md`, and verification command detail in `docs/testing.md`.

## System Shape

UniTrack is a project-first supervision platform. The durable product flow is `Teacher -> Project -> Assignment -> Submission -> Review`.

| Layer | Owns | Main Sources |
| --- | --- | --- |
| Web app | Routes, role-aware UX, forms, cache invalidation, accessible states. | `apps/web/src/app/router.tsx`, `apps/web/src/features`, `apps/web/src/lib` |
| API | Auth boundary, route contracts, permissions, lifecycle transactions, SQL writes. | `apps/api/internal/app/server.go`, feature handlers, `response.go`, `permissions.go` |
| Database | Relationships, uniqueness, deferred integrity, reviewed-support immutability. | `apps/api/db/migrations`, lifecycle tests |
| Storage | Evidence object storage behind API authorization. | `files.go`, `storage.go`, `docs/deployment.md` |

Backend and database are authoritative. Frontend guards are UX only.

## Domain Model

| Product Term | Compatibility Name | Rule |
| --- | --- | --- |
| Folder | `class`, `course_sections` | Lightweight teacher/admin project organization; not a standalone course module. |
| Project | `projects` | Primary business object and permission boundary. |
| Assignment | `task`, `tasks` | Official work item; active product excludes child tasks. |
| Submission | `progress_update` | Student assignment progress awaiting or carrying review state. |
| Review | `progress_reviews` | One teacher/admin decision per submission. |
| Resource | `resource_links` | Support link for project, milestone, assignment, or pending submission. |
| Evidence | `uploaded_files` | API/UI evidence files are submission support; DB target compatibility remains broader for legacy/polymorphic rows. |

Removed surfaces stay removed from active UI/API unless explicitly re-scoped: public invitations, standalone courses, numeric assessments, feedback/replies, meeting notes, and active child-task workflow. Some compatibility names or historical schema artifacts may remain schema-only until cleanup.

## Lifecycle Model

Project status controls writes:

| Status | Allows |
| --- | --- |
| `active` | New assignments, submissions, team/support changes, reviews, metadata/status changes. |
| `on_hold` | Manager maintenance such as plan/team/support changes and pending reviews; blocks new assignments/submissions. |
| `completed` | Metadata/status changes and pending reviews; blocks new work/team/support writes. |
| `archived` | Read-only except allowed status reactivation rules. |

Assignment state is derived from `tasks.status`, `tasks.official_progress_state`, pending submissions, deadline, and latest reviews. Submission review state lives on `progress_updates.review_status`; final review detail lives in `progress_reviews`.

## Write Pattern

Project-scoped writes should follow this pattern:

1. Validate route IDs and decode strict JSON.
2. Preflight viewer/manager access for clear UX errors.
3. Begin a transaction.
4. Lock the project row and recheck lifecycle.
5. Recheck manager/viewer relationship in the transaction when stale state matters.
6. Lock current target rows before mutation.
7. Let database constraints/triggers backstop relationship invariants.
8. Commit, then reload the DTO returned to the client.

Do not add new project-scoped write routes without preserving lifecycle locks and transaction-scoped permission rechecks.

## API Boundary

- All app routes live under `/api/v1`.
- Shared response helpers in `response.go` own JSON responses, strict 1 MB single-value decoding, status errors, and UUID route params.
- Route IDs should be validated before SQL unless a relationship helper deliberately returns stable `400` for malformed UUIDs.
- Paginated list endpoints reject invalid or overflow-sized page/limit values before calculating SQL offsets. Project-scoped nested collections keep legacy no-query array responses, and return `paginatedResponse<T>` when `page` or `limit` is supplied; folder detail adds `projectsPage` metadata for its embedded project list.
- Frontend API types in `apps/web/src/types/api.ts` and feature `api.ts` files are manual contracts; keep them aligned when DTOs change.

## Database Integrity

- Assignment assignees and progress submissions are project-aware.
- One pending submission per assignment is enforced at the schema level.
- New or retargeted progress submissions require an assigned active student on an official assignment, not a legacy child task.
- Folder owner/project supervisor matching is enforced by deferred triggers.
- Support targets must match their project.
- API/UI evidence uploads are submission-only; `uploaded_files` retains broader target compatibility in the database.
- Reviewed submission resources/evidence and reviewed submission status are immutable.
- Last-active-admin protection currently lives in app code, not a database constraint.

## Frontend State

- TanStack Query owns server state.
- Frontend queries use a short default freshness window (`staleTime` 30 seconds) and keep inactive query data for 10 minutes; mutations still explicitly invalidate affected query keys after writes.
- Zustand only mirrors current user for layout/affordances.
- Use `queryKeys` and shared invalidation helpers for cross-feature mutations.
- Stale `403`/`409` mutation failures should refresh affected workspace/folder/project/assignment/support/evidence/dashboard/account/current-user queries.
- Local forms must reset when entity/context changes, especially resource/evidence dialogs.

## Review Checklist

- Does this preserve the project-first flow?
- Does any write cross a project boundary or lifecycle state?
- Are frontend, API DTOs, SQL, and docs aligned?
- Are stale permissions/lifecycle states rechecked inside the transaction?
- Is the invariant enforced in the right layer: UI, API, DB, or more than one?
- Does query invalidation remove stale affordances after conflicts/forbidden responses?

## Verify

- API or lifecycle change: `make api-build` plus focused lifecycle tests.
- DB migration or trigger: `make db-validate` plus focused DB lifecycle tests.
- Frontend state/UI contract change: `pnpm --filter @unitrack/web lint` and `pnpm --filter @unitrack/web build`.
- User-visible role flow: targeted Playwright.
