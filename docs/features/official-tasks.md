# Official Tasks / Assignments Onboarding

This document explains the current UniTrack assignment implementation for engineers who need to maintain teacher-created project work, assignment state, submissions, and review workflows. The backend/API object is still named task for compatibility.

## Purpose

Official tasks are the backend/API object. The user-facing product name is `Assignment`: teacher-owned work inside a project. Students submit work against their assigned work, teachers review those submissions, and project/milestone rollups summarize reviewed assignment progress.

The feature provides:

- Teacher/admin creation and editing of assignments with scroll-safe dialog actions that do not cover assignee controls.
- Required milestone assignment for planning checkpoints; active assignments cannot be standalone.
- Date-only deadlines for overdue rollups.
- Priority, due dates, and assignment ownership without exposing duplicate workflow status in the normal UI.
- Assignment to active student project members with a searchable, capped assignee checklist.
- An assignment detail page with a structured layout: concise command header, teacher review desk with sticky decision panel for pending submissions, student workbench/read-only states, brief/context panels, and a history feed.
- Centered assignment resource management instead of a page-edge drawer; submission resources remain inline in the feed.
- A derived assignment state so users see one lifecycle truth: `Not started`, `Waiting for review`, `Needs revision`, `In progress`, `Complete`, or `Overdue`.
- Review decisions that update both submission status and internal task progress state, including an explicit `Approve and complete` choice that marks the assignment done.
- Active assignment progress surfaces exclude historical child-task submissions; `parent_task_id` remains schema only.

Project rollups are documented in `docs/features/projects.md`. Team membership and assignment eligibility are documented in `docs/features/team-members.md`. Access rules are documented in `docs/features/protected-access.md`.

## Current Status

| Capability | Status | Notes |
| --- | --- | --- |
| Assignment list | Implemented | Project viewers can list assignments; historical child-task rows are excluded from the project assignment list and assignees are loaded in one batched query. |
| Assignment detail | Implemented | Project viewers can open an assignment page with a concise dossier header, teacher review desk for pending reviews, student workbench/read-only states, brief/context panels, and history feed. |
| Assignment create | Implemented | Teacher/admin only; launched from a milestone, validates title, priority, deadline, required milestone, and assignees; same-project milestone validation runs inside the locked write transaction. Dialog actions scroll with the form so the assignee list is not covered. Manual workflow status is hidden from normal UI. |
| Assignment edit | Implemented | Teacher/admin only; uses a narrower compact dialog for changing the brief, deadline, required milestone, and assignments; partial updates read the current assignment row after the locked lifecycle re-check before applying omitted fields. Dialog actions scroll with the form so selected assignees stay readable. Manual workflow status is hidden from normal UI. |
| Project status gates | Implemented | Active projects allow assignment creation and submissions; on-hold projects allow manager assignment edits but block new assignments/submissions; completed projects allow pending reviews only; archived projects are read-only. Assignment, submission, and review writes re-check lifecycle under a project-row lock inside their transactions. |
| Assignment validation | Implemented | Assignees must be active student members of the project; forms only list active student members, initially show 80 matching assignee options, and ask users to search when more match. |
| Date-only deadlines | Implemented | Deadlines accept `YYYY-MM-DD` and are stored as `DATE`. |
| Milestone assignment | Implemented | Assignments must be linked to milestones in the same project; standalone assignments are migrated into a generated milestone. |
| Review-driven state sync | Implemented | Student submission sets internal workflow status to `submitted`; teacher review syncs internal status and official progress state, and `Approve and complete` sets the assignment to `done`/`completed`. Review decisions use native radio inputs styled as cards. |
| Progress submissions | Audited A10 2026-06-20 | Assigned active students submit trimmed assignment-scoped work only while projects are active; duplicate pending submissions and completed assignments are blocked. Submitter assignment, project membership, and active student status are rechecked inside the locked write transaction and backed by a database trigger for future direct writes. |
| Progress review | Audited A10 2026-06-20 | Teacher/admin reviews are assignment-scoped, one-final-review only, stale-review guarded, contradiction checked, and require guidance when returning/rejecting work. Reviewer manager authority is rechecked inside the locked review transaction. |
| Child-task progress exclusion | Implemented | Historical child-task rows and their progress updates are excluded from active assignment lists, progress feeds, review endpoints, project/dashboard/folder pending-review rollups, and stale-progress calculations. |
| Nested child work items | Removed | No UI, API client functions, or protected API routes are exposed for child work items. |
| Assignment deletion | Not implemented | Out of current scope; no delete route or UI exists for assignments. |
| Direct lifecycle tests | Implemented | Assignment create/update permission, validation, submission state sync, and review state sync coverage exists in lifecycle tests. |
| Feature audit | Audited A09 2026-06-20 | Reviewed backend permissions/lifecycle logic, assignment-scoped rollups, frontend assignment UI/UX, copy consistency, transaction boundaries, and targeted verification. |
| Frontend automated tests | Missing/partial | Backend coverage is strong; route/component interaction tests are still needed. |

