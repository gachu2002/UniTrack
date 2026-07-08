# Dashboard

Purpose: document role-aware work summaries and dashboard scoping.

## User Problem

Users need a fast role-specific starting point: teachers/admins need pending review and project follow-up queues; students need actionable assigned work and recent submission context.

## UI And Routes

| Route / Surface | Owns |
| --- | --- |
| `/dashboard` | Role-aware stats, review queues, actionable assignments, attention projects, recent submissions. |

## Rules

- Admin/teacher dashboards prioritize pending reviews, overdue assignments, and active project follow-ups without a KPI summary strip.
- Student dashboards show one prioritized open-assignment list, then recent submissions.
- Dashboard UI keeps queues table-first for scanability: pending reviews, overdue assignments, project follow-ups, open assignments, and recent submissions use compact dashboard-specific tables.
- Dashboard SQL must stay role-scoped and lifecycle-aware; project follow-up limits should filter real candidates before applying caps.
- Dashboard queues use compact previous/next frontend pagination at four items per page only when a loaded queue exceeds one page; this is a scanability control, not a complete historical archive.
- Frontend copy should stay role-specific and avoid oversized KPI cards or dense full-page tables.

## Source Map

| Source | Owns |
| --- | --- |
| `apps/api/internal/app/dashboard.go` | Role-scoped stats, queues, project follow-ups, recent submissions. |
| `apps/web/src/features/dashboard/api.ts` | Dashboard API contract. |
| `apps/web/src/features/dashboard/pages/dashboard-page.tsx` | Dashboard rendering and role copy. |
| `apps/web/src/features/projects/attention.ts` | Project attention semantics. |
| `apps/web/e2e/dashboard.spec.ts` | Browser role-queue coverage. |

## Review Checklist

- Are SQL queues scoped correctly for admin, teacher, and student roles?
- Are archived projects and inactive/non-member records excluded where required?
- Are pending reviews ordered and capped without starving project follow-ups?
- Does UI copy stay role-specific instead of generic KPI clutter?
- Are empty, loading, error, and forbidden states readable?

## Verify

- Focused dashboard lifecycle tests in `apps/api/internal/app/lifecycle_test.go`.
- `apps/web/e2e/dashboard.spec.ts` for role queue coverage.
- `pnpm --filter @unitrack/web lint` and targeted dashboard Playwright when UI or queue semantics change.

## Gaps

- Empty/error dashboard states need more browser coverage.
- Richer admin analytics remains backlog.
