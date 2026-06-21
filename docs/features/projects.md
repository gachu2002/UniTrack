# Projects Onboarding

This document explains the current UniTrack Projects feature for engineers who need to maintain or extend project records, project cards, and folder assignment.

## Purpose

Projects are the primary product object in UniTrack. Teachers supervise project work, students submit work against their assignments (official tasks internally), and folders only organize projects inside the `Workspace` surface.

The current Projects slice provides:

- Role-scoped project listing.
- Project create, detail, and edit flows.
- Optional folder assignment through `classId`.
- Project date range, status, topic, description, and progress summary fields.
- Project DTO rollups for members, assignments, milestones, overdue work, pending reviews, and planned progress.
- Project cards used by workspace, folder detail, and project discovery surfaces, with show-more guards and server-filtered standalone-project loading for large fake-data sets.
- Project detail command header with lifecycle/progress status labels, compact lifecycle warnings, edit action, and low-emphasis team trigger.
- Compact mission-control strip with health metrics and up to three lifecycle-aware next actions before the full checkpoint ledger.
- Assignment-first `Work Plan` section as one grouped checkpoint ledger with dialog-based checkpoint creation, atomic checkpoint reorder, role-aware assignment filters, search, compact rows, progress bars, quiet default resource actions, and a manager-only `Manage plan` mode for add/reorder/edit/delete controls.
- Quiet side rail for project details, progress summary, and project-level reference links that stays below the work plan on standard desktop widths and becomes sticky only on very wide layouts; assignment planning still renders if reference-link loading fails.
- Project team entry point through a low-emphasis header `Team` trigger with count, direct student add, and member management.

Folder behavior is documented in `docs/features/workspace-project-folders.md`. Project access rules are documented in `docs/features/protected-access.md`.

## Current Status

| Capability                     | Status          | Notes                                                                                                            |
| ------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------- |
| Project list                   | Implemented     | Admin sees all, teachers see supervised projects, students see member projects; API list requests are capped at 200. |
| Project detail                 | Implemented     | Relationship-scoped read with project rollup DTO.                                                                |
| Project create                 | Implemented     | Teacher/admin only; admin can provide `supervisorId` through API.                                                |
| Project edit                   | Implemented     | Admin or supervising teacher only.                                                                               |
| Optional folder assignment     | Implemented     | Create/update accepts `classId`; empty update `classId` removes folder link.                                     |
| Date range validation          | Implemented     | Date-only values must parse and end date cannot be before start date.                                            |
| Project lifecycle status       | Implemented     | Status is one of `active`, `on_hold`, `completed`, `archived`; backend gates project-scoped writes by status and re-checks existing write routes under transaction-scoped project-row locks. |
| Stale lifecycle/permission refresh | Implemented | Project forms, checkpoint actions, team mutations, and project resource dialogs refresh affected project/workspace data after stale `403` or `409` mutation failures. |
| Project rollups                | Implemented     | DTO includes assignment/milestone progress, overdue count, pending review count, and last approval; historical child-task progress is excluded. |
| Team popover integration       | Implemented     | Project detail keeps team management in a low-emphasis header trigger with durable count, supervisor, searchable members, inactive account markers, direct student add, role toggles, removal, and one project leader maximum. |
| Project detail dossier         | Implemented     | Project detail shows labeled lifecycle/progress status, concise meta, compact lifecycle copy, edit/team actions, a compact mission-control strip, and quiet detail/reference cards below the work plan until very wide desktop layouts. |
| Project resources              | Implemented     | Project detail exposes project-level links in the reference card and only shows checkpoint/assignment resource row actions by default when resources exist; all management remains backed by the centered resource dialog. |
| Project plan presentation      | Implemented     | Project detail leads with a compact mission-control strip, then uses one assignment-first `Work Plan` ledger grouped by checkpoint with role-aware filters/search/caps, compact assignment rows, warning-only review/overdue cues, progress bars, atomic checkpoint reorder, app-confirmed checkpoint delete, and manager controls hidden behind `Manage plan`. |
| Reference link dependency      | Implemented     | Project-level and row-level resource links are optional data for the project dossier; Work Plan rendering no longer waits on successful resource-link loading. |
| Folder-like project cards      | Implemented     | Project cards use compact folder-like units with a narrower, slightly taller grid ratio, assignment copy for task-derived counts, no redundant `Project` stamp, and 36-card initial grids with a show-all control. |
| Existing-project folder add UI | Implemented     | Folder detail uses an inline search control backed by server-filtered standalone candidates and reveals matches while typing. |
| Project deletion               | Not implemented | Out of current scope; projects can be archived.                                                                  |
| Frontend automated tests       | Missing/partial | Backend lifecycle coverage is strong; frontend project/card/folder tests are still needed.                       |

