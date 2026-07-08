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

| ID | Topic | Status | Priority | Audit Notes |
| --- | --- | --- | --- | --- |
| A01 | Product scope and business workflow | clean | high | Audited; no open findings. |
| A02 | Roles, permissions, and access control | clean | critical | Audited; no open findings. |
| A03 | Project lifecycle logic | clean | critical | Audited; no open findings. |
| A04 | Auth and session security | clean | critical | Audited; no open findings. |
| A05 | Admin account management | clean | high | Audited; no open findings. |
| A06 | Workspace and project organization | clean | medium | Audited; no open findings. |
| A07 | Project detail and Work Plan | clean | high | Audited; no open findings. |
| A08 | Team and membership logic | clean | high | Audited; no open findings. |
| A09 | Assignments and official tasks | clean | high | Audited; no open findings. |
| A10 | Submissions and review workflow | clean | critical | Audited; no open findings. |
| A11 | Resources and evidence files | clean | high | Audited; no open findings. |
| A12 | Dashboard logic | clean | high | Audited; no open findings. |
| A13 | Database schema and integrity | clean | critical | Audited; no open findings. |
| A14 | Backend API implementation | clean | high | Audited; direct findings resolved. |
| A15 | Frontend state and data flow | clean | high | Audited; direct findings resolved. |
| A16 | Visual UI system and accessibility | clean | high | Audited; direct findings resolved. |
| A17 | Testing and QA coverage | clean | medium | Direct and cross-linked findings resolved. |
| A18 | Deployment, security, and operations | clean | high | Direct and cross-linked findings resolved. |
| A19 | Documentation accuracy | clean | medium | Audited; README command drift and A18 doc clarifications resolved. |

## Current Findings

No current findings.

## Resolved Findings

Resolved items stay compact here: record the durable fix and verification. Keep detailed behavior in feature docs and long audit narratives in git history.

Resolved in the current A02 pass: pending assignment-submission resource links now require the submission owner or a project manager, with regression coverage in `apps/api/internal/app/lifecycle_test.go`.

Resolved in the current A13 pass: new progress submissions are database-gated to official assignment rows, blocking direct child-task progress inserts with migration `20260708000100_block_child_task_progress_updates.sql` and regression coverage in `apps/api/internal/app/lifecycle_test.go`.

Resolved in the current A03 pass: `on_hold` support writes are manager-only, pending-submission resource delete now enforces submitter-or-manager authority, archived folders no longer expose project removal, and closed/read-only resource affordances use view-oriented labels.

Resolved in the current A10 pass: assignment detail now pauses submission/review affordances behind explicit project lifecycle loading/error notices, and evidence upload/delete controls wait for evidence metadata to load before appearing.

Resolved in the current A07 pass: project detail assignment creation now waits for checkpoint and student data, and empty Work Plan/team copy branches by lifecycle and manager ability. This resolves `F-A03-002`.

Resolved in the current A08 pass: project member role changes now lock the target account and revalidate it as an active student before leader/member updates, with regression coverage in `apps/api/internal/app/lifecycle_test.go`.

Resolved in the current A09 pass: `F-A09-001` assignment assignee validation now rejects malformed body IDs and locks target `project_members`/`users` rows before insert, preventing stale-account or concurrent-deactivation races from creating assignments for inactive students. Verified with focused assignment lifecycle tests, `make api-build`, DB-backed `make api-test`, and `git diff --check`.

Tracker correction in the current pass: A02, A03, and A13 are the clean exceptions. Prior open rows for those topics were stale tracker state and are no longer listed as current findings.

Audited in the current A01 pass: active routes and API registrations remain project-first with legacy `/projects*` and `/classes*` redirects only; removed invitation/course/feedback/meeting/child-task workflows are not active product surfaces.

Audited in the current A04 pass: login/session/origin guard behavior remains covered by focused lifecycle tests, with no new auth/session findings from this pass.

Resolved in the current A05 pass: admin create/update/password mutations now serialize account-control writes and re-lock/revalidate the acting admin as active inside the mutation transaction, preventing stale admin sessions from completing account mutations after concurrent demotion or deactivation. Verified with focused auth/admin lifecycle tests.

Resolved in the current A06 pass: project creation, folder creation, and folder update now re-lock/revalidate the acting teacher/admin plus target supervisor/owner inside the mutation transaction, preventing stale creator/owner/supervisor races from creating or updating workspace organization records. Verified with focused DB-backed lifecycle tests.

Audited in the current A07/A08 pass: project detail source now matches the documented compact header, Work Plan, summary rail, resources, and team popover layout; milestone/team writes preserve transaction-scoped lifecycle, manager, and active-student rechecks. No new findings from this pass.

Resolved in the current A09/A10 pass: generic assignment update cannot silently reopen completed assignments, explicit manual status adjustments are audited, and negative review decisions must use `needs_changes` as the official assignment state so submission/review state, rollups, and UI copy stay consistent. Verified with focused DB-backed lifecycle tests.

