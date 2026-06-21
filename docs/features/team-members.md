# Team And Members Onboarding

This document explains the current UniTrack project team/member implementation for engineers who need to maintain project membership and the project team popover.

## Purpose

Project teams define which students can access a project and which students can be assigned work. Student accounts must already exist before they can be added to a project; public invitation onboarding is removed from the active product.

The feature provides:

- Project member listing for project viewers.
- Teacher/admin direct add of existing active student accounts by email.
- Member role changes between `member` and `leader`.
- At most one `leader` per project; promoting a new leader demotes the previous leader.
- Student removal from projects, including cleanup of task assignments in that project.
- Activity-log writes for member add, role change, and removal.
- A low-emphasis header `Team` trigger with a member count and a popover on the project detail page instead of a page-consuming rail or modal drawer; the add-student panel closes after a successful add and member actions are locked while a team mutation is pending.

Project-level access rules are documented in `docs/features/protected-access.md`. Admin account creation is documented in `docs/features/admin-accounts.md`.

## Current Status

| Capability | Status | Notes |
| --- | --- | --- |
| Member list | Implemented | Project viewers can list project students; managers and member students can see names/emails. |
| Team popover | Implemented | Project detail renders a low-emphasis header `Team` trigger with a count; it opens a popover with supervisor, add-student, search, member rows, and management actions. |
| Compact member rows | Implemented | Members render as dense rows with initials, email, joined date, and leader marker. |
| Member search | Implemented | Search appears for larger teams or after typing, filtering by name, email, or member role. |
| Add existing student | Implemented | Managers add an existing active student account by email. Unknown student emails return `404`; active-student state is rechecked under a user-row lock in the membership transaction. |
| Promote/demote member | Implemented | Managers can toggle `leader` and `member`; promoting one member demotes any existing project leader. |
| Single leader invariant | Implemented | Database unique index and transactional backend update enforce at most one `leader` per project. |
| Remove member | Implemented | Managers can remove students after app confirmation; backend removes project task-assignee links before deleting membership and records the cleanup count. |
| Project lifecycle gates | Implemented | Member add, role change, and removal are allowed only while projects are `active` or `on_hold`, with transaction-scoped project-row lifecycle re-checks before mutation. |
| Supervisor removal guard | Implemented | Backend rejects removing the project supervisor. |
| Activity logging | Implemented | Member add, role update, and removal write project-scoped `activity_logs` rows. |
| Invitation onboarding | Removed | No invite routes, public accept page, invitation DTO, or active invitation table remain. |
| Frontend automated tests | Missing/partial | Backend lifecycle coverage is strong; frontend popover interaction tests are still needed. |

## User-Facing Behavior

| User action | Expected result |
| --- | --- |
| Teacher/admin opens a project | Sees project content and a low-emphasis header `Team` button with a member count. |
| Student opens an assigned project | Can open a read-only team popover with supervisor and members; management actions are hidden. |
| Teacher/admin opens the team popover | The popover shows supervisor, add-student controls, searchable students, inactive account markers when applicable, leader toggle, and removal actions. |
| Teacher/admin closes the team popover | Project detail returns to full-width project content with only the neutral header `Team` trigger visible. |
| Teacher/admin adds an active student email | The existing student becomes a project member and can view project work. |
| Student account is deactivated during add | The add request waits for the account mutation and rejects inactive state without creating membership. |
| Teacher/admin adds an unknown student email | API returns `404 student account not found`; the teacher/admin must ask an admin to create the student account first. |
| Teacher/admin adds a teacher/admin email | API returns `400`; project members must be student accounts. |
| Teacher/admin adds an inactive student | API returns `409`; admin account correction is required first. |
| Teacher/admin promotes a student | Student row shows the `leader` marker after mutation refresh; any previous leader becomes `member`. |
| Teacher/admin demotes a leader | Student row returns to normal member display. |
| Teacher/admin removes a member | App confirmation appears first; after confirmation, the student loses project membership and is unassigned from project assignments. |
| Teacher/admin starts a member mutation | Other member action buttons are disabled until the mutation finishes to avoid duplicate or conflicting role/remove clicks. |
| Teacher/admin changes team on a completed or archived project | API returns `409`; frontend hides member mutation controls. |
| Large team is displayed | Member list remains compact and scrollable; search filters members without changing backend data. |

