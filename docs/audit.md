# Audit Tracker

This tracker is the working queue for deep UniTrack audits. Use it to audit one topic at a time, collect evidence, and avoid mixing product, security, data, and visual concerns in one pass.

## Status Values

| Status | Meaning |
| --- | --- |
| `not_started` | No focused audit has been performed in the current audit cycle. |
| `in_progress` | Evidence is being collected or findings are being validated. |
| `findings_open` | Audit pass is complete and at least one issue remains unresolved. |
| `clean` | Audit pass found no blocking issues, or all findings were resolved and rechecked. |
| `deferred` | Audit is intentionally postponed because it depends on another slice or external decision. |

## Severity Values

| Severity | Meaning |
| --- | --- |
| `critical` | Security/data-loss/cross-tenant access risk, or product flow is unusable. |
| `high` | Incorrect business behavior, broken permission/lifecycle rule, or major UX blocker. |
| `medium` | Confusing workflow, missing validation, fragile implementation, or important test gap. |
| `low` | Polish, minor copy/layout issue, small refactor, or non-blocking docs mismatch. |

## Audit Queue

| ID | Topic | Status | Priority | Primary Evidence Sources | Output |
| --- | --- | --- | --- | --- | --- |
| A01 | Product scope and business workflow | clean | high | `docs/project.md`, feature docs, rendered role flows | Product-fit findings and scope drift list |
| A02 | Roles, permissions, and access control | clean | critical | `apps/api/internal/app/permissions.go`, protected routes, frontend guards, lifecycle tests | Permission matrix findings |
| A03 | Project lifecycle logic | clean | critical | project status gates, mutation handlers, lifecycle tests, UI affordances | Status-rule findings and race risks |
| A04 | Auth and session security | clean | critical | auth/session handlers, security middleware, cookie/CORS settings, auth docs | Auth/security findings |
| A05 | Admin account management | clean | high | admin API handlers, admin UI, audit writes, account docs | Account-control findings |
| A06 | Workspace and project organization | clean | medium | workspace page, folder detail, project cards, folder APIs | Navigation/organization findings |
| A07 | Project detail and Work Plan | clean | high | project detail page, milestones/tasks APIs, Playwright screenshots | Project workflow/UI findings |
| A08 | Team and membership logic | clean | high | member handlers, team popover, assignment cleanup tests | Membership findings |
| A09 | Assignments and official tasks | clean | high | task handlers, assignment forms, assignment state helper, docs | Assignment behavior findings |
| A10 | Submissions and review workflow | clean | critical | progress update/review handlers, review form, history UI, lifecycle tests | Submission/review findings |
| A11 | Resources and evidence files | clean | high | resource/file handlers, evidence UI, storage config, lifecycle tests | Resource/file findings |
| A12 | Dashboard logic | clean | high | dashboard handler, dashboard UI, project attention helpers | Role dashboard findings |
| A13 | Database schema and integrity | clean | critical | migrations, constraints, SQL joins, DB validation | Schema/integrity findings |
| A14 | Backend API implementation | clean | high | route registration, handlers, validation, transactions, SQL | API correctness findings |
| A15 | Frontend state and data flow | clean | high | query keys, invalidations, forms, client permissions | Cache/form findings |
| A16 | Visual UI system and accessibility | clean | high | Playwright screenshots, keyboard/focus checks, UI docs | Visual/accessibility findings |
| A17 | Testing and QA coverage | clean | medium | Go tests, Playwright tests, package scripts, seed data | Test gap list |
| A18 | Deployment, security, and operations | clean | high | env docs, CORS/cookie config, file storage, logs | Deployment/ops findings |
| A19 | Documentation accuracy | clean | medium | `docs/project.md`, `docs/features/*.md`, implementation source maps | Docs mismatch findings |

## Current Findings

Record findings here as audits run. Keep each row specific enough to reproduce and fix.