## User-Facing Behavior

| User action                               | Expected result                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| Teacher opens `/workspace`                | Sees supervised projects, grouped by folders plus standalone projects.                    |
| Student opens `/workspace`                | Sees project cards for projects they belong to.                                           |
| Teacher creates a standalone project      | Project is created without folder context and appears in standalone projects.             |
| Teacher creates a project inside a folder | Project is linked to that active owned folder.                                            |
| Teacher edits project metadata            | Project record, lists, folder rollups, and dashboard summaries refresh; date-order validation is shown inline on the end date field. |
| Teacher moves project between folders     | Existing folder link is replaced with the target folder link.                             |
| Teacher removes project from folder       | Project returns to standalone projects when the project is not archived; archived projects hide this action until reactivated. |
| Student opens assigned project            | Project detail loads but management actions are hidden/blocked.                           |
| Any project viewer opens detail           | Header labels lifecycle/progress status, the mission-control strip summarizes health and next actions, the grouped `Work Plan` remains visible on the first desktop viewport, and detail/reference cards stay below the board. |
| Teacher/admin opens a non-archived project with review debt | Mission control links directly to the top pending reviews, overdue follow-ups, and outstanding revisions while the Work Plan still offers `Needs review` and `Overdue` filters. |
| Student opens a project with assigned work | Mission control highlights active revisions, overdue work, waiting reviews, or next assignment only while the project accepts student work; archived/read-only projects show no active next-action CTA. |
| Manager wants to edit the plan             | `Manage plan` reveals checkpoint creation, assignment add buttons, reorder controls, edit/delete actions, and zero-resource row targets; default reading mode hides that tool noise. |
| Viewer searches assignments               | The grouped ledger shows only checkpoints with matching assignment rows unless the all/empty view is active. |
| Manager creates a checkpoint              | A centered dialog opens for checkpoint title, target date, and guidance instead of inserting an inline form into the work board. |
| Manager reorders checkpoints              | Up/down controls send one atomic milestone order payload, so partial browser requests cannot leave duplicate or stale sort positions. |
| Manager edits a checkpoint                | Clearing guidance or target date sends an explicit empty value and clears the saved field. |
| Reference links fail to load              | The Work Plan remains usable and shows a retryable reference-link warning instead of replacing the assignment board with an error. |
| Any project viewer opens an assignment row | The assignment title is the route link; there is no separate redundant `Open` button. |
| Any project viewer opens team             | Low-emphasis header `Team` trigger with a count opens a popover with supervisor, searchable students, and management controls when allowed. |
| Non-member student opens project          | Backend returns `403`; frontend shows a restricted state.                                 |
| Teacher opens another teacher's project   | Backend returns `403`; frontend shows a restricted state.                                 |
| Admin opens existing project              | Admin can view/update the project, subject to folder supervisor-owner rules for movement. |
| Manager archives a project                | Project remains readable but becomes read-only except for status reactivation.             |
| Manager puts a project on hold            | Student submissions and new assignments stop; managers can maintain plans, team, and resources. |
| Manager completes a project               | New work, resources, and team changes stop; pending submissions can still be reviewed.    |
| Manager clicks a stale action after lifecycle or permission changed elsewhere | Backend returns `403` or `409`, and the frontend refreshes project/workspace data so obsolete controls disappear. |

## Project Lifecycle Semantics

`project.status` is manual lifecycle state. It does not replace `officialProgressState`, which remains a rollup derived from reviewed assignments.