## User-Facing Behavior

| User action | Expected result |
| --- | --- |
| Teacher/admin creates an assignment | Assignment is created from a milestone and appears in the project plan, dashboard assignment lists, milestone rollups, and project rollups. |
| Teacher/admin changes an assignment milestone | Assignment moves under the selected milestone and contributes to that milestone's progress. |
| Teacher/admin assigns students | Only active student project members can be assigned; large member lists are searchable and capped visually. |
| Teacher/admin edits an assignment | Assignment metadata, plan rows, rollups, dashboard data, and folder summaries refresh. |
| Teacher/admin clears deadline | Empty deadline removes the due date; the milestone cannot be cleared. |
| Teacher/admin opens an assignment with pending reviews | The page becomes a review desk: the submission under review, context, evidence, and brief sit in the main column while a sticky decision panel keeps review choices and `Save review` visible. |
| Project viewer opens a project plan assignment row | Assignment title links to the assignment page; no separate `Open` button is shown. |
| Assigned student opens an assignment | The workbench shows the relevant state: submit work, submit a revision, wait for review, read completion, or read-only when the project lifecycle blocks submissions. |
| Unassigned project member opens an assignment | Assignment is readable, but submission is hidden and backend-blocked. |
| Non-member opens an assignment | Backend returns `403`; frontend shows a restricted state. |
| User reads assignment state | UI shows one derived assignment state in the header meta and the workbench/review desk instead of exposing separate task workflow/review controls. |
| Student submits work | Backend creates a pending submission and marks the internal task workflow as `submitted`. |
| Teacher reviews work | Backend locks the pending submission row, revalidates current manager authority, records one final review, and updates submission status, reviewed progress state, and internal task workflow together; choosing `Approve and complete` completes the assignment. Returning or rejecting work requires review guidance for the student. |
| Keyboard user changes review decision | Review decision cards behave as native radio inputs, including expected Tab and arrow-key behavior. |
| Teacher opens review desk while evidence/resources load | The page shows loading/error support-data notices and blocks `Save review` until evidence/resource state is known or retried. |
| Teacher manually completes an assignment with pending review | Backend returns `409`; the pending submission must be reviewed first. |
| Historical child-task progress exists | It is retained in the database but hidden from active assignment progress feeds, dashboard review queues, pending-review counts, and review writes. |
| Teacher deletes a milestone with assignments | App confirmation appears first; backend rejects the delete until assignments are moved elsewhere. |
| Student submits while project is on hold, completed, or archived | Backend returns `409`; frontend hides submission and evidence-upload affordances. |
| Teacher reviews while project is archived | Backend returns `409`; completed and on-hold projects can still clear pending reviews. |
| User submits a stale assignment action after permission or lifecycle changes elsewhere | Backend returns `403` or `409`, and the frontend refreshes project/assignment state so stale work controls disappear. |

## API Contract

Base path: `/api/v1`

