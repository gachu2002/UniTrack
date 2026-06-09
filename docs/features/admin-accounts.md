# Admin Accounts Onboarding

This document explains the current admin-controlled account management slice.

## Purpose

UniTrack does not use public registration. Accounts are controlled through admin management:

- A first admin can be bootstrapped from environment variables for local/deployment setup.
- Admins can create `admin`, `teacher`, and `student` accounts.
- Admins can list/search the first 200 matching accounts, change display name, role, and status, and set a new password.
- Teachers/admins can add existing active students into projects; student project membership remains project-scoped.
- Inactive users cannot log in or keep using sessions.

## Current Status

| Capability | Status | Notes |
| --- | --- | --- |
| Bootstrap admin | Implemented | `AUTH_BOOTSTRAP_ADMIN_EMAIL` and `AUTH_BOOTSTRAP_ADMIN_PASSWORD` create one active admin when that email is missing. |
| Admin user list | Implemented | `/admin/users` shows searchable/filterable accounts with an explicit first-200 cap. |
| Admin account create | Implemented | Admin can create active/inactive admin, teacher, or student accounts with a password. |
| Role/status correction | Implemented | Admin can update role/status; self-demotion/deactivation and removal of the last active admin are blocked. |
| Password set/reset | Implemented | Admin can set a new password for any account. |
| Deactivation session handling | Implemented | Deactivating a user revokes their active sessions; active-account gate also blocks session lookup. |
| Audit writes | Implemented for account changes | Create, update, and password-set actions write `activity_logs`. |
| Activity-log UI | Missing | Logs are written but not yet listed in the frontend. |
| Email delivery | Missing | Admin-created credentials are handled out-of-band. |

## User-Facing Behavior

| User action | Expected result |
| --- | --- |
| Admin opens `/admin/users` | Account table loads with search, role filter, status filter, and `Showing first 200`; the page avoids generic role/count cards. |
| Admin searches or changes filters | Existing rows stay visible while the list refetches; a small refresh indicator appears instead of replacing the page with a loading state. |
| Admin creates a teacher | Teacher can sign in with the admin-set password and create/supervise projects. |
| Admin creates a student | Student can sign in, but has no project access until added to a project. |
| Admin deactivates a user | User cannot log in; existing sessions are revoked. |
| Admin changes a role | New role applies on the next current-user/session lookup. |
| Admin tries to deactivate/demote self | API returns `409` to preserve active admin access. |
| Non-admin opens `/admin/users` | Frontend shows a forbidden state; backend returns `403`. |

## API Contract

Base path: `/api/v1`

| Method | Endpoint | Access | Request | Success | Common Errors |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/admin/users` | Admin | Optional `search`, `role`, `status`, `limit` | `200` user DTO list; UI requests 200 | `400`, `401`, `403` |
| `POST` | `/admin/users` | Admin | `{ fullName, email, password, role, status }` | `201` user DTO | `400`, `401`, `403`, `409` |
| `PATCH` | `/admin/users/{userId}` | Admin | Partial `{ fullName, role, status }` | `200` user DTO | `400`, `401`, `403`, `404`, `409` |
| `POST` | `/admin/users/{userId}/password` | Admin | `{ password }` | `200` status | `400`, `401`, `403`, `404` |

## Data Model

| Table | Important Fields | Purpose |
| --- | --- | --- |
| `users` | `full_name`, `email`, `password_hash`, `role`, `status` | Account identity, role, and active/inactive gate. |
| `sessions` | `user_id`, `revoked_at` | Deactivation revokes active sessions for the target user. |
| `activity_logs` | `actor_id`, `action`, `entity_type`, `entity_id`, `metadata` | Admin account-change audit trail. |

## Source Map

| Source | Responsibility |
| --- | --- |
| `apps/api/internal/app/admin_users.go` | Admin account handlers, validation, last-admin safety checks, audit writes. |
| `apps/api/internal/app/bootstrap.go` | Bootstrap admin creation. |
| `apps/api/internal/config/config.go` | Bootstrap admin environment variables. |
| `apps/api/internal/app/server.go` | Admin route registration under `requireAuth`. |
| `apps/web/src/features/admin/api.ts` | Admin account API client. |
| `apps/web/src/features/admin/pages/admin-users-page.tsx` | Admin account management UI. |
| `apps/web/src/app/router.tsx` | Admin-only route guard. |
| `apps/web/src/components/layout/app-layout.tsx` | Admin navigation entry. |

## Test Coverage

Backend lifecycle coverage includes:

| Test | Coverage |
| --- | --- |
| `TestAdminCanManageAccounts` | Admin create/list/update/password-set, self-demotion guard, non-admin denial, deactivation session revocation, and activity-log writes. |

Manual frontend verification should include:

- Admin creates a teacher, logs in as that teacher, and confirms admin route is forbidden.
- Admin deactivates a user and confirms login is blocked.
- Admin creates a student and confirms project access still requires membership.

## Known Gaps And Risks

- No activity-log UI yet.
- No email delivery or forced password-change flow for admin-created temporary passwords.
- No frontend automated tests for `/admin/users` yet.
- Admin all-project management and override audit display remain future slices.