| ID | Audit ID | Severity | Status | Finding | Evidence | Recommended Fix |
| --- | --- | --- | --- | --- | --- | --- |
| F001 | A16 | medium | resolved | Project and assignment detail pages were over-carded, dense, and workflow hierarchy was unclear on desktop. | Playwright screenshots in `/tmp/opencode/unitrack-redesign-v2-20260619/`; prior metrics showed project laptop `4.81` screens and `70` actions. | Reworked project detail into mission control plus manage-plan mode, and assignment detail into review desk/workbench states. Rechecked with project laptop `3.13` screens and `31` actions. |
| F002 | A01 | high | resolved | Evidence-file lifecycle behavior contradicted the project record model: downloads were blocked by a write-style lifecycle gate on completed/archived projects, while deletes had no lifecycle gate and could remove evidence from closed records. | Fixed in `apps/api/internal/app/files.go`; download now relies on project view access only, delete now uses the support-change lifecycle gate, and `TestProgressEvidenceFileLifecycleAndPermissions` covers completed/archived downloads and delete blocking. | Keep evidence downloads read-preserving for project viewers and lifecycle-gate evidence writes/deletes on future file changes. |
| F003 | A01 | low | resolved | Dashboard review items used a stale `#progress-{id}` anchor after the assignment page moved pending reviews into the review desk. | Fixed in `apps/web/src/features/dashboard/pages/dashboard-page.tsx`; teacher/admin review queue links now target `#assignment-workflow`; `docs/features/dashboard.md` was updated. | Keep dashboard review CTAs aligned with the assignment review desk anchor. |
| F004 | A01 | low | resolved | Public backend/API error copy still exposed `class` terminology even though the active product model is lightweight project folders. | Fixed in `apps/api/internal/app/classes.go` and `apps/api/internal/app/projects.go`; user-facing errors now say `folder` while compatibility route/field names remain unchanged. | Keep compatibility route/DTO names separate from user-facing folder copy. |
| F005 | A02 | medium | resolved | Closed-project evidence delete affordances could appear for the file uploader even though the backend rejects completed/archived evidence deletes. | Fixed in `apps/web/src/features/files/components/evidence-file-panel.tsx`, `apps/web/src/features/tasks/components/progress-timeline.tsx`, and `apps/web/src/features/tasks/pages/task-detail-page.tsx`; uploader-owned deletes now require a lifecycle-aware `canDeleteOwnEvidence` flag. `apps/web/e2e/access-control.spec.ts` verifies completed-project evidence remains downloadable without upload/delete buttons. | Keep owner-delete UI checks separate from manager-delete checks so closed projects stay read-only in the browser while backend lifecycle gates remain authoritative. |
| F006 | A02 | medium | resolved | Frontend access-control coverage was too thin for protected-route and hidden-action regressions. | Added `apps/web/e2e/access-control.spec.ts`, which provisions temporary users/project data through the API and covers teacher/student `/admin/users` denial, student folder-route denial, project-manager action hiding, non-member project denial, inactive-account login blocking, and closed-project evidence affordances. | Keep expanding browser coverage for broader route/component workflows, but preserve API-created fixtures for access-control tests instead of relying on demo seed rows. |
| F007 | A04 | high | resolved | Unsafe cookie-authenticated write requests with no `Origin` and no parseable `Referer` were allowed through the origin guard, leaving the cookie session flow dependent on browser SameSite behavior instead of an explicit server-side origin signal. | Fixed in `apps/api/internal/app/security.go`; `requireTrustedOrigin` now rejects missing-origin unsafe requests when the session cookie is present. `TestOriginGuardRejectsMissingOriginOnSessionUnsafeRequest` covers the regression, and test helpers send the trusted frontend origin for normal browser-style writes. | Keep non-browser no-cookie requests compatible, but require trusted origin evidence for session-cookie state changes until a full CSRF-token flow is added. |
| F008 | A03 | high | resolved | Project lifecycle gates were TOCTOU checks outside the write transactions they were meant to protect. | Fixed with `lockProjectLifecycleTx` / `requireProjectLifecycleTx` in `apps/api/internal/app/projects.go`; project-scoped writes in projects, members, milestones, assignments, submissions, reviews, resources, evidence files, and folder movement now re-check status under `SELECT ... FOR UPDATE` before mutating. | New project-scoped write handlers must keep the preflight lifecycle check for UX and the transaction-scoped lock check before commit. |
| F009 | A03 | high | resolved | `PATCH /projects/{id}` evaluated archived read-only rules from a stale pre-transaction project snapshot. | Fixed in `apps/api/internal/app/projects.go`; project update now decodes input, locks the project row inside the transaction, then evaluates archived status-only behavior and applies metadata/folder/status changes. `TestLifecycleLockRejectsMetadataUpdateAfterConcurrentArchive` covers the race. | Keep status transitions and metadata/folder updates serialized on the project row. |
| F010 | A03 | medium | resolved | Archived project mission control could show manager review CTAs even though archived projects reject review writes. | Fixed in `apps/web/src/features/projects/pages/project-detail-page.tsx`; manager next actions now use `projectAcceptsReviews(project)`. | Keep mission-control next actions aligned with backend lifecycle helpers. |
| F011 | A03 | medium | resolved | Folder detail exposed remove-from-folder actions for archived projects that backend lifecycle gates reject. | Fixed in `apps/web/src/features/classes/pages/class-detail-page.tsx` and `apps/web/src/lib/permissions.ts`; remove actions now use `projectAcceptsMetadataChanges(project)`. | Keep folder movement and unlink affordances tied to metadata-change lifecycle rules. |
| F012 | A03 | medium | resolved | Tests covered sequential lifecycle gates but not status-flip race closure. | Added focused lifecycle-lock tests in `apps/api/internal/app/lifecycle_test.go`: `TestLifecycleLockRejectsAssignmentAfterConcurrentCompletion` and `TestLifecycleLockRejectsMetadataUpdateAfterConcurrentArchive`. | Add similar locked-race coverage when new write categories are introduced. |
| F013 | A04 | medium | resolved | Logout was inside the protected route group, so a stale or already-revoked session cookie could receive `401` instead of being explicitly expired by the API. | Fixed in `apps/api/internal/app/server.go` and `apps/api/internal/app/auth.go`; `POST /auth/logout` is public behind the origin guard, revokes a presented token when present, and always expires the session cookie. `TestLogoutClearsCookieForAlreadyRevokedSession` covers the regression. | Keep logout idempotent enough to clear browser cookies even when the server-side session is already invalid. |
| F014 | A04 | medium | resolved | Logout cookie expiry did not preserve configured `SameSite=None`, creating mismatched cookie behavior for cross-site HTTPS frontend/API deployments. | Fixed in `apps/api/internal/app/auth.go`; logout now uses `sessionSameSiteMode(s.cfg.SessionSameSite)`. `TestSessionCookieFlagsFollowConfig` covers login and logout cookie attributes. | Keep session-cookie set and clear paths on the same flag configuration. |
| F015 | A04 | high | resolved | Wildcard `CORS_ALLOWED_ORIGINS=*` could be treated as a trusted unsafe-request origin even though credentialed cookie sessions require exact origin trust. | Fixed in `apps/api/internal/app/security.go` and `apps/api/internal/config/config.go`; wildcard origins are not trusted by the origin guard and config validation rejects wildcard CORS with credentialed sessions. `TestOriginGuardDoesNotTrustWildcardOrigins` and config validation tests cover the behavior. | Require exact frontend origins for credentialed session deployments and keep wildcard CORS out of trusted write-origin logic. |
| F016 | A05 | high | resolved | Password reset and deactivation session revocation could race with login/session creation, allowing a freshly created session from stale account state. | Fixed in `apps/api/internal/app/auth.go`; login now locks the user row with `SELECT ... FOR UPDATE` and creates the session in the same transaction, so account-control updates serialize with credential checks. `TestLoginWaitsForAccountControlLock` covers the regression. | Keep login/session creation serialized with account-control mutations that change password, role, or status. |
| F017 | A05 | high | resolved | Concurrent admin role/status updates could bypass the last-active-admin guard when two admins modified each other at the same time. | Fixed in `apps/api/internal/app/admin_users.go`; admin role/status updates take a transaction-scoped advisory lock before reading the target and counting active admins. `TestConcurrentAdminDeactivationKeepsActiveAdmin` covers the invariant. | Keep active-admin preservation checks serialized before future admin role/status mutations. |
| F018 | A05 | medium | resolved | Bootstrap admin setup could silently no-op with partial env vars or an existing non-admin/inactive account at the bootstrap email. | Fixed in `apps/api/internal/config/config.go` and `apps/api/internal/app/bootstrap.go`; config validation requires email/password as a valid pair and bootstrap now fails if the configured email already belongs to a non-active-admin account. Config tests plus `TestBootstrapRejectsExistingNonAdminAccount` cover the behavior. | Treat bootstrap admin configuration errors as startup problems instead of silently continuing without an active admin. |
| F019 | A05 | medium | resolved | `/admin/users` could keep showing stale account rows after the backend started returning `403` because the current user's admin role changed elsewhere. | Fixed in `apps/web/src/features/admin/pages/admin-users-page.tsx` and `apps/web/src/lib/axios.ts`; admin-list `403`s now render an admin forbidden state and invalidate `/auth/me` instead of showing placeholder data. | Keep role-loss states hidden from stale admin data and let the protected route guard reconcile current permissions. |
| F020 | A05 | medium | resolved | Admin account docs claimed broad backend lifecycle coverage that was not present, and the API lacked focused account-management regression tests. | Added `TestAdminCanManageAccounts`, `TestLoginWaitsForAccountControlLock`, `TestConcurrentAdminDeactivationKeepsActiveAdmin`, bootstrap/config validation tests, and updated `docs/features/admin-accounts.md`. | Keep account-control docs tied to actual test names and add browser form coverage when admin UI flows are automated. |
| F021 | A05 | low | resolved | Admin-set passwords with leading/trailing spaces were silently trimmed before hashing, while login verifies the raw password. | Fixed in `apps/api/internal/app/auth.go` and `apps/web/src/features/admin/pages/admin-users-page.tsx`; account create/reset now rejects leading/trailing password spaces with clear UI/API validation. | Keep password creation/reset validation consistent with login verification semantics. |
| F022 | A05 | medium | resolved | Role/status changes had no natural transition workflow for accounts tied to open teacher responsibilities or active student work. | Fixed in `apps/api/internal/app/admin_users.go` and `apps/web/src/features/admin/pages/admin-users-page.tsx`; `PATCH /admin/users/{id}` now returns structured transition impact, the UI prompts for a replacement teacher/admin or student cleanup confirmation, and backend applies account change plus reassignment/removal transactionally. `TestAdminRoleChangeRequiresTeacherResponsibilityReassignment` and `TestAdminStudentDeactivationRequiresCleanupConfirmation` cover the behavior. | Keep account transitions explicit in the UI and preserve historical submissions/reviews when active student links are removed. |
| F023 | A06 | high | resolved | Project-to-folder writes relied on pre-transaction folder usability and owner checks, so an active folder or owner/supervisor relationship could change before create/update/link committed. | Fixed in `apps/api/internal/app/projects.go` and `apps/api/internal/app/classes.go`; project create, project update, and folder link now validate the target folder under `SELECT ... FOR UPDATE` with `validateCourseSectionForProjectTx`. Focused lifecycle tests cover archived and cross-owner rejections. | Keep folder assignment checks inside the same mutation transaction as the link write. |
| F024 | A06 | high | resolved | Folder add-existing search filtered only the first 200 locally loaded standalone projects, which could hide valid matches in large workspaces and include stale archived candidates. | Fixed with `GET /projects` `search` and `excludeArchived` parameters in `apps/api/internal/app/projects.go`, API client support in `apps/web/src/features/projects/api.ts`, and server-backed candidate search in `apps/web/src/features/classes/pages/class-detail-page.tsx`. `TestUnassignedProjectSearchUsesBackendFilterAndExcludesArchivedCandidates` covers the backend behavior. | Keep candidate search server-side for large workspaces; local filtering should only polish already scoped results. |
| F025 | A06 | medium | resolved | Admin folder creation UI did not expose the backend `ownerTeacherId` option, making admin-created folders default to the admin account even when the folder was intended for a teacher. | Fixed in `apps/web/src/features/workspace/pages/workspace-page.tsx` and `apps/web/src/features/classes/api.ts`; admins now get an active teacher/admin owner selector in the new-folder dialog. | Keep admin create UI aligned with folder ownership rules; existing-folder owner transfer remains a future admin-management slice. |
| F026 | A06 | medium | resolved | Folder detail and folder mutations had UX/state drift risks: forbidden folder reads rendered as generic errors, and some mutations did not refresh all affected workspace/project/dashboard/candidate caches. | Fixed in `apps/web/src/features/classes/pages/class-detail-page.tsx` and `apps/web/src/features/workspace/pages/workspace-page.tsx`; folder `403`s render `ForbiddenState`, and folder edit/add/remove/status mutations invalidate affected class, project, dashboard, and candidate queries. | Keep folder aggregate invalidations broad enough for rollup counts and candidate lists. |
| F027 | A06 | low | resolved | Folder controls had minor accessibility/stale-affordance gaps around color selection, compact icon actions, and pending status mutation buttons. | Fixed in workspace and folder-detail pages with radiogroup color pickers, named folder-card actions, combobox/listbox semantics for candidate search, and disabled edit/archive actions while status mutations are pending. | Preserve explicit labels and disabled states as compact folder controls evolve. |
| F028 | A07 | high | resolved | Work Plan checkpoint reorder used two independent browser PATCH requests, so one success plus one failure could leave duplicate or incorrect sort orders. | Fixed with `PATCH /projects/{projectId}/milestones/reorder` in `apps/api/internal/app/milestones.go` and a single `reorderMilestones` client call from `apps/web/src/features/projects/pages/project-detail-page.tsx`. `TestMilestoneReorderRequiresCompleteProjectOrder` covers partial, duplicate, cross-project, and valid orders. | Keep checkpoint reorder atomic and require the complete ordered checkpoint ID list. |
| F029 | A07 | high | resolved | Sort-only milestone updates read current title/description/date before waiting on the project-row lifecycle lock, so a concurrent metadata edit could be overwritten by stale omitted fields. | Fixed in `apps/api/internal/app/milestones.go`; milestone updates now lock the project, then read the target milestone row with `FOR UPDATE` before applying partial fields. `TestMilestoneSortUpdatePreservesConcurrentMetadataChange` covers the race. | Read partial-update base rows inside the same transaction that serializes project-scoped writes. |
| F030 | A07 | medium | resolved | A resource-link load failure blocked the entire project Work Plan even though references are optional support data. | Fixed in `apps/web/src/features/projects/pages/project-detail-page.tsx`; tasks and milestones drive board loading, resource-link failure shows a retry warning, and resource controls wait for successful resource loading. | Keep optional side-rail data from hiding the assignment board. |
| F031 | A08 | high | resolved | Direct member add loaded target student role/status before the membership transaction, so a concurrent account deactivation/role change could be missed before insert. | Fixed in `apps/api/internal/app/projects.go`; add-member now locks and revalidates the target user row inside the same transaction as lifecycle re-check and membership insert. `TestAddProjectMemberRechecksStudentAccountAfterLock` covers the race. | Keep direct member add serialized with admin account-control mutations before membership insert. |
| F032 | A08 | medium | resolved | Member removal deleted membership before explicit task-assignee cleanup, letting FK cascade remove assignments first and causing cleanup-count audit metadata to report zero. | Fixed in `apps/api/internal/app/projects.go`; removal now deletes project task-assignee rows before membership deletion and records the actual `taskAssigneeLinksRemoved` count. `TestTeacherCanRemoveProjectMember` now checks the metadata. | Preserve cleanup count accuracy when changing member removal or assignment FK behavior. |
| F033 | A08 | low | resolved | Team popover controls could leave the add-student section open after success and allowed other row actions while a member mutation was pending. | Fixed in `apps/web/src/features/projects/pages/project-detail-page.tsx`; successful add closes the add panel and role/remove actions are disabled while any team mutation is pending. | Keep compact team controls explicit about pending mutation state. |
| F034 | A09 | high | resolved | Assignment creation and partial assignment updates used pre-transaction reads for milestone/current assignment state before waiting on the project lifecycle lock; partial updates could overwrite concurrent metadata changes after the lock released. | Fixed in `apps/api/internal/app/tasks.go` and `apps/api/internal/app/milestones.go`; create now rechecks milestone membership inside the locked write transaction and update reads the target assignment row with `FOR UPDATE` after the project lock. `TestAssignmentCreateRechecksMilestoneAfterLifecycleLock` and `TestAssignmentPartialUpdatePreservesConcurrentMetadataChange` cover the races. | Keep assignment create/update target validation and partial-update base rows inside the same transaction that serializes project-scoped writes. |
| F035 | A10 | high | resolved | Student submission authorization could go stale between the preflight assignment check and the insert transaction. | Fixed in `apps/api/internal/app/tasks.go`; submission writes now recheck task assignment, project membership, active student role/status, and project lifecycle inside the locked transaction. `TestStudentProgressRechecksAssignmentAfterLifecycleLock` covers concurrent unassignment. | Keep submitter eligibility checks inside the same transaction that locks project lifecycle and task state. |
| F036 | A10 | medium | resolved | Manager API updates could manually mark an assignment completed while a pending submission still needed review, stranding the pending review and blocking future submissions. | Fixed in `apps/api/internal/app/tasks.go`; assignment update rejects `done`/`completed` target state while pending review rows exist. `TestAssignmentCompletionRequiresPendingReviewResolution` covers the guard. | Require pending submissions to be reviewed before manual assignment completion. |
| F037 | A10 | medium | resolved | Review authorization was only checked before waiting on the project lifecycle lock, so a supervisor reassignment race could let a former supervisor save a review. | Fixed in `apps/api/internal/app/permissions.go` and `tasks.go`; review transactions recheck current active manager authority after locking the project. `TestProgressReviewRechecksManagerAfterLifecycleLock` covers the race. | Revalidate reviewer authority inside review write transactions. |
| F038 | A10 | medium | resolved | Assignment detail treated evidence/resource query failures as empty data, so reviewers could decide without knowing support data failed to load. | Fixed in `apps/web/src/features/tasks/pages/task-detail-page.tsx`; assignment detail shows support-data loading/error notices, retry controls, and disables review save until evidence/resource data is known. Playwright A10 evidence is in `/tmp/opencode/unitrack-a10-audit-20260620`. | Keep review decisions blocked while required support data is loading or errored. |
| F039 | A10 | medium | resolved | Returned/rejected review history used approved-style copy and emerald success styling. | Fixed in `apps/web/src/features/tasks/components/progress-timeline.tsx`; review notes now render status-specific labels and amber/red tones. Playwright verified `Returned for revision by ...` after the fix. | Keep submission timeline styling driven by `latestReview.reviewStatus`. |
| F040 | A10 | medium | resolved | Assignment edit could be opened with member/checkpoint data still loading or failed, risking assignee clearing from an empty local list. | Fixed in `apps/web/src/features/tasks/pages/task-detail-page.tsx`; edit controls are disabled until members and milestones load, and the dialog shows a guarded retry state if edit data fails. | Do not submit assignment edits backed by missing member/checkpoint option data. |
| F041 | A11 | high | resolved | Resource and evidence write authorization was mostly preflight-only, so membership/supervisor/account changes could race writes after project lifecycle locking. | Fixed in `apps/api/internal/app/permissions.go`, `resources.go`, and `files.go`; resource/evidence writes now recheck current project view/manager eligibility inside the locked transaction. `TestResourceCreateRechecksProjectAccessAfterLifecycleLock` and `TestEvidenceUploadRechecksProjectAccessAfterLifecycleLock` cover representative races. | Keep support-write authorization inside the same transaction that locks project lifecycle. |
| F042 | A11 | medium | resolved | Resource target validation and partial resource PATCH base rows were outside the write transaction, allowing orphan/stale writes and lost concurrent metadata changes. | Fixed in `apps/api/internal/app/resources.go`; create/update/delete validate targets under the project lock, update/delete lock the resource row, and PATCH checks affected rows. `TestResourcePartialUpdatePreservesConcurrentMetadataChange` covers stale partial updates. | Validate polymorphic targets and read partial-update base rows inside support-write transactions. |
| F043 | A11 | medium | resolved | Reviewed submission evidence/resource records could still be changed while the project was active/on-hold, weakening review auditability. | Fixed in `apps/api/internal/app/resources.go` and `files.go`; progress-update resources/evidence can only change while the submission is `pending_review`, while downloads remain readable. `TestReviewedSubmissionSupportRecordsAreImmutable` covers create/update/delete/upload/delete/download behavior. | Treat reviewed submission support records as immutable historical evidence. |
| F044 | A11 | medium | resolved | Submission-level resource links were display-only in the frontend even though the API supported them. | Fixed in `apps/web/src/features/tasks/pages/task-detail-page.tsx` and `progress-timeline.tsx`; pending submissions now expose resource management actions from review and history contexts. Playwright evidence is in `/tmp/opencode/unitrack-a11-audit-20260620`. | Keep UI resource affordances aligned with supported API targets. |
| F045 | A11 | medium | resolved | Resource/evidence stale lifecycle or permission failures did not refresh enough state, leaving rejected controls visible. | Fixed in `apps/web/src/features/resources/components/resource-link-drawer.tsx` and `apps/web/src/features/files/components/evidence-file-panel.tsx`; `403/409` support mutations now invalidate project/resource/file/workflow queries. | Refresh support and workflow queries after stale support mutations fail. |
| F046 | A11 | medium | resolved | Evidence and resource controls had weak accessible names, and file chooser validation happened only after upload. | Fixed in `resource-link-drawer.tsx` and `evidence-file-panel.tsx`; resource/file actions now include target/file-specific labels, the file chooser has visible focus styling, and files over 10 MB are rejected client-side. | Preserve specific accessible names for repeated support controls. |
| F047 | A11 | medium | resolved | Reviewed evidence rows still showed upload/delete/resource actions in the browser after backend immutability was added. | Fixed in `apps/web/src/features/tasks/components/progress-timeline.tsx`; evidence upload/delete and submission-resource management are shown only for pending-review submissions. Playwright confirmed reviewed rows keep download only. | Gate submission support affordances on pending-review state as well as project lifecycle. |
| F048 | A12 | medium | resolved | Teacher/admin project follow-ups were limited before pending-review projects and non-follow-up rows were removed in the frontend, so many review-heavy projects could starve stale/missing-progress follow-ups. | Fixed in `apps/api/internal/app/dashboard.go`; teacher/admin dashboard project payloads now filter active no-pending-review follow-up candidates in SQL before `LIMIT`. `TestTeacherDashboardProjectFollowUpsAreNotStarvedByPendingReviews` covers the regression. | Keep dashboard project follow-up filtering in the backend query before list caps are applied. |
| F049 | A12 | medium | resolved | Admin dashboard rendered global backend stats with teacher-oriented title/copy and omitted `teacherCount`/`studentCount` from the compact summary. | Fixed in `apps/web/src/features/dashboard/pages/dashboard-page.tsx`; admin now sees `Global review queue` copy and teacher/student count chips, and teachers see their supervised student count. Playwright A12 evidence is in `/tmp/opencode/unitrack-a12-audit-20260620/`. | Keep dashboard summary labels aligned with role-scoped stats returned by the API. |
| F050 | A12 | low | resolved | Dashboard role branches had no committed browser regression, leaving role-specific queues and admin counts covered only by ad hoc evidence. | Added `apps/web/e2e/dashboard.spec.ts`, which provisions API fixtures and verifies admin counts, teacher review/overdue queues, and student revision/overdue queues. | Preserve API-created Playwright fixtures for dashboard role coverage and expand empty/error states later. |
| F051 | A13 | medium | resolved | Historical `tasks.parent_task_id` used only the single-column parent FK, so direct DB writes could attach a child task to a parent from another project. | Fixed in `apps/api/db/migrations/20260620000100_folder_and_task_integrity.sql` with `tasks_project_parent_task_fk`. `TestDatabaseRejectsCrossProjectChildTasks` covers direct invalid inserts while allowing same-project historical child rows. | Keep retained historical schema columns project-aware even when the active product surface is removed. |
| F052 | A13 | high | resolved | Folder owner/project supervisor matching was enforced by handlers but not by the database, so direct links or later supervisor/owner updates could leave folders containing projects supervised by another account. | Fixed in `20260620000100_folder_and_task_integrity.sql` with deferred constraint triggers across `course_section_projects`, `projects.supervisor_id`, and `course_sections.owner_teacher_id`. `TestDatabaseRejectsMismatchedFolderProjectLinks` covers direct drift, and `TestAdminRoleChangeRequiresTeacherResponsibilityReassignment` covers legitimate multi-row reassignment. | Keep folder/project ownership invariants enforced at commit, not just at the UI/API boundary. |
| F053 | A13 | low | resolved | Folder owner/supervisor filtering had no committed browser evidence, so admin add-existing candidate regressions could expose cross-owner projects despite backend/database checks. | Added `apps/web/e2e/database-integrity.spec.ts`; A13 Playwright evidence in `/tmp/opencode/unitrack-a13-audit-20260620/` shows the matching candidate visible, mismatched candidate hidden, and cross-owner API link rejected with `400`. | Keep browser fixtures focused on API-created data for relationship-sensitive UI filters. |
| F054 | A14 | medium | resolved | Shared JSON decoding accepted the first JSON value and ignored trailing JSON values, so a request like a valid login body followed by another object could still create a session. | Fixed in `apps/api/internal/app/response.go`; `decodeJSON` now requires exactly one JSON value. `TestJSONDecoderRejectsTrailingValues` verifies trailing login JSON returns `400` and creates no session. | Keep new JSON handlers on `decodeJSON` and preserve single-value request-body enforcement. |
| F055 | A14 | medium | resolved | Several protected route IDs reached UUID-column database queries before explicit validation, causing malformed task/milestone/progress IDs to produce `500`s, database error text, or misleading `404`s. | Fixed in `apps/api/internal/app/tasks.go`, `milestones.go`, and `files.go` with `requireValidUUIDParam`; `TestProtectedRoutesRejectMalformedUUIDParams` covers malformed task, milestone, review, and evidence-upload IDs. | Validate future route IDs before SQL unless an existing permission/relationship helper converts malformed UUIDs into stable `400`s. |
| F056 | A15 | medium | resolved | Admin account create/update only refreshed admin account rows, leaving dashboards, workspace projects, folders, and assignment/member affordances stale after role/status transitions and cleanup. | Added `invalidateAdminAccountImpactData` in `apps/web/src/lib/query-invalidation.ts`; admin create/update now invalidate admin, dashboard, project, and folder query families. | Treat account mutations as cross-feature events because role/status changes can reassign or remove active work. |
| F057 | A15 | medium | resolved | The guided replacement-supervisor selector could depend on the currently searched/capped admin table page, so valid active teacher/admin replacements might be missing. | `apps/web/src/features/admin/pages/admin-users-page.tsx` now loads replacement candidates with a dedicated active teacher/admin query via `getReplacementSupervisorOptions`. | Do not derive transition support choices from filtered presentation tables. |
| F058 | A15 | medium | resolved | Folder add-existing search used placeholder candidate data while deferred search refetched, so a previous standalone project could remain clickable after the search text changed. | `apps/web/src/features/classes/pages/class-detail-page.tsx` now hides stale placeholder candidates and client-filters visible options by the current search; `apps/web/e2e/state-flow.spec.ts` covers stale candidate hiding. | Keep deferred search UIs from exposing actions for data that no longer matches the visible input. |
| F059 | A15 | low | resolved | Workspace folder edit omitted cleared descriptions, so saved folder notes could not be removed from the UI. | `cleanClassValues` in `apps/web/src/features/workspace/pages/workspace-page.tsx` now sends `description: ''`; `folder edit can clear description` covers the browser regression. | Preserve explicit empty-string clears for optional editable fields. |
| F060 | A15 | medium | resolved | Resource-link form drafts could be reused across add/edit/target context changes, risking a stale title/URL being submitted to the wrong resource target. | `apps/web/src/features/resources/components/resource-link-drawer.tsx` now keys create/edit `ResourceLinkForm` instances by target/resource context, with page-level dialog keys for project and assignment resource dialogs. | Remount local-state forms when the target entity changes, especially cross-target support dialogs. |
| F061 | A15 | medium | resolved | Several stale `403`/`409` permission or lifecycle failures only showed a toast and left stale project/folder/workflow controls visible. | Added shared `refreshWorkspaceDataOnStaleError`, `refreshClassDataOnStaleError`, and `refreshProjectDataOnStaleError` helpers, then wired them into folder, workspace, project, team, assignment, and resource mutations. | On stale forbidden/conflict mutation errors, refresh the affected query family so rejected affordances disappear. |
| F062 | A15 | low | resolved | Transient non-401 `/auth/me` refetch failures could clear the auth store and create stale role/self guard flicker. | `useCurrentUser()` now clears the auth store only when `isUnauthorizedError` confirms a `401`; other transient errors leave the last known user in place. | Keep auth-store clearing tied to confirmed unauthorized responses, while the route/query still surfaces load errors. |
| F063 | A16 | medium | resolved | Protected app pages had no keyboard skip link, so keyboard users had to tab through navigation before reaching page work content. | Added `Skip to main content` in `AppLayout`, focused `#main-content` on activation, and covered it in `apps/web/e2e/accessibility.spec.ts`. | Keep protected shells keyboard-navigable with a first-tab skip link to the main landmark. |
| F064 | A16 | low | resolved | The shared dialog backdrop was implemented as a named `Close dialog` button outside the dialog panel, creating a duplicate close control in the accessibility tree. | Changed the backdrop to a non-semantic `aria-hidden` overlay while preserving Escape, close-button, and backdrop click behavior; `accessibility.spec.ts` verifies one named close button and modal focus containment. | Keep modal backdrops out of the accessibility tree; expose one explicit close button inside the dialog. |
| F065 | A16 | medium | resolved | The folder color picker used ARIA radio roles but lacked radio-keyboard behavior and exposed every color as a tab stop. | Added roving focus plus Arrow/Home/End behavior in `workspace-page.tsx`; `accessibility.spec.ts` verifies ArrowRight moves from blue to teal and updates `aria-checked`. | Custom radio groups must implement expected keyboard behavior or use native radios. |
| F066 | A16 | medium | resolved | Assignment review decisions used custom `role=radio` buttons without native radio keyboard semantics. | Converted review decisions in `task-forms.tsx` to native radio inputs styled as cards, preserving the existing visual treatment while relying on browser radio behavior. | Prefer native form controls for decision groups unless custom ARIA behavior is fully implemented. |
| F067 | A17 | medium | resolved | Admin account create/search success flow had no browser regression, leaving account form wiring covered only by backend lifecycle tests and manual UI checks. | Added `apps/web/e2e/admin-accounts.spec.ts`; it creates a teacher through `/admin/users`, searches for the new account, and verifies the teacher can sign in. | Keep admin account UI coverage on accessible labels and API-created/unique data rather than demo row assumptions. |
| F068 | A17 | low | resolved | Browser QA commands were available only through the web package path, while root scripts and Make targets exposed build/lint but not the e2e suite. | Added root `test:e2e:web`, `test:e2e:web:headed`, `test:e2e:web:report` scripts and `web-test-e2e`, `web-test-e2e-headed`, `web-test-e2e-report` Make targets. | Keep root QA entry points aligned with documented web package commands. |
| F069 | A17 | low | resolved | Playwright's web-server command was hardcoded to the default Vite port, so isolated runs against a fresh API port could accidentally reuse an existing frontend bundle pointed at the old API. | Added `PLAYWRIGHT_WEB_SERVER_COMMAND` support in `apps/web/playwright.config.ts`; docs now show how to align `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_WEB_SERVER_COMMAND`, `VITE_API_URL`, and API `CORS_ALLOWED_ORIGINS`. | Keep isolated browser-test commands explicit about both frontend origin and API origin. |
| F070 | A18 | high | resolved | Production API startup could accept missing `DATABASE_URL`, insecure session cookies, HTTP CORS origins, or malformed CORS origins, leaving deployment failures or unsafe cookie-auth settings to surface only at runtime. | `apps/api/internal/config/config.go` now rejects missing production `DATABASE_URL`, production `SESSION_SECURE=false`, wildcard/malformed CORS origins, and production non-HTTPS CORS origins. `apps/api/internal/config/config_test.go` covers the new validation cases. | Keep production deployment guardrails in startup validation, not just docs. |
| F071 | A18 | low | resolved | Deployment docs did not explicitly distinguish `/health` liveness from `/ready` database readiness, and the API env example omitted `UPLOAD_STORAGE_DIR` despite evidence-file deployment caveats depending on it. | Updated `docs/deployment.md` with health/readiness guidance and launch checklist entries; added `UPLOAD_STORAGE_DIR=var/uploads` to `apps/api/.env.example`. | Keep operations docs aligned with runtime endpoints and storage settings. |
| F072 | A19 | low | resolved | The A17 audit inventory still said `apps/api/internal/config/config_test.go` had 6 config validation tests after A18 added production config guard coverage. | Current `apps/api/internal/config/config_test.go` contains 11 `Test...` functions; updated the A17 inventory row. | Keep audit evidence inventories current after later slices add tests. |
| F073 | A19 | low | resolved | Current documentation still said admin account success-flow browser automation was missing after `admin-accounts.spec.ts` was added. | Updated A05/A15 residual-risk wording and `docs/features/frontend-state.md` to say create/search/sign-in is covered while edit/password/conflict flows remain gaps. | Keep coverage gaps specific so newly covered paths are not listed as missing. |
| F074 | A19 | low | resolved | Auth documentation used `wildcard trusted origins` wording that implied wildcard CORS could be a trusted-origin mode. | Updated `docs/project.md` and `docs/features/auth-session.md` to state wildcard CORS origins are not trusted or are rejected by config validation. | Describe wildcard-origin behavior as rejected/untrusted, not as a trusted origin type. |