| Method | Endpoint | Access | Request | Success | Common Errors |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/projects/{projectId}/tasks` | Project viewer | Cookie only | `200` assignment DTO list | `400`, `401`, `403`, `500` |
| `POST` | `/projects/{projectId}/tasks` | Project manager | Create task DTO | `201` task detail DTO | `400`, `401`, `403`, `409`, `500` |
| `GET` | `/projects/{projectId}/tasks/{taskId}` | Project viewer | Cookie only | `200` task detail DTO | `400`, `401`, `403`, `404`, `500` |
| `PATCH` | `/projects/{projectId}/tasks/{taskId}` | Project manager | Partial update task DTO | `200` task detail DTO | `400`, `401`, `403`, `404`, `409`, `500` |
| `POST` | `/projects/{projectId}/tasks/{taskId}/progress-updates` | Assigned student plus active project | Progress submission DTO | `201` progress update DTO | `400`, `401`, `403`, `404`, `409`, `500` |
| `POST` | `/projects/{projectId}/progress-updates/{updateId}/reviews` | Project manager plus non-archived project | Review DTO | `200` progress update DTO | `400`, `401`, `403`, `404`, `409`, `500` |

Malformed `{taskId}` and `{updateId}` path values return `400` before database UUID-column queries. Well-formed IDs that do not belong to the project continue to return handler-specific `404` or `403` responses.

Create task DTO fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `title` | Yes | Assignment title. Blank titles are rejected. |
| `description` | No | Expected work, evidence, and review notes. |
| `status` | API only optional | Internal workflow status: `todo`, `in_progress`, `submitted`, `needs_changes`, or `done`. Normal UI no longer exposes this field. Defaults to `todo`. |
| `priority` | No | `low`, `medium`, or `high`. Defaults to `medium`. |
| `deadline` | No | Date-only `YYYY-MM-DD`; empty means no deadline. |
| `milestoneId` | Yes | Same-project milestone ID. Empty values are rejected. |
| `assigneeIds` | No | Active student project member IDs. Invalid or non-member students are rejected. |

Update task DTO fields:

| Field | Meaning |
| --- | --- |
| `title` | New assignment title; cannot become blank. |
| `description` | New description; empty string clears it. |
| `status` | API-only internal workflow status. Normal UI does not send this field. |
| `priority` | New priority. |
| `deadline` | New date-only deadline; empty string clears it; omitted leaves as-is. |
| `milestoneId` | New same-project milestone ID; empty string is rejected; omitted leaves as-is. |
| `officialProgressState` | API-only reviewed progress state. Normal UI changes this through review decisions. |
| `assigneeIds` | Replaces current task assignees when present; empty array clears assignments; omitted leaves as-is. |

Task DTO fields, rendered as assignments in the UI:

| Field | Meaning |
| --- | --- |
| `id`, `projectId`, `projectName` | Task identity and owning project context used by dashboard rows and assignment links. |
| `milestoneId`, `milestoneTitle` | Required planning checkpoint context for active assignments. |
| `title`, `description` | User-facing assignment brief. |
| `status` | Internal workflow status used for compatibility and overdue checks. |
| `priority` | Scan/sorting priority. |
| `deadline` | Optional date-only deadline. |
| `officialProgressState` | Internal reviewed progress state: `no_progress`, `in_progress`, `needs_changes`, or `completed`. User-facing assignment state is derived from this plus pending reviews and overdue state. |
| `assignees` | Assigned active student users. |
| `progressUpdateCount` | Number of submissions against this assignment. |
| `pendingReviewCount` | Number of pending submissions for this assignment. |
| `isOverdue` | True when deadline has passed and the assignment is neither workflow-done nor officially completed. |

Progress submission DTO fields include `projectId`, `projectName`, `taskId`, and `taskTitle` so dashboard and project feeds can render the owning project and assignment without depending on a separate project list. Submission title, description, blockers, and review comments are trimmed before persistence; revision/rejection reviews require a non-empty comment.

## Data Model

| Table | Important Fields | Purpose |
| --- | --- | --- |
| `tasks` | `project_id`, `parent_task_id`, `milestone_id`, `title`, `description`, `status`, `priority`, `deadline`, `official_progress_state` | Stores assignments. Active assignment queries require `parent_task_id IS NULL`; `parent_task_id` is historical schema only; active assignments require `milestone_id`. |
| `task_assignees` | `project_id`, `task_id`, `student_id`, unique task/student pair | Stores assignment to active project students and is constrained to current project membership. |
| `project_members` | `project_id`, `student_id` | Determines assignment eligibility and student project access. |
| `project_milestones` | `project_id`, `title`, `sort_order` | Required planning checkpoint for assignments. |
| `progress_updates` | `project_id`, `task_id`, `submitted_by`, `review_status` | Student submissions and pending review counts; same-project task FK, assigned-active-student submitter trigger, and one-pending-submission uniqueness are enforced in the database. |
| `progress_reviews` | `progress_update_id`, `official_progress_state` | Review decisions that can change reviewed assignment progress. |

Relevant migrations:

| Migration | Role |
| --- | --- |
| `20260601000100_init_mvp.sql` | Creates `tasks`, `task_assignees`, `progress_updates`, and initial task state constraints. |
| `20260603000200_task_deadlines_date.sql` | Converts task deadlines from timestamp to `DATE`. |
| `20260606000200_project_milestones.sql` | Adds `tasks.milestone_id` and project milestones. |
| `20260608000100_milestone_required_assignments.sql` | Migrates existing standalone assignments into generated milestones, requires milestone links for top-level assignments, and prevents milestone deletion from unlinking assignments. |
| `20260619000100_assignment_submission_integrity.sql` | Adds project-aware assignment FKs, same-project submission FK, and one-pending-submission uniqueness. |

## Backend Implementation Map

| File | Responsibility |
| --- | --- |
| `apps/api/internal/app/server.go` | Registers protected task routes. |
| `apps/api/internal/app/tasks.go` | Task handlers, validation, task DTO queries, batched assignee loading for list DTOs, assignment validation, submissions, review handlers, and state sync. |
| `apps/api/internal/app/permissions.go` | `canViewProject` and `canManageProject` relationship checks. |
| `apps/api/internal/app/types.go` | `TaskDTO` and `TaskDetailDTO`. |
| `apps/api/internal/app/lifecycle_test.go` | Regression tests for assignment create/update validation, permissions, submissions, review, and legacy child-row exclusion. |

Important functions:

| Function | What It Does |
| --- | --- |
| `handleListTasks` | Requires project view access and returns assignments only. |
| `handleCreateTask` | Requires project manager access and creates assignments after a locked active-project lifecycle re-check. |
| `handleGetTask` | Rejects malformed task IDs, requires project view access, and returns assignment details with submissions. |
| `handleUpdateTask` | Rejects malformed task IDs, requires project manager access, locks project lifecycle, reads the target assignment row with `FOR UPDATE`, applies partial assignment updates without stale omitted fields, and blocks manual completion while pending submissions exist. |
| `createTask` | Assignment creation helper with title, state, deadline, transaction-scoped milestone validation, assignee validation, and transaction-scoped lifecycle locking. |
| `insertTaskAssignees` | Validates active student project membership before inserting assignments. |
| `loadTaskAssigneesForTasks` | Hydrates task-list assignees in one query to avoid per-assignment list queries. |
| `taskSelectSQL` | Produces task DTO fields and rollup counts. |
| `ensureMainTaskInProject` | Confirms a task is an assignment and belongs to the requested project. |
| `handleCreateProgressUpdate` | Rejects malformed task IDs, then creates a trimmed student submission after locked active-project lifecycle, task-state, assignment-membership, project-membership, and active-student re-checks, then marks the internal task workflow as `submitted`. |
| `handleReviewProgressUpdate` | Rejects malformed progress-update IDs, re-checks review lifecycle and manager authority under the project lock, locks assignment-scoped pending submissions only, saves one review, requires guidance for revision/rejection, returns `409` for already-reviewed submissions, and syncs reviewed progress plus internal task workflow from the teacher decision. |

Project lifecycle gates used by assignments:

| Project Status | Create Assignment | Edit Assignment | Submit Work | Review Pending Work |
| --- | --- | --- | --- | --- |
| `active` | Yes | Yes | Yes | Yes |
| `on_hold` | No | Yes | No | Yes |
| `completed` | No | No | No | Yes |
| `archived` | No | No | No | No |

## Frontend Implementation Map

| File | Responsibility |
| --- | --- |
| `apps/web/src/features/projects/pages/project-detail-page.tsx` | Grouped assignment-first Work Plan, milestone-scoped assignment creation dialog, role-aware assignment filters/search, inline assignment resource actions, centered resource dialog, and neutral header team popover. |
| `apps/web/src/features/tasks/assignment-state.ts` | Derives one user-facing assignment state from task DTO fields. |
| `apps/web/src/features/tasks/pages/task-detail-page.tsx` | Structured assignment header, guarded edit-data loading, teacher review desk with sticky compact decision panel, support-data loading/error notices, student workbench/read-only states, brief/context panels, centered resource dialog, and history feed. |
| `apps/web/src/features/tasks/components/task-forms.tsx` | Assignment create form, compact edit form, scroll-safe non-sticky action footers, searchable capped assignee options, submission form, compact/standard three-decision review form backed by native radio inputs, and stale 403/409 refresh handling. |
| `apps/web/src/features/tasks/components/progress-timeline.tsx` | Clean divider-based history feed with blockers, inline submission links, review-status-specific history tones, visible evidence panels, configurable title/empty copy, and optional inline review form for non-review-desk contexts. |
| `apps/web/src/features/tasks/components/task-table.tsx` | Dashboard assignment table rows. |
| `apps/web/src/features/tasks/api.ts` | Task REST client functions for assignment endpoints. |
| `apps/web/src/lib/query-invalidation.ts` | Shared project invalidation and stale `403`/`409` refresh helpers used by assignment forms. |
| `apps/web/src/types/api.ts` | `Task` and `TaskDetail` frontend types. |

## Assignment Creation Flow

```mermaid
flowchart TD
  A[Teacher or admin opens project] --> B[New assignment dialog]
  B --> C[Fill title, priority, deadline]
  C --> D[Required milestone]
  D --> E[Assign active project students]
  E --> F[POST /projects/:projectId/tasks]
  F --> G{Valid manager and payload?}
  G -- No --> H[Show validation error]
  G -- Yes --> I[Lock project lifecycle in transaction]
  I --> J[Recheck milestone in locked transaction]
  J --> K[Create assignment and assignees]
  K --> L[Refresh assignments, project, milestones, workspace, dashboard]