## API Contract

Base path: `/api/v1`

| Method | Endpoint | Access | Request | Success | Common Errors |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/projects/{projectId}/members` | Project viewer | Cookie only | `200` member DTO list | `400`, `401`, `403`, `500` |
| `POST` | `/projects/{projectId}/members` | Project manager plus active/on-hold project | `{ "email": string }` | `201` member DTO | `400`, `401`, `403`, `404`, `409`, `500` |
| `PATCH` | `/projects/{projectId}/members/{memberId}` | Project manager plus active/on-hold project | `{ "memberRole": "member" | "leader" }` | `200` member DTO | `400`, `401`, `403`, `404`, `409`, `500` |
| `DELETE` | `/projects/{projectId}/members/{memberId}` | Project manager plus active/on-hold project | Cookie only | `200` `{ "status": "removed" }` | `400`, `401`, `403`, `404`, `409`, `500` |

Member DTO fields:

| Field | Meaning |
| --- | --- |
| `id` | Student user ID. |
| `fullName` | Student display name. |
| `email` | Student email. |
| `role` | User role, expected to be `student` for project members. |
| `status` | User account status. |
| `memberRole` | Project role: `member` or `leader`. |
| `joinedAt` | Membership creation timestamp. |

## Data Model

| Table | Important Fields | Purpose |
| --- | --- | --- |
| `project_members` | `project_id`, `student_id`, `member_role`, `joined_at`, unique project/student pair, partial unique leader index | Stores project membership and member role. |
| `task_assignees` | `project_id`, `task_id`, `student_id` | Project-aware assignment links; database FKs require current project membership and cascade cleanup when a member is removed. |
| `projects` | `id`, `supervisor_id`, `status` | Determines project manager, supervisor removal guard, and lifecycle write gates. |
| `users` | `id`, `email`, `role`, `status`, `full_name` | Supplies target student account details for direct add. |
| `activity_logs` | `actor_id`, `project_id`, `action`, `entity_type`, `entity_id`, `metadata` | Records project membership add, role update, and removal actions. |

Relevant migrations:

| Migration | Role |
| --- | --- |
| `20260601000100_init_mvp.sql` | Historically creates `project_members` and the now-removed `invitations` table. |
| `20260607000300_single_project_leader.sql` | Demotes duplicate historical leaders and adds `project_members_one_leader_per_project`. |
| `20260609000100_remove_invitations.sql` | Drops the active `invitations` table and invitation indexes/triggers. |
| `20260619000100_assignment_submission_integrity.sql` | Adds project-aware assignment FKs from `task_assignees` to `tasks` and `project_members`. |

## Backend Implementation Map

| File | Responsibility |
| --- | --- |
| `apps/api/internal/app/server.go` | Registers protected member project routes. |
| `apps/api/internal/app/projects.go` | Member list/add/update/remove handlers. |
| `apps/api/internal/app/permissions.go` | `canViewProject` and `canManageProject` relationship checks. |
| `apps/api/internal/app/types.go` | `ProjectMemberDTO` and request DTOs. |
| `apps/api/internal/app/lifecycle_test.go` | Backend regression coverage for membership, direct add, role changes, and removal. |

Important functions:

| Function | What It Does |
| --- | --- |
| `handleListProjectMembers` | Allows project viewers to list member students. |
| `handleAddProjectMember` | Requires project manager, validates email, re-checks lifecycle under the project lock, locks and revalidates the target user as an active student, rejects duplicates, inserts membership, and writes an activity log. |
| `handleUpdateProjectMember` | Requires project manager, validates `memberRole`, and updates role after locked lifecycle validation. |
| `updateProjectMemberRole` | Re-checks lifecycle under the project lock, locks project members, demotes existing leaders before a new promotion, updates role, writes an activity log, and returns joined user/member DTO. |
| `handleRemoveProjectMember` | Requires manager, validates member ID, blocks supervisor removal, re-checks lifecycle under the project lock, removes project task assignments, deletes membership, and writes an activity log with the assignment cleanup count. |

Member lifecycle gates:

| Project Status | Member Add | Role Change | Member Remove |
| --- | --- | --- | --- |
| `active` | Yes | Yes | Yes |
| `on_hold` | Yes | Yes | Yes |
| `completed` | No | No | No |
| `archived` | No | No | No |

## Frontend Implementation Map

| File | Responsibility |
| --- | --- |
| `apps/web/src/features/projects/pages/project-detail-page.tsx` | Project detail layout, neutral header team trigger/popover, member rows, member search, locked pending-state role/remove actions, and add-student section that closes after successful add. |
| `apps/web/src/features/projects/components/project-forms.tsx` | `AddProjectMemberForm`, project create/edit forms, validation, query invalidation. |
| `apps/web/src/features/projects/api.ts` | Member REST client functions. |
| `apps/web/src/lib/query-keys.ts` | `projectMembers(projectId)` query key. |
| `apps/web/src/types/api.ts` | `ProjectMember` frontend type. |

## Project Team Popover Flow

```mermaid
flowchart TD
  A[User opens project detail] --> B[ProtectedLayout verifies active session]
  B --> C[GET /projects/:projectId]
  C --> D{Can view project?}
  D -- No --> E[Forbidden state]
  D -- Yes --> F[Load members]
  F --> G[Render low-emphasis Team trigger with count]
  G --> H[Supervisor row]
  G --> I[Compact searchable member list]
  G --> J{Can manage project?}
  J -- Yes --> K[Show add-student and member action controls]
  J -- No --> L[Read-only team popover]