## Completed Audit Passes

### A01 Product scope and business workflow

Status: clean

Date: 2026-06-20

Overall score: 86/100

Scope included `docs/project.md`, feature docs, rendered role flows for admin/teacher/student, and source checks across dashboard, workspace/folders, project detail, assignment detail, permissions, lifecycle, files, resources, classes, and admin account surfaces.

Evidence artifacts:

| Evidence | Location |
| --- | --- |
| Role/route screenshots | `/tmp/opencode/unitrack-a01-scope-audit-20260620/` |
| Role route summary | `/tmp/opencode/unitrack-a01-scope-audit-20260620/role-route-summary.json` |
| Scope baseline | `docs/project.md`, `docs/features/*.md` |
| Source baseline | `apps/api/internal/app/*.go`, `apps/web/src/features/*` |

Scorecard:

| Criterion | Score | Notes |
| --- | --- | --- |
| Core workflow | 4.5/5 | Teacher -> project -> assignment -> submission -> review is coherent in docs, API handlers, and rendered routes. |
| Role clarity | 4/5 | Teacher/student roles are clear; admin still shares teacher-oriented dashboard copy and broader admin surfaces remain documented as partial. |
| Scope discipline | 4/5 | Removed modules stay out of active routes; historical schema/API names remain but mostly do not leak into UI. |
| Lifecycle fit | 4/5 | Project status gates are now consistent for the A01 scope, including read-preserving evidence downloads and lifecycle-gated deletes. |
| Navigation model | 4.5/5 | `Workspace` is the main project surface and rendered route flows align across roles. |
| Feature boundaries | 4/5 | Folders, assignments, resources, and evidence mostly support the project-first workflow without becoming separate modules. |
| Docs accuracy | 4/5 | Main docs match the product model and the A01 behavior/docs mismatches were corrected. |
| Regression coverage | 3.5/5 | Backend lifecycle coverage now covers closed-project evidence behavior; frontend route/link coverage is still sparse. |

Workflow matrix:

| Role | First protected surface | Main work path | A01 result |
| --- | --- | --- | --- |
| Admin | Global review queue | Dashboard review/overdue queues, workspace, account management | Coherent enough for current partial admin scope; admin-specific dashboard and all-project management remain future slices. |
| Teacher | Review queue | Workspace -> folder/project -> Work Plan -> assignment -> review desk | Strong core supervision workflow after aligning dashboard review links with the review desk. |
| Student | Do next | Dashboard/workspace -> project -> assignment workbench -> submission history | Clear project/assignment flow with active-work affordances hidden on read-only states. |

Residual risks:

| Risk | Impact |
| --- | --- |
| Admin product surface is intentionally partial. | Future admin-dashboard, all-project management, and activity-log work should keep the product model project-first instead of creating a parallel admin product. |
| Historical `class`/`course` naming remains in API routes, DTO fields, tests, and seed data. | Low product-copy drift can reappear unless future folder work treats `classId` as compatibility vocabulary only. |

Recommended next audit: A02 Roles, permissions, and access control, because A01 found lifecycle/authorization edge cases around evidence files that should be reviewed in the broader permission matrix.

### A02 Roles, permissions, and access control

Status: clean

Date: 2026-06-20

Overall score: 92/100

Scope included protected route registration, frontend route guards, client permission helpers, project/folder relationship checks, admin-only account handlers, project member guards, milestones, assignments, submissions, reviews, resources, evidence files, dashboard scoping, backend lifecycle tests, Playwright e2e tests, and rendered role-route evidence from the A01 pass.

Evidence artifacts:

| Evidence | Location |
| --- | --- |
| Source reads | `apps/api/internal/app/permissions.go`, `server.go`, `auth.go`, `admin_users.go`, `classes.go`, `projects.go`, `tasks.go`, `milestones.go`, `resources.go`, `files.go`, `dashboard.go`, `apps/web/src/app/router.tsx`, `apps/web/src/lib/permissions.ts`, task/evidence components |
| Rendered role evidence | `/tmp/opencode/unitrack-a01-scope-audit-20260620/role-route-summary.json` |
| Backend tests | `make api-test` passed |
| Frontend access tests | `LD_LIBRARY_PATH=/tmp/opencode/playwright-libs/usr/lib/x86_64-linux-gnu pnpm --filter @unitrack/web test:e2e` passed, 6 tests |

Scorecard:

| Criterion | Score | Notes |
| --- | --- | --- |
| Protected API boundary | 5/5 | All application API routes beyond health/ready/login are inside `requireAuth`; inactive users are filtered during session lookup. |
| Project relationship model | 4.5/5 | `canViewProject` and `canManageProject` consistently enforce admin existing-project access, teacher supervision, and student membership. |
| Feature-specific checks | 4/5 | Assignments, submissions, reviews, folders, resources, and files add appropriate role/owner/assignment checks; no direct cross-project leak found. |
| Frontend route guards | 4/5 | Protected, admin-only, and teacher/admin folder guards are present and rendered evidence shows admin-page denial for teacher/student users. |
| Client affordance alignment | 4/5 | Evidence owner-delete visibility now follows lifecycle support-change gates; remaining risk is future handler/UI drift. |
| Regression coverage | 4/5 | Backend lifecycle tests cover the main matrix and Playwright now covers focused frontend route guards, hidden actions, inactive login blocking, non-member denial, and closed-project evidence affordances. |
| Admin override auditability | 3.5/5 | Admin permissions are intentionally broad and constrained to existing entities, but broader project override audit UI/logging remains partial. |

Permission matrix result:

| Area | A02 result |
| --- | --- |
| Signed-out API access | Protected endpoints return `401`; backend test coverage exists for dashboard. |
| Admin account routes | Source consistently uses `requireAdmin`; frontend route guard renders forbidden states for non-admin users; frontend route tests are missing. |
| Project list/view/manage | Role and relationship scoping are consistent in source and backend tests. |
| Project members | Viewer list is relationship-scoped; add/update/remove are manager-only with lifecycle gates and cleanup. |
| Folders | Students are blocked; teachers are owner-scoped; admins can manage existing folders; project movement validates both project manager and folder ownership. |
| Assignments/submissions/reviews | View is project-scoped; assignment writes and reviews are manager-only; submissions require student role, project membership, active lifecycle, and assignment membership. |
| Resources | Project viewers can create resources by design; update/delete are owner or manager with lifecycle gates. |
| Evidence files | Project viewers can list/download; upload is submitter or manager on active projects; delete is uploader or manager on active/on-hold projects; frontend upload/delete affordances now match those lifecycle gates. |
| Dashboard | Backend queries are role-scoped; targeted cross-user dashboard negative tests are still light. |

Residual risks:

| Risk | Impact |
| --- | --- |
| Lifecycle status gates are per-handler. | A03 moved existing project-scoped writes to transaction-scoped project-row locks; new handlers still need to call the locked helper deliberately. |
| Per-handler guard style requires discipline. | New protected handlers can accidentally omit `canViewProject`, `canManageProject`, owner checks, or lifecycle gates without stronger middleware/test patterns. |
| Frontend guards are UX only. | Backend remains authoritative; the new access-control browser spec reduces stale-action regressions but does not replace backend checks. |

Recommended next audit after A02 was A03 Project lifecycle logic; A03 is now complete, so the current recommended next audit is A13 Database schema and integrity.

### A03 Project lifecycle logic

Status: clean

Date: 2026-06-20

Overall score: 91/100

Scope included lifecycle status semantics, project update/status transitions, project-scoped mutation handlers, evidence/resource writes, folder movement, frontend lifecycle helpers, project/folder affordances, lifecycle tests, and relevant feature documentation.

Evidence artifacts:

| Evidence | Location |
| --- | --- |
| Source reads | `apps/api/internal/app/projects.go`, `tasks.go`, `milestones.go`, `resources.go`, `files.go`, `classes.go`, `apps/web/src/lib/permissions.ts`, project/folder pages |
| Backend tests | `make api-test` passed in the current environment; focused `TEST_DATABASE_URL='postgres://postgres:postgres@localhost:55432/unitrack?sslmode=disable' go test ./apps/api/internal/app -run 'TestLifecycleLock' -count=1` passed |
| Documentation baseline | `docs/project.md`, `docs/features/projects.md`, `official-tasks.md`, `resources-evidence.md`, `workspace-project-folders.md`, `team-members.md`, `protected-access.md` |

Scorecard:

| Criterion | Score | Notes |
| --- | --- | --- |
| Status-rule clarity | 4.5/5 | Active/on-hold/completed/archived semantics are documented and implemented consistently across core workflows. |
| Backend status gates | 4.5/5 | Existing project-scoped writes now re-check lifecycle under a project row lock inside their mutation transaction. |
| Status transition safety | 4.5/5 | Project status updates lock the same row before archived/status-only decisions, serializing transitions with writes. |
| Frontend affordance alignment | 4/5 | Archived review CTAs and archived folder-unlink actions were removed; broader frontend component coverage remains partial. |
| Regression coverage | 4/5 | Sequential lifecycle tests remain and focused concurrent status-flip tests cover representative assignment and metadata races. |
| File/storage lifecycle fit | 3.5/5 | File metadata mutations are status-locked; physical local-file deletion remains best-effort after metadata commit and belongs with file-storage hardening. |

Lifecycle matrix result:

| Area | A03 result |
| --- | --- |
| Project metadata/status/folder update | Locked transaction reads current project status before applying archived/status-only rules and metadata changes. |
| Team/member writes | Active/on-hold gates are checked before and inside member mutation transactions. |
| Milestones and assignments | Plan writes use active/on-hold or active-only gates under project-row locks. |
| Student submissions and reviews | Submission and review transactions lock project lifecycle before writing progress/review rows. |
| Resources and evidence | Resource writes and evidence metadata upload/delete now lock project lifecycle; evidence downloads remain read-only and available for readable closed projects. |
| Folder movement | Project movement into folders and project unlink via update serialize with project status changes. |
| Frontend project/folder affordances | Archived projects no longer show review next actions or remove-from-folder buttons. |

Residual risks:

| Risk | Impact |
| --- | --- |
| Lifecycle locking is still a per-handler convention. | Future write handlers can regress if they use only preflight checks and skip the transaction-scoped helper. |
| Local file storage is not transactionally atomic with database metadata. | Metadata is lifecycle-locked, but physical file cleanup can still need production-grade storage, repair, and retention policy work. |
| Project creation can still initialize non-active statuses. | This remains existing behavior; changing it would be a product decision rather than a lifecycle race fix. |

Recommended next audit: A13 Database schema and integrity, because lifecycle races are now reduced and schema-level constraints are the next critical data-safety layer.

### A04 Auth and session security

Status: clean

Date: 2026-06-20

Overall score: 91/100

Scope included auth/session handlers, route registration, security middleware, cookie and CORS configuration, config validation, frontend auth API behavior, auth/session documentation, and backend lifecycle tests.

Evidence artifacts:

| Evidence | Location |
| --- | --- |
| Source reads | `apps/api/internal/app/auth.go`, `apps/api/internal/app/security.go`, `apps/api/internal/app/server.go`, `apps/api/internal/config/config.go`, `apps/web/src/lib/axios.ts`, `apps/web/src/features/auth/*` |
| Documentation baseline | `docs/features/auth-session.md`, `docs/project.md` |
| Focused backend regression tests | `TEST_DATABASE_URL='postgres://postgres:postgres@localhost:55432/unitrack?sslmode=disable' go test ./apps/api/internal/app ./apps/api/internal/config -run 'Test(AuthSessionLifecycle\|LogoutClearsCookieForAlreadyRevokedSession\|SessionCookieFlagsFollowConfig\|InvalidLoginResponsesDoNotRevealAccountExistence\|InactiveUserCannotLogin\|OriginGuardRejectsUnsafeUntrustedOrigin\|OriginGuardRejectsMissingOriginOnSessionUnsafeRequest\|OriginGuardDoesNotTrustWildcardOrigins\|AdminPasswordResetRevokesExistingSessions\|ProtectedRoutesRequireAuthentication\|Validate)' -count=1` passed |
| Full verification | `make api-test`, `pnpm --filter @unitrack/web lint`, `pnpm --filter @unitrack/web build`, and `LD_LIBRARY_PATH=/tmp/opencode/playwright-libs/usr/lib/x86_64-linux-gnu pnpm --filter @unitrack/web test:e2e` passed; web build still emits the known large-chunk warning. |

Scorecard:

| Criterion | Score | Notes |
| --- | --- | --- |
| Password verification | 4.5/5 | bcrypt is used and missing-account attempts run a dummy bcrypt comparison before returning generic invalid credentials. |
| Session token handling | 4.5/5 | Random 32-byte tokens are stored only as SHA-256 hashes server-side and exposed only through `HttpOnly` cookies. |
| Active account/session revocation | 4.5/5 | Inactive users cannot log in or continue with an existing session; logout and admin password/status changes revoke sessions. |
| Cookie/CORS configuration | 4.5/5 | `Secure` and `SameSite` are environment-controlled, logout uses the same cookie flags as login, and startup rejects unsafe `SameSite=None`/`Secure=false` plus wildcard CORS combinations. |
| Origin/CSRF posture | 4.25/5 | A04 fixed missing-origin session-cookie writes and wildcard-origin trust; no synchronizer-token or double-submit CSRF token exists yet. |
| Abuse controls | 3.5/5 | Login rate limiting exists but is process-local and not distributed across API instances. |
| Regression coverage | 4.25/5 | Focused backend coverage now includes invalid login parity, inactive login blocking, idempotent logout, cookie flags, untrusted origin blocking, missing-origin session-cookie write blocking, wildcard-origin hardening, and config validation; broader frontend redirect/cache tests remain partial. |

Findings resolved in this pass:

| Finding | Result |
| --- | --- |
| F007 missing-origin session-cookie unsafe requests | Resolved by rejecting unsafe requests with the session cookie when neither `Origin` nor parseable `Referer` is present. |
| F013 stale-session logout could not clear cookies | Resolved by moving logout outside `requireAuth`, keeping the origin guard, revoking the presented token when present, and always expiring the session cookie. |
| F014 logout cookie flags could diverge from login cookie flags | Resolved by using the configured `SESSION_SAME_SITE` mode when clearing the cookie. |
| F015 wildcard CORS origin could be trusted for unsafe writes | Resolved by making wildcard origins untrusted in the origin guard and rejecting wildcard CORS configuration at startup. |

Residual risks:

| Risk | Impact |
| --- | --- |
| No synchronizer-token or double-submit CSRF token exists. | Origin checks are a practical current control, but a token-based CSRF design would be stronger before production exposure with broad cookie compatibility requirements. |
| Login rate limits are in-memory per API process. | Multi-instance deployments can dilute brute-force controls unless moved to Redis, database-backed counters, or gateway-level limits. |
| Production cookie behavior depends on exact deployment env values. | Startup rejects known-unsafe cookie/CORS combinations, but separate HTTPS frontend/API hosts still need the exact frontend origin in `CORS_ALLOWED_ORIGINS` and a matching frontend `VITE_API_URL`. |

Recommended next audit: A13 Database schema and integrity, because A03 has now addressed transaction-level lifecycle race hardening for existing project-scoped writes.

### A05 Admin account management

Status: clean

Date: 2026-06-20

Overall score: 90/100

Scope included admin account handlers, bootstrap admin setup, login/session interaction with account-control mutations, admin route guards, admin account UI, audit-log writes, account documentation, and lifecycle tests.

Evidence artifacts:

