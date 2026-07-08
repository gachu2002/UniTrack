# Audit Tracker And Rubric

Compact working tracker and reusable rubric for UniTrack audits. Detailed behavior belongs in feature docs; durable proof belongs in source/tests; historical audit narratives live in git history.

## Agent Audit Procedure

1. Select an audit topic from the queue or define a narrow scope from recent product, API, schema, deployment, or QA changes.
2. Read `docs/project.md`, `docs/engineering-guide.md`, the owning feature doc, and any cross-cutting docs named by the engineering guide.
3. Inspect implementation sources and tests before judging. Do not score from docs alone unless the task is docs-only.
4. Judge against the core criteria below, with extra weight on UniTrack critical invariants.
5. Record findings with severity, evidence, impact, recommendation, tradeoff, and verification.
6. Mark a topic `clean` only when evidence supports it. If risk remains but is accepted for this stage, mark it as residual risk instead of inventing a finding.
7. Update this tracker when audit state changes: adjust `Audit Queue`, add or revise `Current Findings`, move fixed items into `Resolved Findings`, refresh residual risks, and update owning feature docs for durable behavior changes.

## Status And Severity

Statuses: `not_started`, `in_progress`, `findings_open`, `clean`, `deferred`.

Severities: `critical` for security/data-loss/cross-tenant/unusable flow, `high` for broken business/permission/lifecycle or major UX blocker, `medium` for fragile/confusing/test-gap issues, `low` for polish/docs/minor refactor.

## Score Scale

Use scores only to compare audit areas and prioritize follow-up work. Findings and evidence are more important than the numeric score.

| Score | Meaning | Typical Action |
| --- | --- | --- |
| 1 | Unsafe, broken, or unclear enough to block launch or core use. | Fix immediately before relying on the area. |
| 2 | Works partially but has important correctness, security, or maintenance gaps. | Schedule near-term remediation and add targeted tests. |
| 3 | Acceptable for current project stage with known tradeoffs. | Track residual risks and improve when touching the area. |
| 4 | Good, consistent, maintainable, and covered for likely regressions. | Keep patterns stable and reuse them for nearby work. |
| 5 | Excellent, hardened, observable, well documented, and resilient under expected growth. | Treat as a reference implementation. |

## Whole-Project Weights

Use these weights for a full project health review. For a feature audit, keep the same criteria but weight the feature's primary risks more heavily.

| Area | Weight |
| --- | --- |
| Architecture, domain model, and lifecycle design | 15% |
| Auth, permissions, and security | 15% |
| Data integrity and transaction safety | 15% |
| Code quality, design patterns, and maintainability | 15% |
| Testing and regression safety | 15% |
| Frontend UX, accessibility, and state flow | 10% |
| Deployment, storage, and operations | 10% |
| Documentation accuracy and tradeoff clarity | 5% |

## Core Criteria

| Criterion | Judge | Evidence Signals |
| --- | --- | --- |
| Product fit | The implemented routes, roles, and workflows support `Teacher -> Project -> Assignment -> Submission -> Review` without reviving removed product surfaces. | Route list, feature docs, UI copy, happy-path and forbidden-path behavior. |
| Architecture boundaries | Frontend, API, database, auth, storage, and deployment concerns stay separated with clear ownership. | Handler boundaries, feature slices, query keys, storage abstraction, docs matching source. |
| Domain model | Entities, statuses, ownership, membership, and lifecycle transitions match the current project-first vocabulary. | Migrations, constraints, handler lifecycle checks, feature source maps. |
| Auth and authorization | Identity, sessions, roles, route guards, and resource access are enforced server-side and not only by frontend affordances. | Middleware, permission helpers, role tests, forbidden responses, protected downloads. |
| Data integrity | Invalid states are prevented by database constraints, triggers, transactions, row locks, and consistent manager/lifecycle rechecks. | Migrations, transaction scopes, lifecycle tests, direct-write constraints. |
| API quality | Endpoints are predictable, validated, permissioned, documented by behavior, and consistent in success/error response shape. | `server.go`, `response.go`, handlers, request validation, frontend API types. |
| Frontend state flow | Data fetching, mutations, cache invalidation, loading/error/empty/forbidden states, and stale data handling are consistent. | Query keys, invalidation helpers, route loaders/pages, feature hooks, browser behavior. |
| UX and accessibility | The product is understandable, keyboard usable, responsive, and clear for each role and lifecycle state. | Labels, dialogs, skip link, focus behavior, mobile layout, empty/error copy. |
| Code quality | Code is readable, cohesive, minimally duplicated, and avoids premature abstraction or broad compatibility layers. | Function size, repeated SQL/UI logic, naming, local complexity, deleted-surface references. |
| Design patterns | Patterns are intentional and consistent with the stack rather than mechanical or overbuilt. | React forms/state usage, Go handler structure, SQL conventions, shared components. |
| Testing | Critical business, permission, lifecycle, storage, and role-flow risks have focused automated coverage. | `make api-test`, DB lifecycle tests, Playwright specs, web lint/build, documented gaps. |
| Performance | Expected data sizes do not create obvious slow queries, N+1 patterns, oversized bundles, or excessive refetching. | Query shape, indexes, page composition, network calls, build output when relevant. |
| Reliability | Failures are handled without partial writes, silent data loss, misleading UI, or unrecoverable user states. | Error paths, transaction rollback, storage failure handling, retry/refetch behavior. |
| Deployment and operations | Environment, migrations, storage, rollback, hosted limits, and first-launch assumptions are reproducible and documented. | `docs/deployment.md`, config parsing, env examples, build commands, storage setup. |
| Observability | Production issues can be diagnosed with available health checks, logs, audit records, and future metric hooks. | Health/readiness routes, logs, activity records, residual observability risks. |
| Maintainability | A new developer or agent can find the owning doc, source files, tests, invariants, and verification path quickly. | `docs/engineering-guide.md`, feature docs, source maps, comments, test names. |
| Tradeoffs and debt | Shortcuts are explicit, proportionate to project stage, and have clear revisit triggers. | Residual risks, next slices, stable decisions, missing hardening called out. |

