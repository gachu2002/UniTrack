# Security And Auth

Purpose: explain account control, login/session behavior, route protection, permissions, and authorization review rules.

Scope: keep cross-cutting auth, session, role, permission, and route-guard rules here; keep feature-specific workflow rules in `docs/features/` and launch-time cookie/CORS values in `docs/deployment.md`.

## Model

- Accounts are admin-created; no public registration or invite acceptance is active.
- Roles are `admin`, `teacher`, and `student`.
- Active sessions use cookie-backed tokens stored as hashes in Postgres.
- Backend and database are authoritative for auth, permissions, lifecycle, and integrity.
- Frontend guards and role affordances only improve UX.

## Auth Rules

- Login uses bcrypt, missing-account timing hardening, active-user checks, bounded in-memory rate limits, and row locking before session creation.
- Login network limits and session IP audit use the direct remote address by default, or `X-Forwarded-For` only when the direct remote address matches configured `TRUSTED_PROXY_CIDRS`. Forwarded chains are read from right to left so client-supplied spoofed prefixes are ignored behind trusted proxies.
- Inactive users and revoked/expired sessions are rejected.
- Logout is public behind the origin guard so stale cookies can be cleared; presented tokens are revoked when possible and cookies expire with matching flags.
- Unsafe requests that send or write session cookies require trusted origin evidence.
- Wildcard CORS is not trusted for credentialed sessions.
- Production startup rejects unsafe cookie/CORS/storage/database config, weak bootstrap-admin secrets, and empty-DB startup without either bootstrap credentials or an existing active admin.
- Frontend `/auth/me` syncs current-user query state to the auth store; the store and protected query cache clear only on confirmed `401`, while non-401 session bootstrap failures show retryable errors instead of forcing login.

## Permission Rules

| Role | Project Access |
| --- | --- |
| Admin | View/manage existing projects and accounts. |
| Teacher | View/manage supervised projects and owned folders. |
| Student | View member projects and submit assigned work. |

- Folder routes are teacher/admin only.
- Person work pages are permission-scoped: teachers can view related students and themselves, students can view supervisors only through shared projects, and admins can view any permitted person/project relationship.
- Project-scoped manager writes require relationship checks plus lifecycle gates.
- Feature handlers add stricter checks for assignments, submissions, reviews, resources, and evidence.
- Manager/viewer authority must be rechecked inside transactions for stale-sensitive writes.
- Workspace organization writes must recheck the acting teacher/admin and target owner/supervisor inside the mutation transaction.
- Admin account mutations must recheck the acting admin's active role inside the mutation transaction.

## Source Map

| Source | Owns |
| --- | --- |
| `apps/api/internal/app/auth.go` | Login/logout/session middleware, cookies, session revocation. |
| `apps/api/internal/app/security.go` | Origin guard, login rate limiter, trusted-proxy client IP extraction. |
| `apps/api/internal/app/permissions.go` | Project viewer/manager helpers and transaction rechecks. |
| `apps/api/internal/config/config.go` | Cookie/CORS/trusted-proxy/bootstrap/storage production validation. |
| `apps/api/internal/app/bootstrap.go` | Bootstrap admin creation safety. |
| `apps/web/src/app/router.tsx` | Protected routes, admin guard, folder guard, redirects. |
| `apps/web/src/features/auth` | Login page, auth API, current-user hook. |
| `apps/web/src/lib/permissions.ts` | Client affordance helpers. |
| `apps/web/src/stores/auth-store.ts` | Current-user mirror for layout/affordances. |

## Review Checklist

- Is the backend enforcing the rule, not only hiding UI?
- Does the route validate malformed IDs before UUID SQL casts?
- Does the transaction recheck active user status and manager/viewer relationship where stale state matters?
- Do account role/status changes preserve the last active admin?
- Are session/cookie flags valid for the frontend/API deployment topology?
- Do stale `403`/`409` client errors invalidate affected data?

## Verify

- `make api-build`
- Focused auth/security/config/account lifecycle tests.
- `apps/web/e2e/access-control.spec.ts` for visible denials and stale affordances.
- Web lint/build for auth UI or route-guard changes.

## Gaps

- Login rate limiting is in memory and per API instance; configure `TRUSTED_PROXY_CIDRS` before relying on source-IP behavior behind hosted proxies.
- No forgot-password, email verification, forced password-change, or full CSRF-token flow.
- Admin override/activity-log UI is incomplete.