| Status | Product Meaning | Backend Write Behavior |
| --- | --- | --- |
| `active` | Normal live project. | All current project, plan, team, resource, submission, review, and evidence actions are allowed when relationship permissions pass. |
| `on_hold` | Temporarily paused project. | Managers can edit metadata, milestones, assignment details, team, resources, and evidence cleanup; new assignments and student submissions are blocked. |
| `completed` | Finished project retained as a record. | Metadata/status updates and pending submission reviews are allowed; plan, team, resource, submission, and evidence writes are blocked. |
| `archived` | Historical read-only record. | Reads remain allowed; only status-only project update requests can reactivate or change lifecycle state. |

Lifecycle status also affects attention and rollups: overdue assignment counts apply only to active projects, and archived projects do not surface pending-review attention or review next-action CTAs.

Existing project-scoped write handlers use two checks: an early lifecycle preflight for user-facing errors, then a transaction-scoped `SELECT ... FOR UPDATE` project status re-check before mutating data. Project status updates lock the same project row, so completion/archive transitions serialize with assignments, submissions, reviews, members, resources, evidence metadata, milestones, and folder movement.

## API Contract

Base path: `/api/v1`

| Method  | Endpoint                | Access          | Request                             | Success            | Common Errors              |
| ------- | ----------------------- | --------------- | ----------------------------------- | ------------------ | -------------------------- |
| `GET`   | `/projects`             | Authenticated   | Optional `limit` capped at 200, `unassigned=true` | `200` project list | `400`, `401`, `500`        |
| `POST`  | `/projects`             | Teacher/admin   | Project create DTO                  | `201` project DTO  | `400`, `401`, `403`, `500` |
| `GET`   | `/projects/{projectId}` | Project viewer  | Cookie only                         | `200` project DTO  | `400`, `401`, `403`, `404` |
| `PATCH` | `/projects/{projectId}` | Project manager | Partial project update DTO          | `200` project DTO  | `400`, `401`, `403`, `404`, `409` |
| `PATCH` | `/projects/{projectId}/milestones/reorder` | Project manager | `{ "milestoneIds": string[] }` containing every project checkpoint in desired order | `200` milestone DTO list | `400`, `401`, `403`, `409` |

Malformed project and milestone path IDs return `400` before UUID-column database casts; well-formed but missing milestone IDs return handler-specific `404` when the user can manage the project.

Create DTO fields:

| Field          | Required                | Meaning                                                        |
| -------------- | ----------------------- | -------------------------------------------------------------- |
| `name`         | Yes                     | Project display name.                                          |
| `description`  | No                      | Longer project description.                                    |
| `topic`        | No                      | Short topic/product/research focus.                            |
| `classId`      | No                      | Folder ID; must be active and owned by the project supervisor. |
| `supervisorId` | Admin API only optional | Defaults to current user for teachers.                         |
| `startDate`    | No                      | Date-only `YYYY-MM-DD`.                                        |
| `endDate`      | No                      | Date-only `YYYY-MM-DD`; cannot precede `startDate`.            |
| `status`       | No                      | Defaults to `active`.                                          |

Update DTO fields:

| Field             | Meaning                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| `name`            | New project name; cannot become blank.                                 |
| `description`     | New description; empty string clears it.                               |
| `topic`           | New topic; empty string clears it.                                     |
| `classId`         | New folder ID; empty string removes folder link; omitted leaves as-is. |
| `startDate`       | New start date; empty string clears it.                                |
| `endDate`         | New end date; empty string clears it.                                  |
| `status`          | New project lifecycle status; archived projects accept status-only updates. |
| `progressSummary` | Teacher/admin-maintained supervision summary.                          |

Project DTO rollup fields:

| Field                                 | Meaning                                                                                |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `classId`, `classTitle`, `classColor` | Folder context when assigned.                                                          |
| `memberCount`                         | Number of project members.                                                             |
| `taskCount`                           | Number of active assignments.                                                          |
| `completedTaskCount`                  | Assignments with completed reviewed progress.                                          |
| `inProgressTaskCount`                 | Assignments in progress.                                                               |
| `needsChangesTaskCount`               | Assignments needing revision.                                                          |
| `milestoneCount`                      | Number of project milestones.                                                          |
| `completedMilestoneCount`             | Milestones whose assignments are all completed.                                        |
| `plannedProgressPercent`              | Milestone completion percent when milestones exist; otherwise assignment completion percent. |
| `overdueTaskCount`                    | Overdue assignments counted only while the project is `active`.                         |
| `pendingReviewCount`                  | Pending submissions across non-archived projects.                                      |
| `lastApprovedUpdateAt`                | Most recent approved progress review timestamp.                                        |

## Data Model

| Table                     | Important Fields                                                                           | Purpose                                             |
| ------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `projects`                | `id`, `name`, `description`, `topic`, `supervisor_id`, dates, `status`, `progress_summary` | Core project metadata.                              |
| `project_members`         | `project_id`, `student_id`, `member_role`, `joined_at`                                     | Student project membership, member count, and one-leader-per-project state. |
| `course_section_projects` | `course_section_id`, `project_id`, `added_by`, unique `project_id`                         | One-folder-per-project assignment.                  |
| `course_sections`         | `id`, `title`, `color`, `owner_teacher_id`, `status`                                       | Folder context and assignment validation.           |
| `tasks`                   | `project_id`, `parent_task_id`, `milestone_id`, `official_progress_state`, `deadline`, `status` | Assignment progress, counts, and overdue rollups; active assignments require `parent_task_id IS NULL` and `milestone_id`. |
| `project_milestones`      | `project_id`, `sort_order`, dates                                                          | Milestone count and planned progress rollups.       |
| `progress_updates`        | `project_id`, `task_id`, `review_status`, timestamps                                       | Pending review rollups and progress freshness with same-project task consistency. |
| `progress_reviews`        | `progress_update_id`, `review_status`, `reviewed_at`                                       | Last approved update and stale-progress indicators. |

## Backend Implementation Map