## UniTrack Critical Invariants

Treat violations of these invariants as `high` or `critical` unless the evidence clearly shows a contained low-impact issue.

- Product flow remains project-first: `Teacher -> Project -> Assignment -> Submission -> Review`.
- UI and docs say folder and assignment; API/DB compatibility names may still use `classes`, `course_sections`, and `tasks`.
- Backend and database remain authoritative for auth, permissions, lifecycle, and integrity.
- Project-scoped writes preserve transaction-scoped manager and lifecycle rechecks under project-row locks.
- Resource and evidence targets preserve project-match rules and reviewed-support immutability.
- Evidence remains private and permissioned through API-controlled access.
- Archived projects stay read-only except explicitly documented reactivation/status behavior.
- Removed surfaces stay removed from active UI/API unless a task explicitly reintroduces them.
- Accessibility basics remain present: skip link, dialog semantics, keyboardable controls, labels, and readable empty/error/forbidden states.

## Evidence Rules

- Prefer committed source, tests, migrations, and docs over assumptions or temporary notes.
- Include file paths and line references when reporting findings.
- Prove security, permission, lifecycle, and data-integrity claims from backend/database behavior, not only frontend guards.
- Use the smallest relevant verification command from `docs/engineering-guide.md` and `docs/testing.md`.
- For docs-only audits, perform read-back and source cross-check instead of unrelated builds.
- If verification is not run, state why and identify the residual risk.

## Audit Queue

| ID | Topic | Status | Priority |
| --- | --- | --- | --- |
| A01 | Product scope and business workflow | clean | high |
| A02 | Roles, permissions, and access control | findings_open | critical |
| A03 | Project lifecycle logic | findings_open | critical |
| A04 | Auth and session security | clean | critical |
| A05 | Admin account management | clean | high |
| A06 | Workspace and project organization | clean | medium |
| A07 | Project detail and Work Plan | clean | high |
| A08 | Team and membership logic | clean | high |
| A09 | Assignments and official tasks | clean | high |
| A10 | Submissions and review workflow | clean | critical |
| A11 | Resources and evidence files | clean | high |
| A12 | Dashboard logic | clean | high |
| A13 | Database schema and integrity | findings_open | critical |
| A14 | Backend API implementation | clean | high |
| A15 | Frontend state and data flow | clean | high |
| A16 | Visual UI system and accessibility | clean | high |
| A17 | Testing and QA coverage | clean | medium |
| A18 | Deployment, security, and operations | clean | high |
| A19 | Documentation accuracy | clean | medium |

## Current Findings

