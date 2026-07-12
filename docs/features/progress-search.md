# Progress Tracking And Global Search

Purpose: document the fast cross-project work view and global navigation search.

## User Problem

Students need one place to check active assignments and their submission/review history. Teachers need to quickly find a student from their supervised projects, see that student's related assignment and submission history, and open accessible folders or projects without browsing shelves.

## UI And Routes

| Route / Surface | Owns |
| --- | --- |
| `/work` | Student's own active assignments, all assignment history, and submission/review history. |
| `/work?studentId=:studentId` | Teacher/admin read-only view of a selected student's related work. |
| `/work?teacherId=:teacherId` | Permission-scoped supervisor page listing projects shared with that teacher/admin. |
| App-shell global search | Sidebar search button and `Ctrl+P`/`Cmd+P` open a wide, upper-center search field that searches accessible students, folders, and projects after two characters and a 250ms typing pause; results navigate directly to the relevant surface. |

## Rules

- The work page defaults to assignments in active projects; `All history` includes assignments in completed, on-hold, and archived projects.
- Submission history always includes submitted work and its latest review decision/comment within the permitted scope.
- The teacher/admin student view presents workload summary metrics and independently searchable, client-paginated assignment and submission tables. Filtering and pagination do not expand the permission-scoped work payload returned by the API.
- Students can retrieve only their own work, regardless of the `studentId` query parameter.
- Teachers can retrieve a student only when that student belongs to at least one project supervised by that teacher. The returned work is limited to the teacher's supervised projects.
- Admins retain their existing cross-project access.
- Students can open a supervisor only when they share a project; the page returns only those shared projects. Teachers can open their own supervisor page, while admins can open any teacher/admin supervisor page.
- Person names link to their scoped work or supervisor page in relevant project, assignment, team, and dashboard tables/panels; backend access checks remain authoritative.
- Student-work assignment and submission tables show the supervising teacher/admin for each project and link to the scoped supervisor page.
- Student and supervisor pages show active current-work projects with folder, timeline, lifecycle state, and member/supervisor role. This is a current-state view; historical membership dates are not recorded.
- Global student search returns active students only, limited to students in the teacher's supervised projects for teachers. Students do not receive student or folder results.
- Global project and folder results reuse existing role-scoped list permissions; global search is navigation, not a separate activity-log or course surface.
- Global search visually highlights case-insensitive query matches in result labels and secondary details without changing the returned result set.

## API

| Method | Route | Behavior |
| --- | --- | --- |
| `GET` | `/api/v1/work` | Returns the authenticated student's work. |
| `GET` | `/api/v1/work?studentId=:studentId` | Returns permission-scoped work for the selected student; required for teacher/admin views. |
| `GET` | `/api/v1/work?teacherId=:teacherId` | Returns a permission-scoped supervisor and accessible supervised projects. |
| `GET` | `/api/v1/search?q=:query` | Returns up to six accessible matches per student, project, and folder group; queries shorter than two characters return empty groups. |

## Source Map

| Source | Owns |
| --- | --- |
| `apps/api/internal/app/activity.go` | Work-history and global-search handlers, role scoping, and result DTO loading. |
| `apps/api/internal/app/server.go` | Protected route registration. |
| `apps/web/src/features/activity/*` | API clients, global search control, and work page. |
| `apps/web/src/components/layout/app-layout.tsx` | Shell search placement and student `My work` navigation. |
| `apps/web/src/app/router.tsx` | `/work` route. |

## Verify

- `make api-build`
- `pnpm --filter @unitrack/web lint`
- `pnpm --filter @unitrack/web build`
- Add targeted role-flow browser coverage for student self-view, teacher scope denial, and global-search navigation when the API-backed browser fixture is available.

## Gaps

- No browser coverage yet for global-search result groups or the work-history role boundary.
- The initial work view is a compact assignment/submission history, not a general activity log.