| File                                      | Responsibility                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/api/internal/app/server.go`         | Registers protected project routes.                                                                |
| `apps/api/internal/app/projects.go`       | Project list/create/detail/update, project DTO scanning, project rollups, and members.             |
| `apps/api/internal/app/milestones.go`     | Project milestone CRUD, malformed milestone route-ID validation, atomic checkpoint ordering, guarded delete, milestone rollups, and transaction-scoped partial update reads. |
| `apps/api/internal/app/permissions.go`    | Project viewer/manager/create permission helpers.                                                  |
| `apps/api/internal/app/classes.go`        | Folder usability and supervisor-owner checks used by project folder assignment.                    |
| `apps/api/internal/app/types.go`          | `ProjectDTO`, `ProjectMemberDTO`, and related DTOs.                                                |
| `apps/api/internal/app/lifecycle_test.go` | Backend regression coverage for project permissions, member lifecycle, folder assignment, rollups. |

Important functions:

| Function                     | What It Does                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `handleListProjects`         | Parses list filters and returns role-scoped project DTOs.                                 |
| `handleCreateProject`        | Validates create input, optional folder, supervisor, dates, status, then inserts project. |
| `handleGetProject`           | Requires project view permission and returns a project DTO.                               |
| `handleUpdateProject`        | Requires project management permission, locks the project row, then updates metadata/status and moves/unlinks folder. |
| `handleReorderMilestones`    | Requires project management permission, validates a complete project checkpoint order, and updates all sort orders in one transaction. |
| `listProjectsFiltered`       | Applies admin/teacher/student and unassigned filters.                                     |
| `projectSelectSQL`           | Selects project metadata plus folder context and aggregate rollups.                       |
| `scanProject`                | Maps SQL rows into `ProjectDTO` and applies rollup-derived progress state.                |
| `applyProjectProgressRollup` | Derives planned progress percent and official progress state.                             |
| `ensureSupervisor`           | Validates an active teacher/admin supervisor.                                             |
| `requireProjectLifecycle`    | Performs early project-status preflight checks for user-facing mutation errors.            |
| `requireProjectLifecycleTx` / `lockProjectLifecycleTx` | Re-checks project status under `SELECT ... FOR UPDATE` inside mutation transactions. |
| `canViewProject`             | Allows admin existing-project, teacher-supervised, or student-member reads.               |
| `canManageProject`           | Allows admin existing-project or supervising-teacher writes.                              |

## Frontend Implementation Map

| File                                                                  | Responsibility                                                                            |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `apps/web/src/features/projects/api.ts`                               | Project REST calls, milestone reorder call, and input types.                              |
| `apps/web/src/features/projects/components/project-forms.tsx`         | Project create/edit forms, folder selector, validation, query invalidation, and stale `403`/`409` refresh handling. |
| `apps/web/src/features/projects/components/create-project-dialog.tsx` | Create dialog with folder-aware description.                                              |
| `apps/web/src/features/projects/components/project-card.tsx`          | Compact folder-like project cards and 36-card show-more grids used in workspace and folder detail. |
| `apps/web/src/features/projects/components/project-table.tsx`         | Dashboard/project table view for attention queues.                                        |
| `apps/web/src/features/projects/pages/project-detail-page.tsx`        | Project dossier, labeled command header, compact mission-control strip, grouped assignment-first `Work Plan`, manage-plan mode, dialog checkpoint creation, atomic checkpoint reorder, role-aware assignment filters/search, non-blocking reference-link warning, detail/reference cards, capped team popover results, stale-error refreshes, quiet resource actions, and keyed centered resource dialog. |
| `apps/web/src/lib/query-invalidation.ts`                              | Shared project/workspace invalidation and stale `403`/`409` refresh helpers.              |
| `apps/web/src/features/classes/pages/class-detail-page.tsx`           | Folder detail project cards and searchable add-existing-project flow.                     |
| `apps/web/src/features/workspace/pages/workspace-page.tsx`            | Workspace project/folder landing page and standalone project tray.                        |
| `apps/web/src/features/projects/attention.ts`                         | Project attention helpers used by dashboard, workspace, and folder detail sorting.        |
| `apps/web/src/types/api.ts`                                           | Project and related frontend API types.                                                   |

## Create And Update Flow

```mermaid
flowchart TD
  A[Teacher/admin submits project form] --> B[Frontend validates name, date order, status]
  B --> C[POST or PATCH /api/v1/projects]
  C --> D[requireAuth]
  D --> E{Can create/manage project?}
  E -- No --> F[403 forbidden]
  E -- Yes --> G[Validate name, status, dates]
  G --> H[PATCH locks existing project row; POST creates a new row]
  H --> I{classId supplied?}
  I -- No --> J[Create/update project only]
  I -- Empty on update --> K[Delete folder link]
  I -- Yes --> L[Validate active usable folder]
  L --> M{Folder owner matches supervisor?}
  M -- No --> N[400 supervisor must own folder]
  M -- Yes --> O[Insert/update folder link]
  J --> P[Return project DTO]
  K --> P
  O --> P
```

## List And Detail Flow

```mermaid
flowchart TD
  A[Client loads projects] --> B[GET /projects]
  B --> C{User role}
  C -- Admin --> D[All projects]
  C -- Teacher --> E[projects.supervisor_id = user.id]
  C -- Student --> F[project_members contains user]
  D --> G{unassigned=true?}
  E --> G
  F --> G
  G -- Yes --> H[Exclude projects with folder links]
  G -- No --> I[No folder filter]
  H --> J[Order by updated_at desc]
  I --> J
  J --> K[Return project DTO list]
```

## Project Card And Folder Detail Flow

```mermaid
flowchart TD
  A[Folder detail loads folder projects and standalone candidates] --> B[Sort projects by attention]
  B --> C[Render compact folder-like project cards]
  C --> D[Project title or labeled Open action links to dossier]
  C --> E[Lifecycle-aware remove from folder action]
  A --> F[Render inline add-existing search control]
  F --> G[Type to reveal standalone candidate projects]
  G --> H[Select candidate from dropdown]
  H --> I[POST /classes/:classId/projects]
  I --> J[Invalidate folder, project, workspace, dashboard queries]
