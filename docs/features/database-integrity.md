# Database Integrity

This note explains the database hardening added after the schema audit.

## What Changed

| Area | Change | Why |
| --- | --- | --- |
| Assignment membership | `task_assignees` now stores `project_id` and has FKs to both `tasks(project_id, id)` and `project_members(project_id, student_id)`. | A task assignment must belong to the same project as the task, and the assigned student must still be a project member. Removing a member now also removes their assignment links at the database level. |
| Progress submissions | `progress_updates(project_id, task_id)` now references `tasks(project_id, id)`. | A submission can no longer claim one project while pointing at a task from another project. |
| Progress submitters | `progress_updates` inserts and project/task/submitter retargets now require the submitter to be an active student currently assigned to that project task. | The API already rechecks assigned active students in a transaction; direct database writes now get the same future-write backstop without rewriting historical submissions after member cleanup. |
| Pending submission limit | `progress_updates_one_pending_per_task_unique` allows only one `pending_review` submission per assignment. | The API already checks this, but the database now protects the invariant too. |
| Historical child task project scope | `tasks(project_id, parent_task_id)` now references `tasks(project_id, id)`. | The active product no longer exposes child work items, but retained historical child rows cannot drift across projects. |
| Folder/project ownership | Deferred triggers keep `course_section_projects` links aligned with `course_sections.owner_teacher_id = projects.supervisor_id`. | App handlers already validate this, but direct database writes and supervisor/folder-owner updates now preserve the invariant at transaction commit. |
| Support target project matching | Deferred triggers validate `resource_links` and `uploaded_files` targets against their `project_id`, and recheck support rows when target rows move or delete. | Resource/evidence targets are polymorphic, so trigger helpers now provide a durable backstop against cross-project support rows and orphaned support metadata. |
| Reviewed support immutability | Deferred triggers block direct resource/evidence inserts, updates, and deletes for reviewed assignment submissions; reviewed submission status cannot be reverted. | Reviewed support is historical evidence, so direct database writes now follow the same immutability rule as the API while allowing full parent cleanup transactions. |
| Dashboard scoping | Student dashboard submission queries now require current project membership. | A removed student should not continue seeing live project/task metadata from old submissions. |
| Query joins | Progress-update joins now match tasks by both `task_id` and `project_id`. | Queries now reflect the schema invariant and avoid accidental cross-project labels or counts. |

## Migration Notes

Source: `apps/api/db/migrations/20260619000100_assignment_submission_integrity.sql`

- Adds `tasks_project_id_id_unique` so composite FKs can reference task identity within a project.
- Backfills `task_assignees.project_id` from `tasks.project_id`.
- Deletes invalid assignment rows that no longer have a matching project member.
- Corrects existing `progress_updates.project_id` from the linked task when needed.
- Corrects progress-update `uploaded_files` and `resource_links` project ids after submission correction.
- Stops migration with a clear exception if duplicate pending submissions already exist, because that needs an explicit product decision before enforcing uniqueness.

Source: `apps/api/db/migrations/20260620000100_folder_and_task_integrity.sql`

- Stops migration with a clear exception if any existing child task points at a parent from another project.
- Adds `tasks_project_parent_task_fk` to enforce same-project historical child-task relationships.
- Stops migration with a clear exception if any existing folder/project link has a folder owner that differs from the project supervisor.
- Adds `ensure_course_section_project_owner_matches()` with deferred constraint triggers on `course_section_projects`, `projects.supervisor_id`, and `course_sections.owner_teacher_id`.
- Uses deferred triggers so legitimate account-transition transactions can reassign linked projects and active folders together, while single-statement drift still fails at commit.

Source: `apps/api/db/migrations/20260621000100_support_target_integrity.sql`

- Stops migration with a clear exception if existing resource links or uploaded-file metadata point at invalid support targets.
- Adds `support_resource_link_target_matches_project()` and `support_uploaded_file_target_matches_project()` helper functions for polymorphic project/target validation.
- Adds deferred constraint triggers on `resource_links` and `uploaded_files` inserts/target updates.
- Adds deferred recheck triggers on milestones, tasks, progress updates, and resource links so direct target moves/deletes cannot leave orphaned or cross-project support rows at commit.

Source: `apps/api/db/migrations/20260621000200_reviewed_support_immutability.sql`