```

## Assignment Detail Flow

```mermaid
flowchart TD
  A[User opens assignment route] --> B[ProtectedLayout verifies active session]
  B --> C[GET /projects/:projectId/tasks/:taskId]
  C --> D{Can view project?}
  D -- No --> E[Forbidden state]
  D -- Yes --> F{Pending review and reviewer?}
  F -- Yes --> G[Render teacher review desk]
  G --> H[Submission under review]
  G --> I[Sticky decision panel]
  F -- No --> J[Render student/read-only workbench]
  J --> K{Role and assignment state}
  K -- Assigned student can submit --> L[Submit or revise action]
  K -- Assigned student waiting review --> M[Waiting review state]
  K -- Other viewer/lifecycle closed --> N[Read-only assignment]
  G --> O[History feed without duplicating current submission]
  J --> O
```

## Review Decision Support Flow

```mermaid
flowchart TD
  A[Teacher opens pending submission] --> B[Load task detail]
  B --> C[Load project resources and evidence files]
  C --> D{Support data loaded?}
  D -- Loading/error --> E[Show support-data notice]
  E --> F[Disable Save review]
  D -- Yes --> G[Enable decision form]
  G --> H[POST review]
  H --> I[Lock project lifecycle]
  I --> J[Recheck manager authority]
  J --> K[Lock pending submission and task]
  K --> L[Write one review and sync assignment state]