```

## Member Mutation Flow

```mermaid
flowchart TD
  A[Manager clicks member action] --> B{Action type}
  B -- Add existing student --> C[POST /projects/:projectId/members]
  B -- Promote or demote --> D[PATCH /projects/:projectId/members/:memberId]
  B -- Remove --> E[Confirm removal]
  E --> F[DELETE /projects/:projectId/members/:memberId]
  C --> G[Validate target user is an active student]
  G --> H[Insert project membership and audit log]
  D --> I{New role is leader?}
  I -- Yes --> J[Demote previous project leader]
  I -- No --> K[Update selected member]
  J --> K
  H --> L[Invalidate members, project, projects, classes, dashboard]
  K --> L
  F --> M[Backend deletes membership, unassigns project tasks, and writes audit log]
  M --> N[Invalidate members, tasks, project, projects, classes, dashboard]
```

## Access Matrix

| User and Relationship | List Members | Add Student | Promote/Demote | Remove Member |
| --- | --- | --- | --- | --- |
| Admin | Yes | Yes | Yes | Yes, except supervisor guard applies |
| Supervising teacher | Yes | Yes | Yes | Yes, except supervisor guard applies |
| Other teacher | Denied | Denied | Denied | Denied |
| Student project member | Yes | Denied | Denied | Denied |
| Student non-member | Denied | Denied | Denied | Denied |
| Signed-out user | `401` | `401` | `401` | `401` |

## Cache And Refresh Behavior

| Trigger | Invalidated Query Keys |
| --- | --- |
| Member added | Active `projectMembers(projectId)` and `project(projectId).memberCount` caches are patched immediately; then `projectMembers(projectId)`, `project(projectId)`, `projects`, `classes`, and `dashboard` are invalidated. |
| Member role changed | Active `projectMembers(projectId)` cache is patched immediately; then `projectMembers(projectId)`, `project(projectId)`, `projects`, `classes`, and `dashboard` are invalidated because leader promotion can demote another row. |
| Member removed | Active `projectMembers(projectId)` and `project(projectId).memberCount` caches are patched immediately; then `projectMembers(projectId)`, `projectTasks(projectId)`, `project(projectId)`, `projects`, `classes`, and `dashboard` are invalidated. |

## Error Behavior

| Status | Meaning In Team/Member Context |
| --- | --- |
| `400` | Invalid project ID, invalid member ID, invalid member role, malformed email, non-student account, or supervisor removal attempt. |
| `401` | No valid active session reached a protected member route. |
| `403` | Authenticated user lacks project view or management relationship. |
| `404` | Project member not found or target student account not found. |
| `409` | Student is already a member or target student account is inactive. |

## Test Coverage

Backend lifecycle tests in `apps/api/internal/app/lifecycle_test.go` cover the current team/member model:

| Test | Coverage |
| --- | --- |
| `TestTeacherCanAddExistingActiveStudentToProject` | Teacher direct add by email, duplicate rejection, activity-log write, and added student project visibility. |
| `TestAddProjectMemberValidatesStudentAccountState` | Invalid email, unknown account `404`, non-student blocking, inactive student blocking, and no accidental membership writes. |
| `TestAddProjectMemberRechecksStudentAccountAfterLock` | Direct add waits on a concurrent student account lock, observes deactivation, returns `409`, and creates no membership. |
| `TestAdminCanAddProjectMember` | Admin can add an active student to an existing project. |
| `TestOnHoldProjectBlocksNewWorkButAllowsManagerMaintenance` | On-hold projects still allow member maintenance. |
| `TestCompletedProjectAllowsPendingReviewsOnly` | Completed projects block member additions. |
| `TestProjectRoutesEnforceMembershipAndSupervisor` | Project/member access for supervising teacher, other teacher, member student, non-member student, and admin. |
| `TestProjectMemberRoleLifecycleAndPermissions` | Students/other teachers cannot update roles; managers can promote/demote; invalid member IDs, invalid roles, and non-members are rejected; promoting a second leader demotes the previous leader; role changes write activity logs. |
| `TestCreateProjectRejectsDirectMembers` | Project creation rejects unsupported direct member assignment. |
| `TestTeacherCanRemoveProjectMember` | Students cannot remove members; malformed member IDs and supervisor removal are rejected; member removal deletes task assignments first, writes activity logs, and records assignment cleanup count. |

Frontend automated tests for team popover open/close, member search, manager actions, and add-student behavior are still missing.

## Known Gaps And Risks

| Gap or Risk | Impact |
| --- | --- |
| Frontend tests are sparse | Team popover interaction regressions can slip through lint/build. |
| Member search is client-side | Very large teams may need server-side member search later, but current project teams are expected to be modest. |
| Student account lookup exposes missing accounts to project managers | Direct add intentionally returns `404 student account not found` per product decision. |
| No student self-leave flow | Membership removal remains manager-only. |

## Maintenance Checklist

When adding or changing team/member behavior:

- Keep project membership project-first; do not turn folders/classes into student team surfaces.
- Use `canViewProject` for member list reads and `canManageProject` for member mutations.
- Require existing active student accounts for direct member add.
- Lock and revalidate target student account state inside the member-add transaction before inserting membership.
- Preserve `memberRole` values: `member` and `leader`.
- Preserve the one-leader-per-project invariant in both backend mutations and database constraints.
- Preserve already-member protections.
- Preserve task assignment cleanup when removing a project member.
- Preserve accurate `taskAssigneeLinksRemoved` activity-log metadata by deleting assignment links before deleting membership.
- Preserve project-scoped activity-log writes for add, role update, and removal.
- Keep large-team UI compact and searchable rather than card-heavy.
- Keep icon-only actions accessible with labels and titles.
- Invalidate member, task, project, project list, classes, and dashboard queries according to the cache table above.
- Add frontend coverage when a test setup is introduced.