- Adds `support_progress_update_is_reviewed()` for reviewed assignment-submission support checks.
- Adds deferred constraint triggers that reject direct resource-link and uploaded-file inserts, updates, or deletes when the support target is a reviewed submission.
- Adds a review-status finality trigger so reviewed `progress_updates.review_status` rows cannot be reverted by direct SQL.
- Keeps parent cleanup possible by deferring support delete checks; deleting the reviewed submission and its support rows in the same transaction can still commit.

Source: `apps/api/db/migrations/20260621000300_progress_submitter_integrity.sql`

- Adds `ensure_progress_update_submitter_assigned()` for future progress submissions and retargets.
- Blocks inserts and updates of `project_id`, `task_id`, or `submitted_by` unless the submitter is an active student assigned to the project task.
- Does not fire when later member or assignment cleanup removes current assignment rows, preserving historical submissions.

## Code Notes

- `apps/api/internal/app/tasks.go` writes `project_id` when assigning students and uses project-aware submission joins.
- `apps/api/internal/app/projects.go` removes assignments by `(project_id, student_id)` during member removal and provides the transaction-scoped project lifecycle lock helper used by project-scoped writes.
- `apps/api/internal/app/dashboard.go` prevents removed students from seeing old submission metadata on the dashboard.
- `apps/api/internal/app/resources.go` and `apps/api/internal/app/files.go` validate progress-update labels and uploads through project-aware joins.
- `20260621000100_support_target_integrity.sql` backs up resource/evidence target validation with deferred database triggers for direct writes and target-row drift.
- `20260621000200_reviewed_support_immutability.sql` backs up reviewed-support immutability and final review status with database triggers.
- `20260621000300_progress_submitter_integrity.sql` backs up progress submitter eligibility for future direct writes.
- `apps/api/cmd/seed/main.go` and lifecycle test helpers now insert project-aware task assignees.
- `apps/api/internal/app/classes.go` and `apps/api/internal/app/projects.go` still perform user-facing folder/supervisor validation before writes; the database trigger is the durable backstop for direct writes and multi-row transitions.

## Test Coverage

| Test | Coverage |
| --- | --- |
| `TestDatabaseRejectsCrossProjectChildTasks` | Database rejects child tasks whose parent task belongs to another project while preserving same-project historical child rows. |
| `TestDatabaseRejectsMismatchedFolderProjectLinks` | Database rejects mismatched direct folder links, project supervisor updates, and folder owner updates. |
| `TestDatabaseRejectsCrossProjectSupportTargets` | Database rejects cross-project resource/evidence target inserts and blocks direct target moves/deletes that would orphan support metadata. |
| `TestDatabasePreservesReviewedSubmissionSupport` | Database rejects direct reviewed-support inserts, updates, deletes, target retargets, and review-status reverts while allowing full parent cleanup. |
| `TestDatabaseRejectsUnassignedProgressSubmitter` | Database rejects future progress submissions from unassigned students and allows the insert after task assignment. |
| `TestAdminRoleChangeRequiresTeacherResponsibilityReassignment` | Account transition can reassign a linked project and active folder together under deferred folder-owner triggers. |
| Existing assignment/submission lifecycle tests | Cover project-aware task assignees, pending submission uniqueness, project-aware progress joins, and removed child-task progress exclusion. |

Playwright coverage:

| Evidence | Coverage |
| --- | --- |
| `apps/web/e2e/database-integrity.spec.ts` | Browser verifies an admin folder detail candidate search exposes matching-supervisor projects but hides cross-supervisor standalone projects. |
| `/tmp/opencode/unitrack-a13-audit-20260620/` | A13 audit screenshot and `report.json` showing the matching candidate, hidden mismatched candidate, and `400` API rejection for cross-owner folder link. |

## Remaining Risks

- Resource/file targets remain polymorphic rather than declarative foreign keys; keep trigger helper functions updated if support target types change.
- Reviewed resource/evidence immutability is now trigger-backed for normal direct writes; operational repair scripts must delete or repair parent/support rows deliberately in one transaction.
- Progress submitter validation is trigger-backed for new and retargeted rows only; historical submissions can remain after current assignment/member cleanup.
- Existing project-scoped lifecycle writes now re-check status under transaction-scoped project-row locks; future write handlers must keep using the locked helper.
- The last-active-admin invariant is serialized in account-management code, not represented as a database constraint.
- Folder owner/project supervisor matching now has a deferred database trigger, but existing folder owner transfer is still not exposed in the UI.