Resolved in the current A11 pass: reviewed-submission evidence immutability now resolves database-compatible `uploaded_files` rows that target a `resource_link` pointing at a reviewed submission, and the API delete path blocks those files as reviewed support. Verified with focused DB-backed lifecycle tests and migration validation.

Resolved in the current A12 pass: dashboard overdue assignment queues and overdue stats now exclude assignments that already have a pending submission review, keeping pending reviews as the first manager action and preventing duplicate review/follow-up queue entries. Verified with focused DB-backed dashboard lifecycle tests.

Resolved in the current A14 pass: project/folder permission helpers now reject malformed UUID route IDs before SQL, admin user mutation routes validate `userId` before transactions, unexpected admin user lookup errors map to `500`, and shared list pagination rejects overflow-sized `page` values before offset calculation. Verified with focused DB-backed API route tests and `make api-build`.

Resolved in the current A15/A16/A17 pass: non-401 `/auth/me` bootstrap failures now show retryable errors instead of forcing login; confirmed `/auth/me` 401 clears protected query cache; stale workspace/admin errors refresh current-user data; project/task detail non-forbidden load failures render retryable errors; page error states announce as alerts; admin filters have persistent accessible names; project/task pages keep the app shell as the only `main` landmark; and stale dashboard Playwright assertions now match the current `Review work` heading. Verified with web lint/build and `git diff --check`.

Resolved in the current A15/A16/A17 remediation pass: `F-A15-001` pending-submission resource dialogs now derive writability from the current submission review state and switch reviewed submissions to read-only; `F-A15-002` server-paginated admin/workspace project and folder APIs refetch the last valid page when totals shrink; `F-A15-003` folder candidate search applies supervisor eligibility in the project API before pagination; `F-A16-001` shared dialogs now use a top-layer stack for Escape/Tab/backdrop handling and scroll locking; `F-A16-002` project and assignment forms now wire stable labels to inputs/selects/date pickers and label student search; `F-A16-003` folder-detail color radios and project attach combobox implement roving/active-descendant keyboard behavior; `F-A17-001` has a focused Playwright happy path for project/team/assignment/submission/review UI; `F-A17-002` makes `make api-test` fail fast without `TEST_DATABASE_URL` and adds `make api-test-unit`; and `F-A17-003` adds S3/R2-compatible storage tests for key generation, put/open/delete, content type, and not-found mapping. Verified with DB-backed `make api-test`, `make api-test-unit`, focused storage tests, `make api-build`, web lint/build, targeted `assignment-happy-path.spec.ts`, and `git diff --check`.

Resolved in the current A14/A18 remediation pass: `F-A14-001` evidence upload/delete now uses `uploaded_file_object_cleanup_jobs` to reconcile object storage and metadata after ambiguous failures. Upload creates a cleanup job before storing the object and completes it in the metadata transaction; metadata insert/commit failures leave or process the job so orphan objects are deleted. Delete removes metadata and enqueues object cleanup in one transaction, then attempts storage deletion; storage failures remain queued and are retried at API startup through `ProcessPendingStoredFileCleanups`. Verified with the cleanup migration, focused DB-backed upload/delete cleanup tests, local/R2 storage tests, and `make db-validate`.

Resolved in the current A14/A17 remediation pass: `F-A14-002` project-scoped nested collections now support explicit `page`/`limit` responses for members, assignments, checkpoints, resource links, evidence files, project progress-update history, and folder projects. Legacy no-query callers still receive array/detail responses, task detail submission history no longer has a hidden cap, folder detail exposes `projectsPage` metadata for paged project lists, and frontend relation loaders fetch and merge paged API results. The shared pagination guard rejects invalid or overflow-sized offsets without rejecting small valid limits. Verified with focused DB-backed nested pagination coverage in `apps/api/internal/app/lifecycle_test.go`.

Audited in the current A18 pass: `F-A17-003` remains resolved by the S3/R2-compatible storage tests.

Resolved in the current A18 remediation pass: `F-A18-001` login network rate limiting and session IP audit now use `X-Forwarded-For` only when the direct remote address matches configured `TRUSTED_PROXY_CIDRS`, walking the forwarded chain from right to left to avoid trusting spoofed prefixes; config validation rejects malformed proxy entries. `F-A18-002` production bootstrap safety now rejects weak bootstrap-admin secrets, rejects production startup without a database, and requires either bootstrap credentials or an existing active admin when production starts. Verified with focused config/security tests, DB-backed login/bootstrap tests, `make api-build`, and `git diff --check`.

Audited in the current A19 pass: documentation command drift from the new API test split was corrected in `README.md`, and deployment/security/resources docs were clarified for the A18 findings. No current A19 findings remain.

## Cross-Cutting Residual Risks

- Admin product surface remains partial: all-project management, richer admin analytics, and activity-log UI.
- Production evidence storage uses R2, but still needs retention, backup, MIME policy, malware scanning, quotas, and cost monitoring.
- Login rate limiting is in memory and per API instance; keep `TRUSTED_PROXY_CIDRS` aligned with hosted proxy topology and use shared limits or edge rules before horizontal scaling.
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
