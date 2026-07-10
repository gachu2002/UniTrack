# Assignment Review

Purpose: document milestone-scoped assignments, student submissions, teacher/admin reviews, assignment detail UI, and submission support behavior.

## User Problem

Students need one official place to submit progress for assigned work. Teachers need a reliable review desk that records decisions, preserves evidence, and advances assignment/project state without ambiguity.

## UI And Routes

| Route / Surface | Owns |
| --- | --- |
| `/workspace/projects/:projectId` | Work Plan assignment list/create affordances. |
| `/workspace/projects/:projectId/tasks/:taskId` | Assignment page, review desk, student workbench, timeline, optional instructions disclosure, resources/evidence. |

UI says assignment, submission, review, resource, and evidence. API/DB compatibility names still include `task`, `progress_update`, and `uploaded_files`.

UI may say checkpoint for planning context. API/DB/source compatibility names still include `milestone` and `project_milestones`.

## Rules

- Assignments are milestone-scoped, date-only, project-scoped, and assigned to active project students.
- Assignment create/update must recheck manager authority, lifecycle, milestone membership, assignee active membership/account state, and current row state inside locked transactions.
- Students can submit assignment-scoped work only when assigned, active, project member, and project/task state allows it.
- Direct progress submission rows are database-gated to official assignments; legacy child tasks cannot receive new submissions.
- Only one pending submission per assignment is allowed.
- Manual assignment status adjustment is blocked while pending review exists.
- Managers review pending submissions once while the project is not archived; review authority is rechecked in the review transaction.
- Completed assignments cannot receive new submissions or duplicate reviews.
- Completed assignments cannot be reopened through generic assignment update; metadata edits must preserve `done`/`completed` state.
- Managers can explicitly adjust assignment status to `in_progress`, `needs_changes`, or `completed` when the project accepts plan changes and no submission is pending review.
- Manual completion, manual revision, and reopening completed assignments require a reason and record `assignment.status_adjusted` activity history without changing submission/review/evidence history.
- Negative review decisions (`needs_changes` or `rejected`) must store the official assignment state as `needs_changes` so API rollups and UI state remain consistent.
- Submission and review actions require project lifecycle data; loading/error states show a retryable notice instead of silently collapsing to read-only actions.
- Assignment headers stay focused on title and primary actions; the right-side Details panel uses a compact two-column summary for status, priority, submission count, due date, checkpoint, project, and assignees.
- Assignment and submission table variants use sortable data headers for loaded rows while action columns remain static.
- Assignment instructions remain expanded and readable in the right-side context/decision panel; assignments without description text show an explicit no-instructions message. Assignment-level resources also live in the right-side panel, including during pending-review workflows.
- Review decisions require support data to load and should use status-specific copy/styles.
- Assignment detail UI is action-first: pending teacher review shows the current submission and decision panel first, with instructions and assignment resources in the right panel while evidence and older history remain quieter reference material. For non-review states, the Assignment state panel explains only the next action or view-only reason; full submission content appears once in the compact submission history instead of being duplicated in both sections.
- Assignment status adjustment is a separate teacher/admin action from editing assignment details so manual overrides stay intentional and auditable.
- Evidence upload controls should stay compact on the assignment page; file upload affordances can sit behind an explicit add action while attached files remain readable/downloadable.
- Submission history should use compact rows and clearly grouped teacher decisions so older records do not compete with the current state or next student action; API helpers must not silently cap assignment or project submission history. Project-level progress history supports explicit `page`/`limit` responses for callers that need bounded loads.
- Resources may attach to pending assignment submissions; open submission-resource dialogs become read-only when the submission is no longer `pending_review`. API/UI evidence uploads attach to submissions only while `uploaded_files` keeps broader database target compatibility.
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

- Focused lifecycle tests for assignment create/update, submission authorization, pending review completion, review authority, duplicate reviews, support immutability, and project submission-history pagination.
- `make db-validate` when assignment/submission/support triggers change.
- Web lint/build and targeted browser tests for assignment forms, submission, review desk, resources, and evidence, including `assignment-happy-path.spec.ts` for the core UI flow.

## Gaps

- Browser coverage for assignment edit/submission/review permutations is still partial beyond the core happy path.
- Submission/review status copy and derived assignment state still need polish.
- Resource dialog and evidence panel browser coverage is partial.
