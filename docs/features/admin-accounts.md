# Admin Accounts Onboarding

This document explains the current admin-controlled account management slice.

## Purpose

UniTrack does not use public registration. Accounts are controlled through admin management:

- A first admin can be bootstrapped from validated environment variables for local/deployment setup.
- Admins can create `admin`, `teacher`, and `student` accounts.
- Admins can list/search the first 200 matching accounts in 25-row pages, change display name, role, and status, and set a new password that revokes the target user's active sessions.
- Teachers/admins can add existing active students into projects; student project membership remains project-scoped.
- Inactive users cannot log in or keep using sessions.

## Current Status

| Capability | Status | Notes |
| --- | --- | --- |
| Bootstrap admin | Implemented | `AUTH_BOOTSTRAP_ADMIN_EMAIL` and `AUTH_BOOTSTRAP_ADMIN_PASSWORD` must be provided as a valid pair; bootstrap creates one active admin when the email is missing and fails clearly if that email belongs to a non-active-admin account. |
| Admin user list | Implemented | `/admin/users` shows searchable/filterable accounts with an explicit first-200 cap and 25-row client paging. |
| Admin account create | Implemented | Admin can create active/inactive admin, teacher, or student accounts with a password that cannot start or end with spaces. |
| Role/status correction | Implemented | Admin can update role/status; self-demotion/deactivation and removal of the last active admin are blocked under a serialized transaction guard, and impacted active work triggers a guided transition panel. |
| Transition support data | Implemented | Replacement teacher/admin choices are loaded through a dedicated active teacher/admin query, independent of the currently searched or capped account table rows. |
| Password set/reset | Implemented | Admin can set a new password for any account; active sessions for the target user are revoked, and self password reset signs the current admin out. |
| Deactivation session handling | Implemented | Deactivating a user revokes their active sessions; login/session creation serializes with account-control changes and active-account gate also blocks session lookup. |
| Cross-feature cache refresh | Implemented | Account create/update refreshes admin accounts, dashboards, workspace projects, and folder data because role/status changes can reassign or clean active work. |
| Audit writes | Implemented for account changes | Create, update, and password-set actions write `activity_logs`; update/password metadata includes the target email. |
| Activity-log UI | Missing | Logs are written but not yet listed in the frontend. |
| Email delivery | Missing | Admin-created credentials are handled out-of-band. |

## User-Facing Behavior

| User action | Expected result |
| --- | --- |
| Admin opens `/admin/users` | Account table loads with search, role filter, status filter, `Showing first 200` when capped, and 25-row paging controls; the page avoids generic role/count cards. |
| Admin searches or changes filters | Existing rows stay visible while the list refetches; a small refresh indicator appears instead of replacing the page with a loading state. |
| Admin creates a teacher | Teacher can sign in with the admin-set password and create/supervise projects. |
| Admin creates a student | Student can sign in, but has no project access until added to a project. |
| Admin deactivates a user | User cannot log in; existing sessions are revoked. |
| Admin deactivates/demotes a teacher/admin with open work | UI shows impacted open projects/active folders and requires choosing an active teacher/admin replacement before the role/status change is applied. |
| Admin searches the account table during a transition | Replacement choices still come from the dedicated active teacher/admin candidate query, not from the filtered visible table rows. |
| Admin deactivates or changes a student away from student | UI shows impacted active memberships/assignments and requires confirmation before removing the account from active project work; historical submissions remain readable. |
| Admin resets a user's password | Password changes immediately and existing sessions for that user are revoked. |
| Admin resets their own password | UI warns that the current session will be revoked, then signs the admin out after success. |
| Admin changes a role | New role applies on the next current-user/session lookup. |
| Admin tries to deactivate/demote self | UI locks self role/status controls; API also returns `409` to preserve active admin access. |
| Admin role is removed elsewhere while `/admin/users` is open | The next admin-list `403` renders an admin forbidden state and refreshes current-user permissions instead of showing stale rows. |
| Non-admin opens `/admin/users` | Frontend shows an admin-specific forbidden state; backend returns `403`. |

## API Contract

Base path: `/api/v1`