| ID | Audit | Severity | Finding | Evidence | Recommended Fix |
| --- | --- | --- | --- | --- | --- |
| F-A02-001 | A02 | medium | Some project and folder create/update paths rely on request-context role/ownership checks without the same transaction-scoped actor, supervisor, or owner rechecks used by more sensitive project writes. | `apps/api/internal/app/projects.go`, `apps/api/internal/app/classes.go` | Re-read/lock the relevant actor, supervisor, and folder owner rows inside these mutation transactions, or explicitly document the accepted race window. |
| F-A02-002 | A02 | low | Admin mutations rely on the request-context admin role and do not re-lock the acting admin in each mutation transaction. | `apps/api/internal/app/admin_users.go` | Re-read/lock the actor for admin create/update/password mutations when tightening stale admin demotion/deactivation races. |
| F-A02-003 | A02 | low | Archived project reactivation can preserve a supervisor who was demoted or deactivated while the project was archived. | `apps/api/internal/app/projects.go`, `apps/api/internal/app/admin_users.go` | Validate the current supervisor before reactivating archived projects, or include archived projects in supervisor replacement flows. |
| F-A03-001 | A03 | medium | Project lifecycle status gates are enforced by API helpers, but not by database triggers for direct writes to project-scoped work, team, and support tables. | `apps/api/internal/app/projects.go`, `apps/api/db/migrations` | Either document lifecycle as API-enforced only, or add deferrable project-status triggers for direct-write safety on high-risk tables. |
| F-A13-001 | A13 | medium | Removed numeric-assessment schema remains active enough for direct writes but lacks target/project-match integrity. | `apps/api/db/migrations/20260606000300_assessments_and_milestone_feedback.sql`, `apps/api/internal/app/milestones.go` | Drop the unused `assessments` table and active cleanup reference, or quarantine it with explicit legacy constraints/tests. |
| F-A13-002 | A13 | medium | `progress_updates.review_status` and `progress_reviews` can drift under direct SQL because matching review-row/status consistency is app-maintained. | `apps/api/db/migrations/20260601000100_init_mvp.sql`, `apps/api/db/migrations/20260603000100_lifecycle_hardening.sql`, `apps/api/internal/app/tasks.go` | Add a deferrable consistency trigger or derive review state from `progress_reviews`. |
| F-A13-003 | A13 | low | Reviewed-support immutability covers direct `progress_update` evidence, but database-compatible `uploaded_files` attached to `resource_link` targets are not resolved through the resource link to a reviewed submission. | `apps/api/db/migrations/20260621000100_support_target_integrity.sql`, `apps/api/db/migrations/20260621000200_reviewed_support_immutability.sql`, `apps/api/internal/app/files.go` | Remove `resource_link` file compatibility if unused, or extend immutability checks through `resource_link -> progress_update`. |

## Resolved Findings

Resolved items stay compact here: record the durable fix and verification. Keep detailed behavior in feature docs and long audit narratives in git history.

Resolved in the current A02 pass: pending assignment-submission resource links now require the submission owner or a project manager, with regression coverage in `apps/api/internal/app/lifecycle_test.go`.

Resolved in the current A13 pass: new progress submissions are database-gated to official assignment rows, blocking direct child-task progress inserts with migration `20260708000100_block_child_task_progress_updates.sql` and regression coverage in `apps/api/internal/app/lifecycle_test.go`.

Resolved in the current A03 pass: `on_hold` support writes are manager-only, pending-submission resource delete now enforces submitter-or-manager authority, archived folders no longer expose project removal, and closed/read-only resource affordances use view-oriented labels.

Resolved in the current A10 pass: assignment detail now pauses submission/review affordances behind explicit project lifecycle loading/error notices, and evidence upload/delete controls wait for evidence metadata to load before appearing.

Resolved in the current A07 pass: project detail assignment creation now waits for checkpoint and student data, and empty Work Plan/team copy branches by lifecycle and manager ability. This resolves `F-A03-002`.

Resolved in the current A08 pass: project member role changes now lock the target account and revalidate it as an active student before leader/member updates, with regression coverage in `apps/api/internal/app/lifecycle_test.go`.

Resolved in the current A09 pass: `F-A09-001` assignment assignee validation now rejects malformed body IDs and locks target `project_members`/`users` rows before insert, preventing stale-account or concurrent-deactivation races from creating assignments for inactive students. Verified with focused assignment lifecycle tests, `make api-build`, DB-backed `make api-test`, and `git diff --check`.

## Cross-Cutting Residual Risks

- Admin product surface remains partial: all-project management, richer admin analytics, and activity-log UI.
- Production evidence storage uses R2, but still needs retention, backup, MIME policy, malware scanning, quotas, repair jobs, and cost monitoring.
- Login rate limiting is in memory; use shared limits or edge rules before horizontal scaling.
- Observability remains basic: health/readiness and logs exist, but metrics, tracing, alerting, and audit UI are incomplete.
- Browser coverage is focused, not comprehensive.
- Some safety patterns remain convention-based: route ID validation, transaction-scoped lifecycle/manager rechecks, frontend stale-error invalidation.

## Pass Template

```md
## <Audit ID> <Topic>

Status:
Date:
Scope:
Evidence:
Score:

| Severity | Finding | Evidence | Impact | Recommended Fix | Verification |
| --- | --- | --- | --- | --- | --- |

Residual risks:
Follow-up docs/tests:
```

Use this finding shape when a table row is too dense:

```md
Finding:
Severity:
Area:
Evidence:
Impact:
Recommendation:
Tradeoff:
Verification:
```

Start a new audit cycle only after meaningful product, API, schema, deployment, or QA scope changes, or pick the next product slice from `docs/project.md`.