| Evidence | Location |
| --- | --- |
| Source reads | `apps/api/internal/app/admin_users.go`, `auth.go`, `bootstrap.go`, `server.go`, `apps/api/internal/config/config.go`, `apps/web/src/features/admin/pages/admin-users-page.tsx`, `apps/web/src/app/router.tsx`, `apps/web/src/lib/axios.ts` |
| Documentation baseline | `docs/features/admin-accounts.md`, `docs/project.md` |
| Focused backend regression tests | `TEST_DATABASE_URL='postgres://postgres:postgres@localhost:55432/unitrack?sslmode=disable' go test ./apps/api/internal/app ./apps/api/internal/config -run 'Test(AdminCanManageAccounts\|AdminPasswordResetRevokesExistingSessions\|LoginWaitsForAccountControlLock\|ConcurrentAdminDeactivationKeepsActiveAdmin\|AdminRoleChangeRequiresTeacherResponsibilityReassignment\|AdminStudentDeactivationRequiresCleanupConfirmation\|BootstrapRejectsExistingNonAdminAccount\|Validate\|AuthSessionLifecycle\|InactiveUserCannotLogin)' -count=1` passed |
| Full verification | `TEST_DATABASE_URL='postgres://postgres:postgres@localhost:55432/unitrack?sslmode=disable' make api-test`, `pnpm --filter @unitrack/web lint`, `pnpm --filter @unitrack/web build`, and `LD_LIBRARY_PATH=/tmp/opencode/playwright-libs/usr/lib/x86_64-linux-gnu pnpm --filter @unitrack/web test:e2e` passed; web build still emits the known large-chunk warning. |

Scorecard:

| Criterion | Score | Notes |
| --- | --- | --- |
| Admin route/API boundary | 4.75/5 | Admin endpoints sit behind `requireAuth` and `requireAdmin`; non-admin denial is covered by backend and browser access-control tests. |
| Account validation | 4.25/5 | Role/status/email/password validation exists; password create/reset now rejects leading/trailing whitespace instead of silently trimming. |
| Session/account-control safety | 4.5/5 | Login now serializes with password reset/deactivation through user-row locks, closing stale-session creation races. |
| Active-admin preservation | 4.5/5 | Self-demotion/deactivation remains blocked and last-active-admin checks are serialized with a transaction advisory lock. |
| Bootstrap safety | 4/5 | Partial/invalid bootstrap config now fails validation and existing non-active-admin bootstrap emails fail clearly. |
| Account transition workflow | 4.25/5 | Teacher/admin role/status changes require replacement for open projects/active folders, while student transitions require active-work cleanup confirmation and preserve historical submissions. |
| Auditability | 3.75/5 | Account create/update/password writes are transactional and now include target email and transition metadata for update/password actions; no activity-log UI yet. |
| Frontend UX alignment | 4.25/5 | Admin-list `403` hides stale rows, self role/status changes are locked in the form, self password reset warns and signs out, and impacted role/status changes show a guided transition panel. |
| Regression coverage | 4.25/5 | Backend account-management and transition coverage is now explicit; admin create/search/sign-in Playwright coverage now exists, while edit/password/conflict flows remain partial. |

Findings resolved in this pass:

| Finding | Result |
| --- | --- |
| F016 account-control/login session race | Resolved by locking the user row during login and inserting the session in the same transaction. |
| F017 concurrent last-admin guard race | Resolved by serializing admin role/status updates with a transaction-scoped advisory lock. |
| F018 bootstrap admin silent failure modes | Resolved with config validation and explicit failure for existing non-active-admin bootstrap email. |
| F019 stale admin list after role loss | Resolved by rendering forbidden on admin-list `403` and invalidating current-user state. |
| F020 admin docs/test mismatch | Resolved with focused backend tests and documentation updates. |
| F021 admin password whitespace mismatch | Resolved by rejecting leading/trailing password spaces on backend and frontend. |
| F022 missing natural account transition workflow | Resolved with structured transition impact, replacement-supervisor selection, student active-work cleanup confirmation, and transactional backend application. |

Residual risks:

| Risk | Impact |
| --- | --- |
| Activity-log UI is still missing. | Audit rows exist, but admins cannot yet review account-control history in the product. |
| Admin form browser coverage is still light. | Playwright covers non-admin route denial and create/search/sign-in, but not edit/password transition flows or conflict rendering. |

Recommended next audit: A13 Database schema and integrity, because A03/A05 now addressed transaction boundaries for project lifecycle and account-control mutations while broader schema constraints remain the next data-safety layer.

### A06 Workspace and project organization

Status: clean

Date: 2026-06-20

Overall score: 90/100

Scope included workspace/folder pages, folder detail movement controls, project list/search APIs, folder assignment handlers, project create/update folder assignment, admin folder ownership behavior, cache invalidation, accessibility affordances, folder onboarding docs, and lifecycle tests.

Evidence artifacts:

| Evidence | Location |
| --- | --- |
| Source reads | `apps/api/internal/app/classes.go`, `projects.go`, `permissions.go`, `apps/web/src/features/workspace/pages/workspace-page.tsx`, `apps/web/src/features/classes/pages/class-detail-page.tsx`, `apps/web/src/features/projects/api.ts`, `apps/web/src/lib/query-keys.ts` |
| Documentation baseline | `docs/features/workspace-project-folders.md`, `docs/project.md` |
| Focused backend regression tests | `TEST_DATABASE_URL='postgres://postgres:postgres@localhost:55432/unitrack?sslmode=disable' go test ./apps/api/internal/app -run 'Test(ProjectCreationAllowsOptionalClass|UnassignedProjectSearchUsesBackendFilterAndExcludesArchivedCandidates|ProjectUpdateCanChangeClass|CourseSectionRoutesEnforceTeacherOwnership)' -count=1` passed |
| Frontend verification | `pnpm --filter @unitrack/web lint` and `pnpm --filter @unitrack/web build` passed; web build still emits the known large-chunk warning. |

Scorecard:

| Criterion | Score | Notes |
| --- | --- | --- |
| Workspace navigation model | 4.5/5 | `Workspace` remains project-first; teachers/admins get folder organization while students see project cards only. |
| Folder/project relationship enforcement | 4.5/5 | API writes now revalidate active folder access and owner/supervisor alignment under transaction row locks. |
| Candidate search scalability | 4.25/5 | Folder add-existing search uses server-side search and archived exclusion instead of local filtering over the first 200 projects. |
| Admin ownership alignment | 4/5 | Admins can choose active teacher/admin owners when creating folders; owner transfer for existing folders remains future admin-management scope. |
| Frontend state and affordances | 4.25/5 | Forbidden states, cache invalidation, lifecycle-aware unlink controls, named compact actions, and candidate combobox semantics are aligned. |
| Regression coverage | 4/5 | Backend folder create/update/link/search coverage is focused; frontend folder shelf/detail browser tests are still sparse. |

Findings resolved in this pass:

| Finding | Result |
| --- | --- |
| F023 folder assignment TOCTOU checks | Resolved by locking and validating the target folder inside create/update/link transactions. |
| F024 local first-200 add-existing search | Resolved with backend `search` and `excludeArchived` query parameters and server-backed candidate search UI. |
| F025 admin folder owner mismatch | Resolved by adding an admin-only folder owner selector to the new-folder dialog. |
| F026 forbidden/cache state drift | Resolved with folder forbidden states and broader query invalidations for folder mutations. |
| F027 compact-control accessibility gaps | Resolved with named actions, disabled pending controls, color radiogroups, and candidate combobox/listbox semantics. |

Residual risks:

| Risk | Impact |
| --- | --- |
| Folder ownership and project-supervisor matching is enforced in API code rather than a database constraint. | Direct database writes can still create drift; address in a future schema/integrity slice if folder reassignment or bulk imports are added. |
| Existing folder owner transfer is not exposed. | Admins can choose owners during create, but moving an existing folder to another owner remains future admin-management scope. |
| Frontend workspace/folder browser coverage is still light. | Playwright/component tests should cover shelves, candidate search, folder create/edit, owner selection, and cache refresh behavior later. |

Recommended next audit: A13 Database schema and integrity, because A06 reduced API-level folder drift and the remaining strongest risk is schema-level enforcement for cross-table invariants.

### A07 Project detail and Work Plan

Status: clean

Date: 2026-06-20

Overall score: 91/100

Scope included project detail loading, mission-control and Work Plan behavior, checkpoint create/edit/reorder/delete flows, milestone/task APIs, partial update transaction boundaries, resource-link dependency behavior, project docs, and lifecycle tests.

Evidence artifacts:

| Evidence | Location |
| --- | --- |
| Source reads | `apps/web/src/features/projects/pages/project-detail-page.tsx`, `apps/web/src/features/projects/api.ts`, `apps/api/internal/app/milestones.go`, `apps/api/internal/app/tasks.go`, `apps/api/internal/app/projects.go`, `apps/api/internal/app/server.go` |
| Documentation baseline | `docs/features/projects.md`, `docs/project.md` |
| Focused backend regression tests | `TEST_DATABASE_URL='postgres://postgres:postgres@localhost:55432/unitrack?sslmode=disable' go test ./apps/api/internal/app -run 'Test(MilestoneSortUpdatePreservesConcurrentMetadataChange|MilestoneReorderRequiresCompleteProjectOrder|MilestoneRollupAndTaskAssignment)' -count=1` passed |
| Frontend verification | `pnpm --filter @unitrack/web lint` and `pnpm --filter @unitrack/web build` passed; web build still emits the known large-chunk warning. |

Scorecard:

| Criterion | Score | Notes |
| --- | --- | --- |
| Project workflow clarity | 4.5/5 | Header, mission control, Work Plan, details, references, and team popover preserve the project-first flow without another visual rewrite. |
| Work Plan correctness | 4.5/5 | Checkpoint reorder is now one atomic API operation and task/checkpoint loading is independent from optional references. |
| Backend transaction safety | 4.5/5 | Milestone partial updates read current row state under the same transaction lock used for lifecycle serialization. |
| Frontend resilience | 4/5 | Resource-link failures no longer hide assignment planning; filter buttons now expose pressed state. |
| Regression coverage | 4/5 | Backend reorder and partial-update race coverage is focused; project detail browser/component coverage remains sparse. |

Findings resolved in this pass:

| Finding | Result |
| --- | --- |
| F028 non-atomic browser checkpoint reorder | Resolved with `PATCH /projects/{projectId}/milestones/reorder` and one client request containing the full checkpoint order. |
| F029 stale partial milestone update base row | Resolved by locking the project, then reading the milestone row with `FOR UPDATE` before applying omitted fields. |
| F030 optional resource-link failure blocked Work Plan | Resolved by rendering the Work Plan from task/milestone data and showing a retryable reference-link warning. |

Residual risks:

| Risk | Impact |
| --- | --- |
| Project detail remains a broad composition point. | Future changes should stay slice-based so assignment, resources, team, and project metadata do not become tightly coupled. |
| Frontend project detail browser coverage is still light. | Add tests for manage-plan mode, checkpoint reorder, assignment filters/search, and resource-load failure states when frontend coverage expands. |
| Reorder endpoint relies on app-level complete-order validation. | Schema-level unique sort constraints or normalized order repair can be considered in a future data-integrity slice if needed. |

Recommended next audit: A13 Database schema and integrity, because A07 closed app-level milestone ordering risks and the remaining durable risk is schema-level invariants.

### A08 Team and membership logic

Status: clean

Date: 2026-06-20

Overall score: 92/100

Scope included project member list/add/update/remove handlers, direct student account lookup, account-control interaction, task-assignee cleanup, activity-log metadata, one-leader behavior, team popover pending states, team docs, and lifecycle tests.

Evidence artifacts:

| Evidence | Location |
| --- | --- |
| Source reads | `apps/api/internal/app/projects.go`, `apps/api/internal/app/admin_users.go`, `apps/api/db/migrations/*project_member*`, `apps/web/src/features/projects/pages/project-detail-page.tsx`, `apps/web/src/features/projects/components/project-forms.tsx` |
| Documentation baseline | `docs/features/team-members.md`, `docs/project.md` |
| Focused backend regression tests | `TEST_DATABASE_URL='postgres://postgres:postgres@localhost:55432/unitrack?sslmode=disable' go test ./apps/api/internal/app -run 'Test(TeacherCanAddExistingActiveStudentToProject|AddProjectMemberValidatesStudentAccountState|AdminCanAddProjectMember|AddProjectMemberRechecksStudentAccountAfterLock|ProjectMemberRoleLifecycleAndPermissions|TeacherCanRemoveProjectMember)' -count=1` passed |

Scorecard:

| Criterion | Score | Notes |
| --- | --- | --- |
| Member access model | 4.5/5 | Member listing and mutations are relationship-scoped with backend authority and lifecycle gates. |
| Direct add safety | 4.5/5 | Target student state is now revalidated under row lock in the insert transaction, serialized with account-control changes. |
| Role invariant | 4.5/5 | One-leader behavior is enforced by both transaction logic and a partial unique index. |
| Removal cleanup/auditability | 4.5/5 | Assignment links are removed before membership deletion and audit metadata records the actual cleanup count. |
| Frontend popover UX | 4.25/5 | Low-emphasis team trigger, compact rows, add panel close-on-success, and pending-state action lock are aligned. |
| Regression coverage | 4.25/5 | Backend membership coverage is strong; frontend popover browser/component coverage remains sparse. |

Findings resolved in this pass:

| Finding | Result |
| --- | --- |
| F031 stale student account state during direct add | Resolved by locking/revalidating the target user row before membership insert. |
| F032 inaccurate member-removal cleanup audit metadata | Resolved by deleting task-assignee rows before deleting membership and asserting cleanup metadata. |
| F033 team popover pending-state polish | Resolved by closing add-student after success and disabling row actions during team mutations. |

Residual risks:

| Risk | Impact |
| --- | --- |
| Frontend team popover coverage is still light. | Add browser/component tests for add, search, promote/demote, removal confirmation, and pending states when frontend coverage expands. |
| Direct add intentionally reveals whether a student account exists. | This is current product behavior for manager-guided add; revisit if account enumeration becomes a security requirement. |
| Large teams use client-side member search. | Expected project teams are modest; server-side member paging/search can be added if team sizes grow. |