| Method | Endpoint | Access | Request | Success | Common Errors |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/admin/users` | Admin | Optional `search`, `role`, `status`, `limit` | `200` user DTO list; UI requests 200 | `400`, `401`, `403` |
| `POST` | `/admin/users` | Admin | `{ fullName, email, password, role, status }` | `201` user DTO | `400`, `401`, `403`, `409` |
| `PATCH` | `/admin/users/{userId}` | Admin | Partial `{ fullName, role, status, replacementSupervisorId, confirmStudentCleanup }` | `200` user DTO | `400`, `401`, `403`, `404`, `409`; transition-required conflicts include `code: "account_transition_required"` and impacted counts. |
| `POST` | `/admin/users/{userId}/password` | Admin | `{ password }` | `200` status | `400`, `401`, `403`, `404` |

## Data Model

| Table | Important Fields | Purpose |
| --- | --- | --- |
| `users` | `full_name`, `email`, `password_hash`, `role`, `status` | Account identity, role, and active/inactive gate. |
| `sessions` | `user_id`, `revoked_at` | Deactivation and password reset revoke active sessions for the target user. |
| `activity_logs` | `actor_id`, `action`, `entity_type`, `entity_id`, `metadata` | Admin account-change audit trail. |

## Consistency Rules

| Rule | Implementation |
| --- | --- |
| Login vs account-control | Login locks the target user row with `SELECT ... FOR UPDATE`, verifies credentials, and inserts the session in the same transaction so password reset/deactivation cannot leave a stale new session. |
| Last active admin | Admin role/status updates take a transaction-scoped advisory lock before reading the target and counting active admins. |
| Account transitions | Teacher/admin demotion or deactivation requires reassigning non-archived projects and active folders to an active teacher/admin; student deactivation or role change requires confirming removal from active/on-hold project memberships and assignments. |
| Self access | The frontend locks self role/status controls and backend rejects attempts to remove the actor's own active admin access. |
| Password whitespace | Account create/reset rejects passwords with leading or trailing spaces because login verifies the raw password. |
| Frontend cache impact | Account create/update uses `invalidateAdminAccountImpactData` so dashboard, project, folder, and admin account views refresh after account-control changes. |

## Source Map

| Source | Responsibility |
| --- | --- |
| `apps/api/internal/app/admin_users.go` | Admin account handlers, validation, serialized last-admin safety checks, guided account transitions, session revocation, audit writes. |
| `apps/api/internal/app/auth.go` | Login/session creation serialization with account-control mutations and password hashing validation. |
| `apps/api/internal/app/bootstrap.go` | Idempotent bootstrap admin creation and existing-account validation. |
| `apps/api/internal/config/config.go` | Bootstrap admin environment variables and validation. |
| `apps/api/internal/app/server.go` | Admin route registration under `requireAuth`. |
| `apps/web/src/features/admin/api.ts` | Admin account API client, including transition fields on account update. |
| `apps/web/src/features/admin/pages/admin-users-page.tsx` | Admin account management UI, stale-forbidden handling, self-action guardrails, dedicated replacement-supervisor candidates, cross-feature invalidation, and account transition panel. |
| `apps/web/src/lib/query-invalidation.ts` | Shared invalidation helper used after account mutations that can affect workspace/dashboard state. |
| `apps/web/e2e/admin-accounts.spec.ts` | Browser regression for creating/searching a teacher account through the admin UI and signing in as that teacher. |
| `apps/web/src/app/router.tsx` | Admin-only route guard. |
| `apps/web/src/components/layout/app-layout.tsx` | Admin navigation entry. |

## Test Coverage

Backend lifecycle coverage includes:

| Test | Coverage |
| --- | --- |
| `TestAdminCanManageAccounts` | Admin create/list/update/password-set, self-demotion guard, non-admin denial, deactivation session revocation, and activity-log writes. |
| `TestAdminPasswordResetRevokesExistingSessions` | Password reset revokes active sessions for the target account. |
| `TestLoginWaitsForAccountControlLock` | Login waits for account-control row locks and does not create a stale session with an old password. |
| `TestConcurrentAdminDeactivationKeepsActiveAdmin` | Concurrent admin deactivation attempts cannot remove the last active admin. |
| `TestAdminRoleChangeRequiresTeacherResponsibilityReassignment` | Teacher/admin role changes with open projects/folders require replacement and then reassign impacted records transactionally. |
| `TestAdminStudentDeactivationRequiresCleanupConfirmation` | Student deactivation with active memberships/assignments requires confirmation, removes active work links, revokes sessions, and preserves historical submissions. |
| `TestBootstrapRejectsExistingNonAdminAccount` | Bootstrap fails clearly when the configured bootstrap email already belongs to a non-admin account. |
| `apps/api/internal/config` validation tests | Cookie/CORS validation plus bootstrap email/password pair, email format, and password strength checks. |

Frontend Playwright coverage includes:

| Test | Coverage |
| --- | --- |
| `admin can create and find a teacher account through the UI` | Admin opens `/admin/users`, creates a teacher with a temporary password, searches for the account, and verifies the teacher can sign in. |

Manual frontend verification should include:

- Admin creates a teacher, logs in as that teacher, and confirms admin route is forbidden.
- Admin deactivates a user and confirms login is blocked.
- Admin creates a student and confirms project access still requires membership.
- Admin demotes a teacher with open work and confirms the transition panel requires a replacement teacher/admin.
- Admin deactivates a student with active assignments and confirms the transition panel requires cleanup confirmation.
- Admin resets their own password and confirms they are sent back to login.

## Known Gaps And Risks

- No activity-log UI yet.
- No email delivery or forced password-change flow for admin-created temporary passwords.
- Frontend automated coverage now covers account creation/search/sign-in, but edit transitions and password reset flows still need browser coverage.
- Admin all-project management and override audit display remain future slices.
