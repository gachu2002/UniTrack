# Workspace And Projects

Purpose: document the workspace, folders, projects, milestones, Work Plan, team membership, and project-detail UI as one vertical feature area.

## User Problem

Teachers need a project-first place to organize supervised work, group projects into lightweight folders, manage students, plan milestones/assignments, and see project status without switching modules.

## UI And Routes

| Route / Surface | Owns |
| --- | --- |
| `/workspace` | Folder shelves, standalone projects, create folder/project affordances. |
| `/workspace/classes/:classId` | Folder detail, add existing project search, project movement. |
| `/workspace/projects/:projectId` | Compact project header, Next Up action strip, checkpoint-card Work Plan, resources, team popover. |

UI says folder and assignment. API/DB compatibility names still include `classes`, `course_sections`, and `tasks`.

UI may say checkpoint for planning items. API/DB/source compatibility names still include `milestone` and `project_milestones`.

Legacy `/projects*` and `/classes*` paths redirect into `Workspace` routes and are router compatibility only.

Project cards use the card surface or linked project title as the navigation affordance; folder project cards do not show a separate `Open` button so their action area stays focused on folder movement controls.

Project detail pages use the shared compact page header, a slim `Next Up` action strip, and then the full Work Plan. The Work Plan remains the source of truth for the checkpoint sequence, assignment links, resources, and manager-only plan editing actions.

## Rules

- Projects are the primary product object; keep the flow `Teacher -> Project -> Assignment -> Submission -> Review`.
- Workspace project lists are server-paginated with exact totals; project search is applied by the API across accessible projects before pagination.
- Workspace active and archived folder shelves use server pagination/search with exact totals at eight folders per page; standalone project grids use server pagination/search at eight projects per page. Avoid show-more/show-all controls on these shelves and standalone project grids; keep the standalone project grid height stable during page/search refreshes.
- Folder-detail project lists use frontend pagination at eight projects per page. Their project cards use the compact project-card variant: fixed-height cards with title, short context, status, assignment count, and attention marker only.
- Folders are teacher/admin organization surfaces; students see projects, not folder management.
- Teachers manage owned folders and supervised projects; admins can manage existing folders/projects.
- Assigning or moving projects into or out of folders must validate active folder use and owner/supervisor alignment inside the write transaction.
- One folder per project is enforced in the DB.
- Project status controls writes: `active`, `on_hold`, `completed`, and `archived` have different write gates documented in `docs/architecture.md`.
- Project-scoped writes must recheck manager authority and lifecycle under project-row locks.
- Milestones are planning checkpoints above assignments; submissions and reviews remain assignment-scoped.
- Project-detail assignment creation requires both checkpoint and student data to load; loading/error states must not open a misleading empty assignment form.
- Empty Work Plan and team states must branch by lifecycle and manager ability so read-only users are not invited to unavailable actions.
- Work Plan reorder is atomic and uses a complete ordered milestone list.
- Project members are students; managers are admin or supervising teacher.
- Managers can add existing active students by email while lifecycle permits team changes.
- Add-member must revalidate target student account state inside the mutation transaction.
- Member role changes must revalidate the target as a current active student inside the mutation transaction before leader/member updates.
- Student removal cleans assignment links before membership deletion and preserves historical submissions.
- One `leader` per project is enforced by transactional role updates and database uniqueness.

## Source Map

| Source | Owns |
| --- | --- |
| `apps/api/internal/app/classes.go` | Folder CRUD/detail/status and folder-project links. |
| `apps/api/internal/app/projects.go` | Project CRUD, lifecycle helpers, folder assignment, member list/add/role/remove. |
| `apps/api/internal/app/milestones.go` | Milestone CRUD and reorder. |
| `apps/api/internal/app/tasks.go` | Assignment links and rollups that affect project UI. |
| `apps/api/internal/app/permissions.go` | Folder/project access helpers. |
| `apps/api/db/migrations/*class_folders.sql`, `*project_milestones.sql`, `*single_project_leader.sql`, `*folder_and_task_integrity.sql` | Folder, milestone, leader, and owner/supervisor integrity anchors. |
| `apps/web/src/features/workspace` | Workspace shelves, folder create/edit, standalone projects. |
| `apps/web/src/features/classes` | Folder detail, add-existing search, movement controls. |
| `apps/web/src/features/projects` | Project list/detail, forms, Work Plan, team popover. |
| `apps/web/src/lib/query-invalidation.ts` | Cross-feature refresh after folder/project/team changes. |

## Review Checklist

- Does the change preserve folder as lightweight organization, not a course module?
- Are project/folder owner-supervisor rules checked in API and DB?
- Are lifecycle locks and manager rechecks still inside the transaction?
- Do team mutations refresh project, dashboard, assignment, workspace, and folder data as needed?
- Are students protected from manager-only folder/team affordances?
- Are mobile, empty, forbidden, stale, and archived states readable?

## Verify

- Focused lifecycle tests for project status, milestone reorder, membership, folder movement, and DB triggers.
- `apps/web/e2e/database-integrity.spec.ts` and `state-flow.spec.ts` for candidate filtering/stale search.
- Web lint/build and targeted browser tests for project-detail/form/team/folder UI changes.

## Gaps

- No folder delete endpoint; archive/reactivate is the current model.
- Existing folder owner transfer is not exposed.
- Admin create-on-behalf, supervisor selection, and supervisor transfer remain partial UI/admin management gaps.
- Browser coverage for shelves, movement, owner selection, project create/edit, Work Plan interactions, archived affordances, and team role transitions remains partial.
- Richer milestone templates/reorder behavior should wait until core flows stay stable.