Recommended next audit: A13 Database schema and integrity, because A08 strengthened app-level member/account consistency and remaining durable risk is schema-level constraints and FK behavior.

### A09 Assignments and official tasks

Status: clean

Date: 2026-06-20

Overall score: 91/100

Scope included assignment create/update/list/detail handlers, milestone assignment validation, assignment forms, assignment detail role/lifecycle states, derived assignment state, official-task docs, and lifecycle tests.

Evidence artifacts:

| Evidence | Location |
| --- | --- |
| Source reads | `apps/api/internal/app/tasks.go`, `apps/api/internal/app/milestones.go`, `apps/web/src/features/tasks/components/task-forms.tsx`, `apps/web/src/features/tasks/pages/task-detail-page.tsx`, `apps/web/src/features/tasks/assignment-state.ts` |
| Documentation baseline | `docs/features/official-tasks.md`, `docs/project.md` |
| Focused backend regression tests | `TEST_DATABASE_URL='postgres://postgres:postgres@localhost:55432/unitrack?sslmode=disable' go test ./apps/api/internal/app -run 'TestAssignment(CreateRechecksMilestoneAfterLifecycleLock|PartialUpdatePreservesConcurrentMetadataChange)|TestLifecycleLockRejectsAssignmentAfterConcurrentCompletion|TestMilestoneSortUpdatePreservesConcurrentMetadataChange'` passed |

Scorecard:

| Criterion | Score | Notes |
| --- | --- | --- |
| Assignment domain fit | 4.5/5 | UI and docs consistently present teacher-created tasks as Assignments under project milestones. |
| Backend validation | 4.5/5 | Required milestones, date-only deadlines, priority/status values, active-member assignees, and child-task exclusion are enforced. |
| Transaction safety | 4.5/5 | Assignment create/update now validate milestone/current task state after the project lifecycle row lock. |
| Lifecycle alignment | 4.5/5 | Active/on-hold/completed/archived rules match the documented create/edit/submit/review matrix. |
| Frontend workflow | 4/5 | Project plan, assignment forms, and detail states are role-aware and aligned with backend behavior. |
| Regression coverage | 4/5 | Backend coverage is strong for assignment validation and races; frontend create/edit/detail browser coverage is still sparse. |

Findings resolved in this pass:

| Finding | Result |
| --- | --- |
| F034 stale assignment write reads | Resolved by rechecking milestone membership and reading the current assignment row inside the locked write transaction. |

Residual risks:

| Risk | Impact |
| --- | --- |
| Assignment deletion remains intentionally absent. | Future deletion policy must decide how to preserve submissions, reviews, files, and resource history. |
| Frontend assignment form/detail coverage is still light. | Browser/component tests should cover create/edit validation, lifecycle affordances, and role-specific assignment detail branches. |
| API compatibility still exposes `status` and `officialProgressState`. | Normal UI should keep state changes review-driven so review history remains meaningful. |

Recommended next audit: A10 Submissions and review workflow, because assignment write safety is now tightened and the adjacent high-risk flow is student submission plus teacher review state transitions.

### A10 Submissions and review workflow

Status: clean

Date: 2026-06-20

Overall score: 90/100

Scope included progress submission and review handlers, project lifecycle and permission checks, pending-review uniqueness, assignment state sync, review form behavior, evidence/resource support data on assignment detail, timeline review rendering, role-specific Playwright flows, and lifecycle tests.

Evidence artifacts:

| Evidence | Location |
| --- | --- |
| Source reads | `apps/api/internal/app/tasks.go`, `apps/api/internal/app/permissions.go`, `apps/web/src/features/tasks/pages/task-detail-page.tsx`, `apps/web/src/features/tasks/components/task-forms.tsx`, `apps/web/src/features/tasks/components/progress-timeline.tsx`, `apps/web/src/features/files/components/evidence-file-panel.tsx` |
| Rendered role evidence | `/tmp/opencode/unitrack-a10-audit-20260620/` with teacher pending-review desktop/mobile, student waiting-review, and returned-revision history captures plus `report.json` |
| Focused backend regression tests | `TEST_DATABASE_URL='postgres://postgres:postgres@localhost:55432/unitrack?sslmode=disable' go test ./apps/api/internal/app -run 'Test(StudentProgressRequiresAssignedOfficialTask|StudentProgressRechecksAssignmentAfterLifecycleLock|AssignmentCompletionRequiresPendingReviewResolution|ProgressReviewRejectsContradictionsAndDuplicateReviews|ProgressReviewRechecksManagerAfterLifecycleLock|CompletedProjectAllowsPendingReviewsOnly)'` passed |
| Frontend verification | `pnpm --filter @unitrack/web lint` and `pnpm --filter @unitrack/web build` passed; web build still emits the known large-chunk warning. |

Scorecard:

| Criterion | Score | Notes |
| --- | --- | --- |
| Submission authorization | 4.5/5 | Student role, project membership, assignment membership, lifecycle, completed-assignment, and pending-review checks are now revalidated inside the write transaction. |
| Review authorization | 4.25/5 | Reviewer access is checked before the request and again after the project lifecycle lock, closing supervisor reassignment races. |
| State consistency | 4.25/5 | Pending submissions cannot be stranded by manual assignment completion, and review decisions continue to sync submission status plus assignment state together. |
| Evidence/resource decision support | 4/5 | Review save is blocked while support data is loading or errored, with visible retry affordances. |
| Rendered role flow | 4/5 | Playwright evidence shows teacher review desk, student waiting/revision states, mobile review layout, and corrected returned-review history copy. |
| Accessibility and resilience | 3.75/5 | Review choices now expose radio semantics and stale 403/409 mutation errors refresh relevant queries; broader form label/error wiring remains future work. |
| Regression coverage | 4/5 | Backend race/edge coverage is stronger; permanent browser tests for submit/review interactions are still missing. |

Findings resolved in this pass:

| Finding | Result |
| --- | --- |
| F035 stale submitter authorization | Resolved by rechecking active assigned student eligibility inside the submission transaction. |
| F036 pending review stranded by manual completion | Resolved by blocking assignment completion while pending review rows exist. |
| F037 stale reviewer authorization | Resolved by rechecking active manager authority inside the review transaction. |
| F038 support-data failure hidden as empty evidence/resources | Resolved with loading/error notices, retry controls, and review-save blocking. |
| F039 returned/rejected review history looked approved | Resolved with review-status-specific timeline labels and tones. |
| F040 edit assignment could save with stale option data | Resolved by gating edit controls until member/checkpoint data loads. |

Residual risks:

| Risk | Impact |
| --- | --- |
| A10 Playwright evidence is ad hoc, not a committed regression test. | Add permanent browser coverage for submit, review, evidence load failure, and returned-revision states when expanding frontend tests. |
| Return-for-revision remains allowed on on-hold/completed projects by product policy because reviews are allowed there. | Students cannot resubmit until the project is active again, so copy/confirmation can be improved if this becomes confusing in real use. |
| Field labels/errors are still not fully programmatically wired across custom form controls. | Further accessibility work should add stable IDs, `aria-describedby`, and stronger keyboard behavior for form primitives. |

Recommended next audit: A11 Resources and evidence files, because A10 now depends on support-data reliability and file/resource storage/security remains a known production-risk area.

### A11 Resources and evidence files

Status: clean

Date: 2026-06-20

Overall score: 89/100

Scope included resource-link handlers, evidence file upload/download/delete handlers, polymorphic target validation, local file storage behavior, lifecycle/status gates, resource/evidence UI affordances, assignment support-data rendering, access-control Playwright coverage, and resource/evidence onboarding docs.

Evidence artifacts:

| Evidence | Location |
| --- | --- |
| Source reads | `apps/api/internal/app/resources.go`, `files.go`, `permissions.go`, `apps/web/src/features/resources/components/resource-link-drawer.tsx`, `apps/web/src/features/files/components/evidence-file-panel.tsx`, `apps/web/src/features/tasks/pages/task-detail-page.tsx`, `progress-timeline.tsx` |
| Rendered role evidence | `/tmp/opencode/unitrack-a11-audit-20260620/` with pending/reviewed teacher/student support screenshots and `report.json` |
| Focused backend regression tests | `TEST_DATABASE_URL='postgres://postgres:postgres@localhost:55432/unitrack?sslmode=disable' go test ./apps/api/internal/app -run 'Test(ResourceLinksLifecycleAndOwnership|ResourceCreateRechecksProjectAccessAfterLifecycleLock|ResourcePartialUpdatePreservesConcurrentMetadataChange|ResourceLinkTargetAndURLValidation|ProgressEvidenceFileLifecycleAndPermissions|EvidenceUploadRechecksProjectAccessAfterLifecycleLock|ReviewedSubmissionSupportRecordsAreImmutable|ChildTaskProgressIsExcludedFromAssignmentSurfaces)'` passed |
| Frontend verification | `pnpm --filter @unitrack/web lint` and `pnpm --filter @unitrack/web build` passed; web build still emits the known large-chunk warning. |

Scorecard:

| Criterion | Score | Notes |
| --- | --- | --- |
| Permission and lifecycle safety | 4.25/5 | Support writes now recheck current viewer/manager authority after the project lifecycle lock. |
| Target integrity | 4/5 | Resource targets are validated inside transactions and malformed UUID targets are rejected early; DB-level polymorphic FKs remain future work. |
| Review auditability | 4.25/5 | Reviewed submission evidence/resource records are immutable while downloads remain readable. |
| File storage safety | 3.25/5 | 10 MB checks exist on client and server; production storage still needs persistence, scanning, quotas, outbox/repair, and path hardening. |
| Frontend workflow | 4.25/5 | Pending submission resources are manageable from the assignment UI, and reviewed rows are read-only with download preserved. |
| Accessibility and stale state | 4/5 | Repeated support controls have specific labels and support mutations refresh stale project/workflow state on `403/409`; nested delete-confirmation dialog semantics remain a residual concern. |
| Regression coverage | 4/5 | Backend race and immutability coverage is strong; committed browser coverage is still limited to access-control evidence read-only behavior. |

Findings resolved in this pass:

| Finding | Result |
| --- | --- |
| F041 support-write authorization races | Resolved by transaction-scoped viewer/manager rechecks. |
| F042 stale resource targets/PATCH rows | Resolved by locked target validation and locked resource-row updates. |
| F043 reviewed support mutability | Resolved by making reviewed submission evidence/resources immutable. |
| F044 submission resource UI gap | Resolved by adding pending-submission resource management in assignment detail/history. |
| F045 stale support mutation UI | Resolved by broader query invalidation on support `403/409` failures. |
| F046 support control accessibility/file size UX | Resolved with specific labels, focus styling, and client-side file-size validation. |
| F047 reviewed support stale affordances | Resolved by gating upload/delete/resource actions to pending-review submissions. |

Residual risks:

| Risk | Impact |
| --- | --- |
| File storage remains local filesystem based. | Production still needs persistent object storage or durable volume guarantees, quotas, malware scanning, backup/retention, path canonicalization, and a repair/outbox workflow for DB/filesystem drift. |
| Resource/file targets remain polymorphic. | Post-audit support target and reviewed-support immutability triggers now enforce the current polymorphic invariants; target-specific join tables remain a future simplification option. |
| Resource delete confirmation can still be a second modal over the resource dialog. | It works visually, but destructive confirmation semantics/focus could be improved with a single modal layer or `alertdialog` behavior. |
| A11 Playwright evidence is ad hoc, not committed. | Add permanent browser tests for resource dialog create/delete, pending vs reviewed submission support affordances, and client-side file-size validation. |

Recommended next audit: A13 Database schema and integrity, because A11 tightened app-level support invariants and the remaining durable risks are schema constraints and storage-integrity boundaries.

### A12 Dashboard logic

Status: clean

Date: 2026-06-20

Overall score: 90/100

Scope included dashboard role-scoped SQL, project follow-up attention ordering, student assignment/recent-submission queues, admin/teacher/student dashboard rendering, cache/docs expectations, existing backend lifecycle coverage, and Playwright role evidence.

Evidence artifacts:

| Evidence | Location |
| --- | --- |
| Source reads | `apps/api/internal/app/dashboard.go`, `apps/web/src/features/dashboard/pages/dashboard-page.tsx`, `apps/web/src/features/projects/attention.ts`, `apps/web/src/features/tasks/components/task-table.tsx`, `apps/web/src/features/projects/components/progress-table.tsx`, `docs/features/dashboard.md` |
| Rendered role evidence | `/tmp/opencode/unitrack-a12-audit-20260620/` with admin, teacher, student desktop, student mobile screenshots, and `report.json` |
| Focused backend regression tests | `TEST_DATABASE_URL='postgres://postgres:postgres@localhost:55432/unitrack?sslmode=disable' go test ./apps/api/internal/app -run 'Test(TeacherDashboardListsOldestPendingReviewsFirst|TeacherDashboardIncludesAttentionProjectsBeforeRecentProjects|TeacherDashboardProjectFollowUpsAreNotStarvedByPendingReviews|StudentDashboardListsOnlyActionableAssignments|ProtectedRoutesRequireAuthentication)'` passed |
| Playwright regression | `LD_LIBRARY_PATH=/tmp/opencode/playwright-libs/usr/lib/x86_64-linux-gnu pnpm --filter @unitrack/web exec playwright test e2e/dashboard.spec.ts` passed |
| Frontend verification | `pnpm --filter @unitrack/web lint` and `pnpm --filter @unitrack/web build` passed; web build still emits the known large-chunk warning. |

Scorecard:

| Criterion | Score | Notes |
| --- | --- | --- |
| Role scoping | 4.5/5 | Stats, tasks, and submissions remain role-scoped; project follow-ups now filter true candidates before caps. |
| Workflow prioritization | 4.25/5 | Teachers/admins see review queue first, then overdue assignments and non-starved project follow-ups; students see revision/overdue/next-up groups. |
| Admin usefulness | 4/5 | Admin dashboard copy and summary now expose global teacher/student scale, though deeper admin analytics remain future admin-basics work. |
| Frontend clarity | 4.25/5 | Role-specific titles and summary chips render cleanly on desktop/mobile evidence without reverting to generic KPI cards. |
| Regression coverage | 4.25/5 | Backend ordering/scoping and Playwright role-branch coverage now exist; empty/error dashboard browser states remain untested. |

Findings resolved in this pass:

| Finding | Result |
| --- | --- |
| F048 project follow-up starvation | Resolved by filtering active no-pending-review follow-up candidates in SQL before `LIMIT`. |
| F049 admin summary/copy mismatch | Resolved with admin-specific title/copy and teacher/student count chips. |
| F050 missing dashboard browser regression | Resolved with `apps/web/e2e/dashboard.spec.ts`. |

Residual risks:

| Risk | Impact |
| --- | --- |
| Dashboard aggregate SQL remains hand-written in several queries. | Future lifecycle/status changes must update stats, task queues, submission queues, and project follow-up candidate logic together. |
| Project follow-up logic is still split between backend SQL and frontend `projectNeedsAttention`. | The backend now caps true follow-up candidates first, but frontend filtering remains a safety layer that must stay semantically aligned. |
| Admin dashboard remains a lightweight global work queue. | All-project management, activity logs, and richer admin analytics are still part of admin-basics work. |
| Empty/error browser states are not covered. | Add Playwright or component coverage for dashboard loading, request failure, and fully empty role states when frontend QA expands. |

Recommended next audit: A13 Database schema and integrity, because A12 improved dashboard SQL behavior and the next highest-value data-safety slice remains durable schema and relationship enforcement.

### A13 Database schema and integrity

Status: clean

Date: 2026-06-20

Overall score: 91/100

Scope included migration validation, assignment/submission constraints, historical child-task schema, folder/project relationship constraints, dashboard/project-aware joins, app-vs-database invariants, DB-backed lifecycle tests, and Playwright folder-candidate evidence.

Evidence artifacts:

| Evidence | Location |
| --- | --- |
| Source reads | `apps/api/db/migrations/*.sql`, `apps/api/internal/app/tasks.go`, `dashboard.go`, `classes.go`, `projects.go`, `admin_users.go`, `docs/features/database-integrity.md`, `docs/features/workspace-project-folders.md` |
| Database validation | `make db-validate` passed; local DB migrated with `DATABASE_URL='postgres://postgres:postgres@localhost:55432/unitrack?sslmode=disable' make db-up` |
| Focused backend tests | `TEST_DATABASE_URL='postgres://postgres:postgres@localhost:55432/unitrack?sslmode=disable' go test ./apps/api/internal/app -run 'Test(DatabaseRejectsCrossProjectChildTasks|DatabaseRejectsMismatchedFolderProjectLinks|ProjectCreationAllowsOptionalClass|ProjectUpdateCanChangeClass|UnassignedProjectSearchUsesBackendFilterAndExcludesArchivedCandidates|StudentDashboardListsOnlyActionableAssignments|ChildTaskProgressIsExcludedFromAssignmentSurfaces)'` passed |
| Account-transition regression | `TestAdminRoleChangeRequiresTeacherResponsibilityReassignment` passed with a linked folder/project under deferred folder triggers. |
| Playwright evidence | `/tmp/opencode/unitrack-a13-audit-20260620/` with `admin-folder-candidates.png` and `report.json`; permanent regression `apps/web/e2e/database-integrity.spec.ts` passed. |

Scorecard:

| Criterion | Score | Notes |
| --- | --- | --- |
| Assignment/submission integrity | 4.5/5 | Project-aware assignee FKs, same-project submission FK, one pending submission per assignment, and project-aware joins are in place. |
| Historical schema safety | 4.25/5 | Retained `parent_task_id` is now same-project constrained even though child tasks are inactive in the product. |
| Folder/project relationship integrity | 4.5/5 | Deferred triggers enforce final owner/supervisor alignment while supporting legitimate account-transition transactions. |
| Migration quality | 4.25/5 | New migration validates existing drift before adding constraints and has reversible down steps. |
| Browser/UI alignment | 4/5 | Playwright verifies cross-owner project candidates stay hidden in admin folder detail; broader folder movement UI coverage remains partial. |
| Residual direct-write constraints | 3.75/5 | Post-audit support target and reviewed-support immutability triggers now backstop resource/file direct writes; target-specific tables remain a possible future simplification. |

Findings resolved in this pass:

| Finding | Result |
| --- | --- |
| F051 historical child-task cross-project drift | Resolved with `tasks_project_parent_task_fk`. |
| F052 folder owner/project supervisor drift | Resolved with deferred database triggers. |
| F053 missing browser evidence for folder ownership filtering | Resolved with `apps/web/e2e/database-integrity.spec.ts` and A13 Playwright artifacts. |

Residual risks:

| Risk | Impact |
| --- | --- |
| Resource/file targets remain polymorphic. | Post-audit support target triggers now reject invalid target rows; target-specific tables remain a possible future simplification. |
| Reviewed-support operational repairs require care. | Normal direct DB writes are now trigger-blocked after review; repair scripts should delete or repair parent/support rows deliberately in one transaction. |
| Last-active-admin protection remains code-serialized. | The account-management transaction/advisory lock protects the invariant, but it is not a pure database constraint. |
| Folder owner transfer is still not exposed in UI. | Deferred triggers support final-state integrity, but any future owner-transfer UI must update linked project supervisors or unlink/reassign projects explicitly. |

Recommended next audit was A14 Backend API implementation; A14 through A19 are now complete. Current audit queue is complete.

### A14 Backend API implementation

Status: clean

Date: 2026-06-20

Overall score: 90/100

Scope included `/api/v1` route registration, shared response and JSON decoding helpers, malformed route ID behavior, handler validation and error semantics for protected project/task/milestone/resource/file routes, and web API client/server endpoint alignment.

Evidence artifacts:

| Evidence | Location |
| --- | --- |
| Source reads | `apps/api/internal/app/server.go`, `response.go`, `types.go`, `auth.go`, `admin_users.go`, `projects.go`, `classes.go`, `tasks.go`, `milestones.go`, `resources.go`, `files.go`, `permissions.go` |
| Web API client alignment | `apps/web/src/features/**/api.ts` endpoint strings compared against registered backend routes; no route drift found. |
| Focused backend tests | `TEST_DATABASE_URL='postgres://postgres:postgres@localhost:55432/unitrack?sslmode=disable' go test ./apps/api/internal/app -run 'Test(JSONDecoderRejectsTrailingValues|ProtectedRoutesRejectMalformedUUIDParams)' -count=1` passed. |
| Full backend tests | `TEST_DATABASE_URL='postgres://postgres:postgres@localhost:55432/unitrack?sslmode=disable' make api-test` passed. |
| Web verification | `pnpm --filter @unitrack/web lint` and `pnpm --filter @unitrack/web build` passed; existing Vite large-chunk warning remains. |
| Browser regression | `LD_LIBRARY_PATH=/tmp/opencode/playwright-libs/usr/lib/x86_64-linux-gnu pnpm --filter @unitrack/web test:e2e` passed with 8 tests. |
| Diff check | `git diff --check` passed; `git diff --no-index --check` passed for touched untracked docs. |

Scorecard:

| Criterion | Score | Notes |
| --- | --- | --- |
| Route registration clarity | 4.5/5 | Routes are centralized in `server.go`; active web client endpoints match registered backend routes. |
| Request decoding | 4.5/5 | JSON bodies are size-limited, unknown-field rejected, and now single-value enforced. Multipart evidence upload intentionally uses separate parsing. |
| Route ID validation | 4/5 | Active malformed route IDs now return stable `400`s before UUID-column casts; project/folder/user checks still rely on relationship helpers where appropriate. |
| Error semantics | 4/5 | Confirmed malformed request boundaries return client errors without database error leakage for audited routes. |
| Regression coverage | 4/5 | Focused backend tests cover the confirmed request-boundary regressions; broader contract fuzzing remains future work. |

Findings resolved in this pass:

| Finding | Result |
| --- | --- |
| F054 trailing JSON values accepted | Resolved with strict single-value `decodeJSON` enforcement. |
| F055 malformed UUID route IDs reached SQL | Resolved with shared `requireValidUUIDParam` checks in affected handlers. |

Residual risks:

| Risk | Impact |
| --- | --- |
| Route ID validation is still a handler convention. | New endpoints can regress unless they use `requireValidUUIDParam` or a permission helper that returns `400` on malformed UUIDs. |
| API client/server route alignment is manually audited. | Future route additions should update clients and tests together; no generated OpenAPI contract exists. |
| Multipart evidence upload has a separate request parser. | File-type, malware, quota, and storage hardening remain part of the deployment/security slices rather than A14. |

Recommended next audit was A15 Frontend state and data flow; A15 through A19 are now complete. Current audit queue is complete.

### A15 Frontend state and data flow

Status: clean

Date: 2026-06-20

Overall score: 88/100

Scope included React Query key families and invalidations, auth-store synchronization, admin account transition support data, folder candidate search state, folder edit form clears, project/folder/assignment stale `403`/`409` handling, and resource-link dialog form state.

Evidence artifacts:

| Evidence | Location |
| --- | --- |
| Source reads | `apps/web/src/lib/query-keys.ts`, `query-invalidation.ts`, `axios.ts`, `apps/web/src/features/auth/hooks.ts`, admin, workspace, folder-detail, project, task, and resource form/page files |
| Shared invalidation helpers | `apps/web/src/lib/query-invalidation.ts` groups workspace, admin account-impact, class/folder, project, and stale-error refresh behavior. |
| Browser regression | `LD_LIBRARY_PATH=/tmp/opencode/playwright-libs/usr/lib/x86_64-linux-gnu pnpm --filter @unitrack/web test:e2e -- e2e/state-flow.spec.ts` passed. |
| Web verification | `pnpm --filter @unitrack/web lint` and `pnpm --filter @unitrack/web build` passed; existing Vite large-chunk warning remains. |
| Full browser suite | `LD_LIBRARY_PATH=/tmp/opencode/playwright-libs/usr/lib/x86_64-linux-gnu pnpm --filter @unitrack/web test:e2e` passed with 10 tests. |
| Diff check | `git diff --check` passed. |

Scorecard:

| Criterion | Score | Notes |
| --- | --- | --- |
| Query key organization | 4.25/5 | Key families are centralized, and broad mutation impacts now use shared invalidation helpers. |
| Stale permission/lifecycle recovery | 4/5 | Representative `403`/`409` mutation paths refresh affected state; future mutations must keep using the helper convention. |
| Form target safety | 4/5 | Resource dialogs and folder edit clears now avoid stale local state; more dialog permutations need browser coverage. |
| Auth state synchronization | 4.25/5 | `/auth/me` only clears user state on confirmed unauthorized responses, reducing transient role flicker. |
| Regression coverage | 3.75/5 | New Playwright coverage protects folder clears and stale candidate search; admin/resource/project form coverage remains partial. |

Findings resolved in this pass:

| Finding | Result |
| --- | --- |
| F056 admin account mutations left cross-feature caches stale | Resolved with `invalidateAdminAccountImpactData`. |
| F057 replacement supervisor choices used filtered account table data | Resolved with a dedicated active teacher/admin candidate query. |
| F058 folder add-existing search exposed stale placeholder candidates | Resolved with stale candidate hiding and browser regression coverage. |
| F059 folder descriptions could not be cleared | Resolved by sending explicit empty descriptions and browser regression coverage. |
| F060 resource-link forms could reuse stale target drafts | Resolved with keyed create/edit form remounts. |
| F061 stale `403`/`409` mutation errors left stale controls visible | Resolved with shared stale-error refresh helpers across affected feature surfaces. |
| F062 transient `/auth/me` failures cleared auth-store user state | Resolved by clearing only on confirmed `401`. |

Residual risks:

| Risk | Impact |
| --- | --- |
| Query invalidation remains convention-based. | New mutation paths can regress unless they use `queryKeys` and the shared invalidation helpers. |
| Resource target-switch behavior lacks dedicated browser coverage. | Keyed remounts are implemented and verified by lint/build, but a route-level regression would catch future dialog rewrites. |
| Admin account edit/password flows still lack browser automation. | Replacement support data and invalidation are implemented, and create/search/sign-in is covered, but edit transitions, password reset, and conflict rendering remain future browser coverage. |
| Broader frontend form coverage is still partial. | Project create/edit, assignment create/edit, member add/remove, support dialogs, empty states, and redirect edge cases need more automated tests. |

Recommended next audit was A16 Visual UI system and accessibility; A16 through A19 are now complete. Current audit queue is complete.

### A16 Visual UI system and accessibility

Status: clean

Date: 2026-06-21

Overall score: 88/100

Scope included the shared protected app shell, dialog primitive, custom radio-like controls, UI system docs, and existing Playwright visual/accessibility coverage.

Evidence artifacts:

| Evidence | Location |
| --- | --- |
| Source reads | `apps/web/src/components/layout/app-layout.tsx`, `apps/web/src/components/ui/dialog.tsx`, `apps/web/src/features/workspace/pages/workspace-page.tsx`, `apps/web/src/features/tasks/components/task-forms.tsx`, `apps/web/src/features/projects/pages/project-detail-page.tsx`, `apps/web/src/components/ui/*` |
| Accessibility regression | `LD_LIBRARY_PATH=/tmp/opencode/playwright-libs/usr/lib/x86_64-linux-gnu pnpm exec playwright test e2e/accessibility.spec.ts` passed with 2 tests. |
| Web verification | `pnpm --filter @unitrack/web lint` and `pnpm --filter @unitrack/web build` passed; existing Vite large-chunk warning remains. |
| Full browser suite | `E2E_ADMIN_EMAIL=demo.admin@demo.unitrack.local E2E_ADMIN_PASSWORD='DemoPass123!' LD_LIBRARY_PATH=/tmp/opencode/playwright-libs/usr/lib/x86_64-linux-gnu pnpm --filter @unitrack/web test:e2e` passed with 12 tests. |
| Diff check | `git diff --check` passed. |

Scorecard:

| Criterion | Score | Notes |
| --- | --- | --- |
| App shell keyboard access | 4.25/5 | Protected pages now expose a first-tab skip link to `#main-content`; broader route-by-route keyboard walkthroughs remain future work. |
| Dialog accessibility | 4.25/5 | Shared dialogs retain focus trap/restore behavior and now expose one named close control instead of a focusable backdrop. |
| Custom control semantics | 4/5 | Folder color picker has roving keyboard behavior; review decisions now use native radio inputs. Other compact controls should continue to be audited as they are added. |
| Visual system consistency | 4.25/5 | Existing ocean/ledger system remains intact; no broad redesign was needed in this pass. |
| Regression coverage | 3.75/5 | New accessibility Playwright spec covers skip link, dialog close/focus behavior, and folder color keyboarding; automated axe-style coverage is still absent. |

Findings resolved in this pass:

| Finding | Result |
| --- | --- |
| F063 protected app had no keyboard skip link | Resolved with `AppLayout` skip link and `#main-content` focus target. |
| F064 dialog backdrop exposed duplicate close semantics | Resolved with non-semantic backdrop and a single named close button inside the dialog. |
| F065 folder color picker lacked radio-keyboard behavior | Resolved with roving focus and Arrow/Home/End behavior. |
| F066 assignment review decisions lacked native radio semantics | Resolved with native radio inputs styled as decision cards. |

Residual risks:

| Risk | Impact |
| --- | --- |
| No automated axe-style accessibility scan is wired. | Semantic regressions outside focused Playwright checks can still slip through. |
| Keyboard walkthrough coverage is still partial. | Project detail, assignment review, admin forms, popovers, and resource/evidence flows need broader keyboard-path tests. |
| Color contrast is manually assessed. | The ocean/ledger palette appears consistent, but contrast regressions should be checked with tooling before launch. |
| Custom compact controls remain convention-based. | Future icon buttons, popovers, and card controls must keep names, disabled states, and keyboard behavior explicit. |

Recommended next audit was A17 Testing and QA coverage; A17 through A19 are now complete. Current audit queue is complete.

### A17 Testing and QA coverage

Status: clean

Date: 2026-06-21

Overall score: 86/100

Scope included API Go tests, config validation tests, Playwright specs, web/root package scripts, Makefile QA entry points, and documentation references for test commands and remaining coverage gaps.

Evidence artifacts:

| Evidence | Location |
| --- | --- |
| Backend test inventory | `apps/api/internal/app/lifecycle_test.go` with 63 lifecycle/API tests; `apps/api/internal/config/config_test.go` with 11 config validation tests. |
| Browser test inventory | `apps/web/e2e/` now includes auth, access-control, accessibility, admin accounts, dashboard, database-integrity, login visual, and state-flow specs. |
| New admin UI regression | `E2E_ADMIN_EMAIL=demo.admin@demo.unitrack.local E2E_ADMIN_PASSWORD='DemoPass123!' LD_LIBRARY_PATH=/tmp/opencode/playwright-libs/usr/lib/x86_64-linux-gnu pnpm exec playwright test e2e/admin-accounts.spec.ts` passed with 1 test. |
| Full browser suite | Isolated fresh API/web run passed with 13 tests using `PLAYWRIGHT_BASE_URL=http://localhost:5174`, `PLAYWRIGHT_WEB_SERVER_COMMAND='pnpm dev -- --host 0.0.0.0 --port 5174'`, `VITE_API_URL=http://localhost:18080/api/v1`, and matching API `CORS_ALLOWED_ORIGINS`. |
| Command surface | `package.json`, `apps/web/package.json`, `Makefile`, and `apps/web/playwright.config.ts` expose build/lint/browser-test entry points and an isolated web-server command override. |

Scorecard:

| Criterion | Score | Notes |
| --- | --- | --- |
| Backend lifecycle coverage | 4.5/5 | API lifecycle and relationship tests are broad and focused; they still require `TEST_DATABASE_URL` for full execution. |
| Frontend browser coverage | 3.75/5 | Core auth/accessibility/access-control/dashboard/folder/admin state flows are covered; project/task/resource/team success paths remain partial. |
| QA command discoverability | 4/5 | Root package scripts and Makefile now expose browser suite aliases alongside existing web package scripts. |
| Fixture quality | 4/5 | Most Playwright specs create unique API fixtures and skip cleanly when API is unavailable; repeated shared-admin login can still hit local rate limits during intensive audit runs. |
| Visual/regression artifacts | 3.75/5 | Login visual artifact and failure screenshots/traces exist; broader screenshot baselines are intentionally not wired yet. |

Findings resolved in this pass:

| Finding | Result |
| --- | --- |
| F067 admin account UI success flow lacked browser coverage | Resolved with `apps/web/e2e/admin-accounts.spec.ts`. |
| F068 root QA commands omitted browser suite aliases | Resolved with root package and Makefile e2e aliases. |
| F069 isolated Playwright runs could reuse the wrong Vite server | Resolved with `PLAYWRIGHT_WEB_SERVER_COMMAND` and docs for aligned origins. |

Residual risks:

| Risk | Impact |
| --- | --- |
| Playwright specs still share an admin credential by default. | Repeated local audit runs can trip login rate limits; use `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` overrides or fresh fixture admins when appropriate. |
| Browser coverage for project/task/team/resource happy paths is still partial. | Regressions in create/edit project, assignment edit, team add/remove, and support dialogs may require manual verification until more specs are added. |
| No frontend unit/component test runner is configured. | Small pure UI/state helpers are currently verified through lint/build and browser flows rather than fast component tests. |
| Backend tests are database-dependent. | `make api-test` skips lifecycle coverage without `TEST_DATABASE_URL`; CI should provide a test Postgres service. |

Recommended next audit was A18 Deployment, security, and operations; A18 and A19 are now complete. Current audit queue is complete.

### A18 Deployment, security, and operations

Status: clean

Date: 2026-06-21

Overall score: 87/100

Scope included deployment reference docs, API configuration loading/validation, CORS and cookie production guardrails, health/readiness endpoints, local env examples, file-storage caveats, and first-launch operational guidance.

Evidence artifacts:

| Evidence | Location |
| --- | --- |
| Deployment docs | `docs/deployment.md`, `docs/project.md`, `docs/features/auth-session.md`, `apps/api/.env.example` |
| Runtime config source | `apps/api/internal/config/config.go`, `apps/api/internal/config/config_test.go` |
| Health/readiness source | `apps/api/internal/app/server.go` exposes `/api/v1/health` and `/api/v1/ready`. |
| Focused backend tests | `go test ./apps/api/internal/config` passed. |
| API build/tests | `make api-build` and `TEST_DATABASE_URL='postgres://postgres:postgres@localhost:55432/unitrack?sslmode=disable' make api-test` passed. |
| Database validation | `make db-validate` passed. |
| Diff check | `git diff --check` passed. |

Scorecard:

| Criterion | Score | Notes |
| --- | --- | --- |
| Production env safety | 4.25/5 | Startup now rejects missing production DB URLs, insecure production cookies, malformed/wildcard CORS origins, and production HTTP CORS origins. |
| Cookie/CORS deployment clarity | 4.25/5 | Docs now align Vercel/Render HTTPS split with exact HTTPS CORS, `SESSION_SECURE=true`, and `SameSite=None` guidance. |
| Health/readiness operations | 4/5 | Liveness and DB readiness endpoints are implemented and documented; no metrics endpoint or structured request logging beyond chi middleware/logger is wired. |
| Evidence-file operations | 3.75/5 | Local storage caveat and R2 recommendation are explicit; durable storage adapter, quotas, MIME policy, scanning, retention, and repair jobs remain future work. |
| Scaling/load-balancing readiness | 3.75/5 | Single-instance first launch is documented; shared rate limits, durable file storage, and connection-pooling reviews are required before horizontal scaling. |

Findings resolved in this pass:

| Finding | Result |
| --- | --- |
| F070 unsafe production config accepted at startup | Resolved with stricter `Config.Validate()` and focused config tests. |
| F071 health/readiness and upload storage env docs were incomplete | Resolved with deployment docs and API env example updates. |

Residual risks:

| Risk | Impact |
| --- | --- |
| Evidence files still use local filesystem storage. | Hosted evidence remains non-durable until the R2/S3 adapter and operational policies are implemented. |
| Login rate limiting is in memory. | Multiple API instances or restarts lose limiter state; use a shared limiter or edge rules before scaling horizontally. |
| Observability remains basic. | Health/readiness and logs exist, but there is no metrics endpoint, alerting integration, tracing, or structured audit UI. |
| Production config validation is intentionally conservative. | Production local-HTTP experiments require non-production `APP_ENV` or HTTPS tunneling. |

Recommended next audit was A19 Documentation accuracy; A19 is now complete and the current audit queue is clean.

### A19 Documentation accuracy

Status: clean

Date: 2026-06-21

Overall score: 91/100

Scope included `docs/project.md`, `docs/deployment.md`, `docs/audit.md`, feature onboarding docs, Playwright suite references, root/package/Makefile QA commands, API config validation behavior, and known coverage-gap wording.

Evidence artifacts:

| Evidence | Location |
| --- | --- |
| Documentation search | Targeted searches across `docs/**/*.md` for audit recommendations, test counts, Playwright commands, config/deployment env variables, removed-scope terms, and stale coverage-gap copy. |
| Source cross-checks | `apps/api/internal/config/config.go`, `apps/api/internal/config/config_test.go`, `apps/web/playwright.config.ts`, `package.json`, `Makefile`, and `apps/web/e2e/`. |
| Docs updated | `docs/audit.md`, `docs/project.md`, `docs/features/auth-session.md`, and `docs/features/frontend-state.md`. |
| Diff check | `git diff --check` passed. |

Scorecard:

| Criterion | Score | Notes |
| --- | --- | --- |
| Feature index accuracy | 4.5/5 | Current feature and route indexes align with implemented docs and source maps; minor auth wildcard-origin wording was clarified. |
| Test/QA documentation | 4.25/5 | Root/package/Makefile commands and Playwright environment knobs align; A17 config test inventory was updated to the current 11-test count. |
| Coverage-gap accuracy | 4/5 | Admin account create/search/sign-in coverage is now reflected; remaining gaps call out edit/password/conflict flows instead of all success flows. |
| Deployment/config docs | 4.5/5 | Deployment, auth, and project docs align with startup validation for production DB, secure cookies, SameSite, exact HTTPS CORS origins, health/readiness, and upload storage. |
| Audit tracker hygiene | 4/5 | Queue statuses now show all A01-A19 passes clean; historical recommendations were adjusted where they claimed A19 was still pending. |

Findings resolved in this pass:

| Finding | Result |
| --- | --- |
| F072 stale config validation test count | Updated A17 evidence from 6 to 11 config validation tests. |
| F073 stale admin browser coverage gaps | Updated A05/A15 residual risks and frontend-state known gaps to reflect create/search/sign-in coverage and remaining edit/password/conflict gaps. |
| F074 wildcard-origin wording ambiguity | Reworded auth docs to say wildcard CORS origins are rejected or not trusted. |

Residual risks:

| Risk | Impact |
| --- | --- |
| Documentation can drift as audit fixes continue. | Keep the documentation sync policy active for code/UI/API/schema/workflow changes and update feature docs before closing future slices. |
| Historical audit entries remain narrative records. | Older pass scores and evidence reflect the audit sequence; only current-state contradictions were updated in A19. |

Recommended next audit: Current audit queue is complete. Start a new audit cycle only after meaningful product, API, schema, deployment, or QA scope changes, or pick the next product slice from `docs/project.md`.

## Audit Pass Template

Use this outline when starting a topic-specific audit.

```md
## <Audit ID> <Topic>

Status: in_progress
Auditor:
Date:

### Scope
- Files/routes/features included:
- Files/routes/features excluded:

### Evidence Collected
- Source reads:
- Commands/tests:
- Playwright screenshots or traces:
- Database/schema checks:

### Findings
| Severity | Finding | Evidence | Recommended Fix |
| --- | --- | --- | --- |

### Residual Risks
-

### Follow-Up
- Update `docs/audit.md` status.
- Update relevant `docs/features/*.md` if durable behavior or known risks changed.
```

## Suggested Audit Order

1. A01 Product scope and business workflow.
2. A02 Roles, permissions, and access control.
3. A03 Project lifecycle logic.
4. A13 Database schema and integrity.
5. A14 Backend API implementation.
6. A15 Frontend state and data flow.
7. A09 Assignments and official tasks.
8. A10 Submissions and review workflow.
9. A07 Project detail and Work Plan.
10. A16 Visual UI system and accessibility.
11. A17 Testing and QA coverage.
12. A18 Deployment, security, and operations.
13. A19 Documentation accuracy.