```

## Access Matrix

| User and Relationship | List Assignments | Create/Edit Assignment | View Assignment Detail | Submit Work |
| --- | --- | --- | --- | --- |
| Admin | Yes | Yes | Yes | Denied |
| Supervising teacher | Yes | Yes | Yes | Denied |
| Other teacher | Denied | Denied | Denied | Denied |
| Assigned student project member | Yes | Denied | Yes | Yes |
| Unassigned student project member | Yes | Denied | Yes | Denied |
| Student non-member | Denied | Denied | Denied | Denied |
| Signed-out user | `401` | `401` | `401` | `401` |

## Cache And Refresh Behavior

| Trigger | Invalidated Query Keys |
| --- | --- |
| Create assignment | `projectTasks(projectId)`, `project(projectId)`, `projectMilestones(projectId)`, `projects`, `classes`, `dashboard` |
| Edit assignment | `task(projectId, taskId)`, `projectTasks(projectId)`, `project(projectId)`, `projectMilestones(projectId)`, `projects`, `classes`, `dashboard` |
| Submit work | `task(projectId, taskId)`, `projectProgress(projectId)`, `project(projectId)`, `projectTasks(projectId)`, `projectMilestones(projectId)`, `projects`, `classes`, `dashboard` |
| Review progress | `task(projectId, taskId)`, `projectProgress(projectId)`, `project(projectId)`, `projectTasks(projectId)`, `projectMilestones(projectId)`, `projects`, `classes`, `dashboard` |

Stale `403` or `409` assignment mutations refresh affected project data through the shared frontend invalidation helpers instead of leaving rejected submit/edit/review affordances visible.

## Tests

Backend lifecycle coverage includes:

| Test | Coverage |
| --- | --- |
| `TestOfficialTaskLifecycleValidationAndPermissions` | Assignment create/update permissions, required milestone, invalid deadline, invalid assignee, valid create payload, and clearing optional fields. |
| `TestStudentProgressRequiresAssignedOfficialTask` | Student submissions require assignment to the parent task; duplicate pending submissions and completed-assignment submissions are rejected; submission syncs task workflow to `submitted`. |
| `TestStudentProgressRechecksAssignmentAfterLifecycleLock` | Submission rechecks active assigned-student eligibility after waiting on the project lifecycle lock and rejects a concurrent unassignment race. |
| `TestAssignmentCompletionRequiresPendingReviewResolution` | Manual assignment completion is rejected while a pending submission still needs review. |
| `TestProgressReviewRejectsContradictionsAndDuplicateReviews` | Reviews reject contradictory progress states, require guidance for revision, block duplicate final reviews, and sync completed reviews to internal `done`. |
| `TestProgressReviewRechecksManagerAfterLifecycleLock` | Review writes recheck current manager authority after waiting on the project lock and reject a concurrent supervisor reassignment race. |
| `TestChildTaskProgressIsExcludedFromAssignmentSurfaces` | Historical child-task progress is excluded from project progress feeds, project/dashboard pending-review counts, dashboard review queues, review writes, evidence uploads, and resource targets. |
| `TestOnHoldProjectBlocksNewWorkButAllowsManagerMaintenance` | On-hold projects block new assignments and student submissions but allow manager assignment edits. |
| `TestCompletedProjectAllowsPendingReviewsOnly` | Completed projects block assignment edits/submissions while allowing pending review. |
| `TestArchivedProjectIsReadOnlyExceptStatusChange` | Archived projects block review and other assignment-adjacent writes. |
| `TestLifecycleLockRejectsAssignmentAfterConcurrentCompletion` | Assignment creation waits on the project row and rejects if the project is completed before the write can proceed. |
| `TestAssignmentCreateRechecksMilestoneAfterLifecycleLock` | Assignment creation rechecks milestone membership after waiting on the project lifecycle lock, returning a clear invalid-milestone error if the checkpoint was removed. |
| `TestAssignmentPartialUpdatePreservesConcurrentMetadataChange` | Partial assignment updates read the current assignment row after waiting on the lifecycle lock and preserve concurrent metadata changes. |
| `TestMilestoneRollupAndTaskAssignment` | Cross-project milestone assignment is rejected, milestone/project rollups update from reviewed assignment progress, and milestones with assignments cannot be deleted. |
| `TestProjectOverdueCountIgnoresLegacyChildTasks` | Project overdue rollups count assignments and ignore historical child-task rows. |
| `TestTeacherCanRemoveProjectMember` | Removing a project member also removes their task assignments. |

Manual verification should include:

- Teacher creates an assignment from project detail and assigns a student.
- Assigned student opens assignment detail and sees `Submit work` as the primary action.
- Teacher opens an assignment with a pending submission and sees `Review submission` as the primary action.
- Teacher reviews with `Accept progress`, `Mark complete`, and `Return for revision` decisions.
- Teacher edits assignment assignees, milestone, deadline, and priority.
- Unassigned student can view the assignment but cannot submit work.
- Teacher sees evidence/resource loading or error notices before saving a review.
- Returned/rejected review history uses revision/rejection wording rather than approved styling.

## Known Gaps And Risks

- Assignment deletion is not implemented. Add a deletion policy only after deciding how to preserve submissions, reviews, files, and resource history.
- Nested child work items are removed from the active product surface. The historical `tasks.parent_task_id` column remains in migrations, and active assignment/progress/review queries continue to require `parent_task_id IS NULL`.
- `status` and `officialProgressState` remain separate backend/API fields for compatibility, but normal UI now derives and shows one assignment state.
- `officialProgressState` can still be set through the manager update endpoint for API compatibility. User-facing state changes should happen through review decisions to keep review history meaningful.
- Frontend automated tests for assignment detail branching, create/edit form behavior, and review interactions are still needed.
- Returning work for revision remains allowed on on-hold/completed projects because pending reviews are allowed there; students can resubmit only after the project is active again.
- Form label/error accessibility can be tightened further across custom field primitives.
- Resource and file target relationships still rely on backend validation for polymorphic target types; assignment and submission project consistency are now database-enforced.
