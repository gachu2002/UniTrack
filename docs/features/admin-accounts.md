# Admin Accounts

Purpose: document admin-controlled account lifecycle for admins, teachers, and students.

## User Problem

Admins need controlled account setup and correction without public signup, while preserving active-admin safety, teacher responsibility, student history, and session security.

## UI And Routes

| Route / Surface | Owns |
| --- | --- |
| `/admin/users` | Responsive account ledger with search/filter, exact pagination totals, create account, edit role/status/name, transition guidance, password reset. |

## Rules

- Bootstrap admin env vars must be provided as a valid email/password pair; bootstrap fails if the email belongs to a non-active-admin account.
- Admins can list/search paginated accounts with exact totals, create accounts, update role/status/name, and reset passwords.
- The account directory shows 10 accounts per page to keep the table readable on large account sets.
- Role/status changes preserve the last active admin with serialized checks.
- Teacher/admin demotion or deactivation with open work requires a replacement teacher/admin.
- Student deactivation or role change with active work requires cleanup confirmation; historical submissions remain readable.
- Password create/reset rejects leading/trailing spaces and revokes target sessions; self-reset signs the admin out.
- Account mutations refresh admin, dashboard, workspace, project, and folder data.

## Source Map

| Source | Owns |
| --- | --- |
| `apps/api/internal/app/admin_users.go` | Admin handlers, transitions, last-admin guard, session revocation, activity logs. |
| `apps/api/internal/app/auth.go` | Login serialization with account-control mutations. |
| `apps/api/internal/app/bootstrap.go` | Bootstrap admin behavior. |
| `apps/api/db/migrations/*session_revocation.sql`, `*case_insensitive_user_emails.sql` | Account/session integrity anchors. |
| `apps/web/src/features/admin` | Account UI, transition panel, password reset UI. |
| `apps/web/src/lib/query-invalidation.ts` | Cross-feature invalidation after account mutations. |

## Review Checklist

- Does the change preserve the last active admin?
- Do teacher/admin demotion or deactivation paths handle open supervised work?
- Do student role/status changes preserve historical submissions and require cleanup confirmation when active work exists?
- Are target sessions revoked after password/status-sensitive account changes?
- Are account mutations invalidating admin, dashboard, workspace, project, and folder data as needed?
- Are forbidden, stale, empty, loading, and transition-guidance states readable in the UI?

## Verify

- Focused admin lifecycle tests in `apps/api/internal/app/lifecycle_test.go`.
- `apps/api/internal/config` tests for bootstrap validation.
- `apps/web/e2e/admin-accounts.spec.ts` for create/search/sign-in UI coverage.

## Gaps

- No activity-log UI yet.
- No email delivery or forced password-change flow.
- Browser coverage for edit transitions and password reset remains partial.
