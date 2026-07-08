# Assignment Review

Purpose: document milestone-scoped assignments, student submissions, teacher/admin reviews, assignment detail UI, and submission support behavior.

## User Problem

Students need one official place to submit progress for assigned work. Teachers need a reliable review desk that records decisions, preserves evidence, and advances assignment/project state without ambiguity.

## UI And Routes

| Route / Surface | Owns |
| --- | --- |
| `/workspace/projects/:projectId` | Work Plan assignment list/create affordances. |
| `/workspace/projects/:projectId/tasks/:taskId` | Assignment page, review desk, student workbench, timeline, resources/evidence. |

UI says assignment, submission, review, resource, and evidence. API/DB compatibility names still include `task`, `progress_update`, and `uploaded_files`.

UI may say checkpoint for planning context. API/DB/source compatibility names still include `milestone` and `project_milestones`.

## Rules

- Assignments are milestone-scoped, date-only, project-scoped, and assigned to active project students.
- Assignment create/update must recheck manager authority, lifecycle, milestone membership, assignee active membership/account state, and current row state inside locked transactions.
- Students can submit assignment-scoped work only when assigned, active, project member, and project/task state allows it.
- Direct progress submission rows are database-gated to official assignments; legacy child tasks cannot receive new submissions.
- Only one pending submission per assignment is allowed.
- Manual assignment completion is blocked while pending review exists.
- Managers review pending submissions once while the project is not archived; review authority is rechecked in the review transaction.
- Completed assignments cannot receive new submissions or duplicate reviews.
- Submission and review actions require project lifecycle data; loading/error states show a retryable notice instead of silently collapsing to read-only actions.
- Review decisions require support data to load and should use status-specific copy/styles.
- Resources may attach to pending assignment submissions; API/UI evidence uploads attach to submissions only while `uploaded_files` keeps broader database target compatibility.
- Reviewed submission support records are immutable while reads/downloads stay available.

## Source Map

| Source | Owns |
| --- | --- |
| `apps/api/internal/app/tasks.go` | Assignment CRUD, submission, review, assignee rules. |
| `apps/api/internal/app/milestones.go` | Milestone/assignment linking. |
| `apps/api/internal/app/resources.go` | Submission resource links. |
| `apps/api/internal/app/files.go` | Submission evidence upload/download/delete. |
| `apps/api/db/migrations/*task_deadlines_date.sql`, `*milestone_required_assignments.sql`, `*assignment_submission_integrity.sql`, `*progress_submitter_integrity.sql`, `*block_child_task_progress_updates.sql`, `*reviewed_support_immutability.sql` | Assignment date, milestone, submission, submitter, official-assignment, and reviewed-support integrity anchors. |
| `apps/web/src/features/tasks` | Assignment detail, forms, review desk, student workbench, timeline. |
| `apps/web/src/features/projects` | Work Plan assignment list/create affordances. |
| `apps/web/src/features/resources` | Resource dialog/chips/actions. |
| `apps/web/src/features/files` | Evidence panel upload/download/delete UI. |
| `apps/web/src/lib/permissions.ts` | Lifecycle affordances. |

## Review Checklist

- Is assignment lifecycle derived consistently across API, DTOs, and UI copy?
- Does every submission/review mutation lock the project and target rows before changing state?
- Does student submission recheck active assignment, active membership, active user, and pending-review uniqueness?
- Does review prevent contradictions between review decision and official progress state?
- Are pending, reviewed, rejected, needs-changes, completed, stale, forbidden, and archived states readable?
- Are resources/evidence immutable after review but readable after closure?
- Do mutations invalidate assignment, project, milestone, dashboard, support, and evidence queries as needed?

## Verify

- Focused lifecycle tests for assignment create/update, submission authorization, pending review completion, review authority, duplicate reviews, support immutability.
- `make db-validate` when assignment/submission/support triggers change.
- Web lint/build and targeted browser tests for assignment forms, submission, review desk, resources, and evidence.

## Gaps

- Browser coverage for assignment create/edit/submission/review permutations is still partial.
- Submission/review status copy and derived assignment state still need polish.
- Resource dialog and evidence panel browser coverage is partial.