```

## Audit Notes

This slice was audited across backend logic, frontend implementation, UI composition, and tests.

Findings addressed during the audit pass:

| Finding                                                               | Resolution                                                                               |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Redundant `Project folder` label in folder header                     | Removed from folder detail header.                                                       |
| Project cards looked unlike folders and had redundant `Project` stamp | Project cards were redesigned as smaller folder-like project units.                      |
| Existing-project movement was hidden in a disclosure/select flow      | Replaced with an inline search-to-add control for standalone projects only.              |
| Move select could accidentally submit first project                   | Removed select-based movement entirely.                                                  |
| Awkward `unassigned` candidate copy                                   | Removed from folder-detail add flow; candidates are standalone-only.                     |
| Lingering class-facing copy                                           | Updated touched UI copy to folder terminology.                                           |
| Dashboard cache could stale after folder link/unlink                  | Added dashboard invalidation to folder link/unlink success handlers.                     |
| Project card progress could overflow with bad API data                | Clamped rendered progress width to `0..100`.                                             |
| Standalone projects were filtered after loading capped all-project lists | Workspace and folder-detail candidate flows now request `unassigned=true` before applying local search/sort. |
| Date-order validation was invisible on project forms                  | End-date fields now render the date-order validation error.                              |
| Archived folders exposed add/create project actions                   | Folder detail hides add/create controls and shows reactivation guidance while archived.  |
| Milestone edit clears were ignored                                    | Checkpoint edits now send empty values so guidance and target dates can be cleared.      |
| Selected-assignment search could remain active while hidden           | Removed the selected checkpoint panel; assignment search now belongs to the single grouped work-plan toolbar. |
| Assignment creation could open before members loaded                  | The project detail add-assignment action waits for the student list and reports load errors. |
| Date-only display could shift by timezone                             | Date-only strings now render through local-date parsing.                                 |
| Project detail visual hierarchy was unclear                           | Detail now uses a concise header, compact mission-control strip, first-viewport Work Plan, role-aware assignment filters, manage-plan mode, and quiet details/reference cards below the board. |
| Team drawer was abrupt and visually heavy                             | Replaced with a neutral header team trigger with icon, label, count, and popover. |
| Team panel consumed project-detail space                              | Team management now lives in the project command header popover instead of a right-side rail. |
| Header repeated status and showed a redundant archived next-action card | Header now shows status once, lifecycle copy is compact, and archived/completed projects without real work do not render a next-action strip. |
| Milestone/task rows were difficult to scan                             | Replaced with a compact command header, one grouped `Work Plan` ledger, warning-only review/overdue affordances, inline resource actions, and a centered resource dialog. |
| Multiple project leaders were possible                                | Added transactional demotion plus a partial unique database index for one leader maximum. |
| Lifecycle writes could race with completion/archive                    | Existing project-scoped mutations now re-check project status under transaction-scoped project row locks, and project update evaluates archived/status-only rules from the locked row. |
| Archived projects could show stale project-detail/folder actions       | Mission control suppresses archived review CTAs and folder detail hides archived project unlink buttons. |
| Browser checkpoint reorder used two independent PATCH requests          | Added `PATCH /projects/{projectId}/milestones/reorder` and updated Work Plan reorder controls to send one complete ordered ID list. |
| Sort-only checkpoint updates could overwrite concurrent metadata edits  | Milestone partial updates now lock the project, then read the current milestone row inside the same transaction before applying omitted fields. |
| Resource-link loading blocked the assignment board                      | Work Plan rendering now depends only on project tasks and milestones; failed reference links show a retryable warning while planning remains available. |

Backend audit outcome:

| Area                       | Result                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Project authorization      | No obvious gap found; access is role and relationship scoped.                                                        |
| Folder assignment          | Active-folder and supervisor-owner checks are present.                                                               |
| Rollups                    | Assignment rollups use active assignment rows, exclude historical child-task progress, and are covered by lifecycle tests. |
| Nonexistent project status | Current behavior usually returns `403` before `404`; decide if this is intentional access hiding before changing it. |

## Test Coverage

Backend lifecycle tests in `apps/api/internal/app/lifecycle_test.go` cover the current project behavior:

| Test                                              | Coverage                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `TestProjectRoutesEnforceMembershipAndSupervisor` | Teacher, other teacher, member student, non-member student, and admin project access.                   |
| `TestOnHoldProjectBlocksNewWorkButAllowsManagerMaintenance` | On-hold projects block new assignments/submissions while allowing manager maintenance. |
| `TestCompletedProjectAllowsPendingReviewsOnly` | Completed projects block new work/team/resource writes while allowing pending review. |
| `TestArchivedProjectIsReadOnlyExceptStatusChange` | Archived projects remain readable but block writes except status change. |
| `TestLifecycleLockRejectsAssignmentAfterConcurrentCompletion` | Assignment creation waits on the project row and rejects after a concurrent completion. |
| `TestLifecycleLockRejectsMetadataUpdateAfterConcurrentArchive` | Project metadata update waits on the project row and rejects after a concurrent archive. |
| `TestMilestoneSortUpdatePreservesConcurrentMetadataChange` | Sort-only milestone updates wait on the project row and preserve concurrent title/description changes. |
| `TestMilestoneReorderRequiresCompleteProjectOrder` | Atomic milestone reorder rejects partial, duplicate, and cross-project orders, then persists a valid full order. |
| `TestProjectMemberRoleLifecycleAndPermissions`    | Member role mutation is manager-only.                                                                   |
| `TestCreateProjectRejectsDirectMembers`           | Project creation rejects unsupported direct member assignment.                                          |
| `TestProjectCreationAllowsOptionalClass`          | Standalone project creation, folder-linked creation, unassigned filtering, and folder detail inclusion. |
| `TestProjectUpdateCanChangeClass`                 | Moving, rejecting archived/foreign folders, admin cross-owner rejection, and unlinking.                 |
| `TestProjectOverdueCountIgnoresLegacyChildTasks`  | Project overdue rollups ignore historical child-task rows.                                             |
| `TestCourseSectionRoutesEnforceTeacherOwnership`  | Folder/project movement enforces teacher ownership.                                                     |

Frontend automated coverage for project cards, folder detail movement, project forms, and project dossier rendering is still missing or minimal.

## Known Gaps And Risks

| Gap or Risk                                                         | Impact                                                                                                      |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Nonexistent project responses usually return `403`                  | Decide whether this is intentional access hiding or should become `404` for admins/managers.                |
| Project list browsing is still capped at 200 | Large teacher workspaces still need broader server-side search or pagination for the main standalone/project trays. |
| Frontend tests are sparse                                           | Project card, add-existing-project, form, and detail regressions can slip through.                          |
| Admin ownership UI is limited                                       | Admin backend capabilities exist, but ownership/supervisor correction is not a polished product surface.    |
| Project deletion is absent                                          | Users must archive instead of deleting; keep destructive delete out of scope unless explicitly requested.   |
| Project detail page is broad                                        | It aggregates many feature surfaces; keep future changes slice-based to avoid making it harder to maintain. |

## Maintenance Checklist

When adding or changing project behavior:

- Keep project routes protected with `requireAuth`.
- Use `canViewProject` for reads and `canManageProject` for manager writes.
- Keep students out of project create/update/member management paths.
- For project-scoped writes, keep the transaction-scoped project-row lifecycle re-check before mutating data.
- Validate date-only fields and date ordering on both frontend and backend.
- Validate folder assignment through active-folder access and supervisor-owner matching.
- Preserve one-folder-per-project semantics unless the database schema intentionally changes.
- Keep project DTO rollups aligned with assignment, review, and milestone lifecycle semantics.
- Keep checkpoint reorder as one transaction that includes every project checkpoint ID.
- Invalidate `dashboard`, `projects`, `project(id)`, `classes`, and relevant `class(...)` queries when project metadata, folder assignment, assignments, milestones, reviews, or members change.
- Refresh affected project/workspace queries after stale `403` or `409` mutation failures so lifecycle and permission affordances reconcile with the backend.
- Keep project card UI compact and folder-adjacent, but avoid redundant labels like `Project` when context already makes it clear.
- Add frontend tests for create/edit forms, folder movement, project card rendering, and restricted project states when frontend test coverage is expanded.
