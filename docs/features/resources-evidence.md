# Resources And Evidence

Purpose: document resource links and evidence files used to support project supervision without becoming separate product modules.

## User Problem

Teachers and students need support material attached to project work, but evidence must stay private, permissioned, durable, and immutable after review.

## UI And Routes

| Route / Surface | Owns |
| --- | --- |
| Project detail | Project/milestone/assignment resource links. |
| Assignment detail | Pending-submission resources, evidence panels, read-only reviewed support. |
| File download route | API-proxied evidence download after project access checks. |

## Rules

- Resource links attach to project, milestone, assignment, or pending assignment submission targets.
- Pending assignment submission resource writes require the submission owner or a project manager.
- API/UI evidence uploads attach to assignment progress submissions only; `uploaded_files` keeps broader database target compatibility.
- Evidence uploads are limited to 10 MB per file.
- Reads/downloads remain available to project viewers, including reviewed and closed records.
- Resource writes and evidence deletes use the support-change lifecycle gate; students/contributors may change support on `active` projects, while `on_hold` support maintenance is manager-only. Evidence uploads use the student-submission gate (`active` only).
- Evidence upload/delete controls are hidden until evidence metadata has loaded successfully, so users do not act against an unknown file state.
- Support writes must recheck current project access, manager/owner authority, target validity, and submission state under project locks.
- Reviewed submission support records are immutable in API and database; pending submissions can still receive support while lifecycle allows it.
- Development/tests use local files; production requires private R2 through API-proxied downloads.
- Deletes remove stored objects before metadata so failed cleanup remains retryable.

## Source Map

| Source | Owns |
| --- | --- |
| `apps/api/internal/app/resources.go` | Resource CRUD, target validation, ownership/manager checks. |
| `apps/api/internal/app/files.go` | Evidence upload/download/delete and metadata writes. |
| `apps/api/internal/app/storage.go` | Local and R2 storage adapters. |
| `apps/api/internal/config/config.go` | Upload storage env and production validation. |
| `apps/api/db/migrations/*resource_links_milestones.sql`, `*support_target_integrity.sql`, `*reviewed_support_immutability.sql` | Resource target, project-match, and reviewed-support immutability anchors. |
| `apps/web/src/features/resources` | Resource dialog/chips/actions. |
| `apps/web/src/features/files` | Evidence panel upload/download/delete UI. |
| `apps/web/src/features/tasks` | Submission support placement and review blocking. |

## Review Checklist

- Does the support target belong to the same project?
- Is write access lifecycle-gated and rechecked under project locks?
- Are reviewed submission resources/evidence immutable in API and DB?
- Are reads/downloads still available for reviewed and closed records?
- Does object deletion happen before metadata deletion so failed cleanup remains retryable?
- Are production storage changes reflected in `docs/deployment.md`?

## Verify

- Focused resource/evidence lifecycle/storage/immutability tests.
- `make db-validate` when target triggers change.
- Access-control Playwright for closed evidence read-only behavior; add targeted browser specs for new resource/evidence UI.

## Gaps

- Production hardening still needs retention, backup, MIME policy, malware scanning, quotas, repair jobs, and cost monitoring.
- Resource dialog and evidence panel browser coverage is partial.
- Resource delete confirmation still stacks over the resource dialog.
