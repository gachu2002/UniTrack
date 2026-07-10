# Engineering Guide

This guide is the fast path for understanding what to read, what to change, and how to verify UniTrack work without mining every feature document first.

Use `docs/project.md` for current product status and feature ownership. Use `docs/architecture.md`, `docs/api-flows.md`, `docs/database.md`, `docs/security-auth.md`, `docs/deployment.md`, and `docs/testing.md` for cross-cutting review. Use feature docs for vertical UI/API/data/test behavior.

## Documentation Ownership

Use this scope before editing docs:

| Doc | Keep In | Keep Out |
| --- | --- | --- |
| `docs/project.md` | Goal, doc index, status, active routes, top risks, commands, next slices. | Feature manuals, detailed API rules, long audit narratives. |
| `docs/architecture.md` | Shared system shape, domain vocabulary, lifecycle/write patterns, API/data/state boundaries, cross-feature invariants. | Launch steps, feature UI detail, account-specific policy, test-suite catalog. |
| `docs/api-flows.md` | API route catalog, request/response rules, common sequences, transaction flow, frontend cache invalidation, focused API debugging guide. | Full feature behavior manuals, schema field reference, security policy deep dive. |
| `docs/database.md` | Database schema guide, table fields, relationships, integrity rules, FE/BE data contribution, migration map. | Exhaustive API route flow, deployment steps, feature-specific UX detail. |
| `docs/security-auth.md` | Auth model, sessions, roles, permission review rules, route guard ownership, security gaps. | Provider launch steps, feature-specific UX flows, exhaustive API route docs. |
| `docs/deployment.md` | First-launch stack, env, preflight, launch, rollback, hosted storage limits. | Product workflow detail, local test strategy, feature behavior manuals. |
| `docs/testing.md` | Verification chooser, command forms, Playwright knobs, suite map, coverage gaps. | Feature-specific expected behavior or audit findings. |
| `docs/audit.md` | Audit rubric, scorecard, current audit queue, open findings, residual risks, pass template. | Duplicated feature docs or temporary `/tmp/opencode` evidence. |
| `docs/features/*.md` | User problem, routes/surfaces, durable UI/API/data rules, source map, schema anchors when invariants depend on migrations, review checklist, verification, gaps. | Cross-cutting deployment/auth/testing manuals unless the feature directly changes them. |

When a doc-wide pass finds a stale name, update the source reference instead of adding compatibility docs. Create new docs only when a durable owner is missing.

## Change Reading Map

| Task | Read First | Source Hotspots | Minimum Useful Checks |
| --- | --- | --- | --- |
| Auth, sessions, roles, CORS | `docs/security-auth.md`, `docs/deployment.md` | `apps/api/internal/app/auth.go`, `security.go`, `permissions.go`, `server.go`, `apps/api/internal/config/config.go`, `apps/web/src/features/auth` | `make api-build`, focused auth/config/access tests, web lint for auth UI changes |
| Admin account changes | `docs/features/admin-accounts.md`, `docs/security-auth.md`, `docs/architecture.md` | `apps/api/internal/app/admin_users.go`, `auth.go`, `bootstrap.go`, `apps/web/src/features/admin`, `apps/web/src/lib/query-invalidation.ts` | focused admin lifecycle tests, web lint, targeted admin Playwright |
| New or changed API route | `docs/api-flows.md`, `docs/architecture.md`, `docs/security-auth.md`, relevant feature doc | `apps/api/internal/app/server.go`, `response.go`, `permissions.go`, feature handler file, `apps/web/src/types/api.ts`, feature `api.ts` | route/handler tests, `make api-build`, web lint/build if contract changes |
| Schema or integrity rule | `docs/database.md`, `docs/architecture.md`, relevant feature doc | `apps/api/db/migrations`, feature handlers using the data, `apps/api/internal/app/lifecycle_test.go` | `make db-validate`, focused DB/lifecycle tests, document migration behavior |
| Workspace, project, folder, team workflow | `docs/features/workspace-projects.md`, `docs/architecture.md`, `docs/security-auth.md` | `projects.go`, `classes.go`, `milestones.go`, related `apps/web/src/features/*` pages/components | focused lifecycle tests, web lint/build, targeted Playwright |
| Assignment, submission, review workflow | `docs/features/assignment-review.md`, `docs/architecture.md`, `docs/security-auth.md` | `tasks.go`, task detail/progress/evidence components | focused lifecycle tests, web lint/build, targeted Playwright |
| Resources, evidence, storage | `docs/features/resources-evidence.md`, `docs/deployment.md`, `docs/architecture.md` | `resources.go`, `files.go`, `storage.go`, config/storage env | focused lifecycle/storage tests, `make db-validate`, targeted support/evidence Playwright |
| Frontend state or cache behavior | `docs/architecture.md`, relevant feature doc | `apps/web/src/lib/query-keys.ts`, `query-invalidation.ts`, feature hooks/pages/forms | web lint/build, targeted state-flow/browser regression |
| UI, layout, accessibility | `docs/features/ui-system.md`, `docs/testing.md`, relevant feature doc | `apps/web/src/components`, `apps/web/src/index.css`, feature route/page components | web lint/build, targeted accessibility/role-flow Playwright |
| Deployment, operations | `docs/deployment.md`, `docs/security-auth.md`, `docs/features/resources-evidence.md` | `apps/api/internal/config/config.go`, `storage.go`, `apps/api/.env.example` | `make api-build`, config tests, `make db-validate`, manual deployment checklist updates |
| Documentation or audit cleanup | `docs/project.md`, this guide, `docs/audit.md`, relevant feature doc | changed docs plus implementation source being described | read-back, source cross-check, no product tests unless behavior changed |

## Verification Chooser

Pick the smallest check that proves the risk touched.

| Risk Touched | Prefer |
| --- | --- |
| Go handler, auth, permissions, lifecycle, storage, config | `make api-build` plus focused `go test`; use `TEST_DATABASE_URL='<postgres-url>' make api-test` for DB coverage or `make api-test-unit` for non-DB tests |
| Database migration or trigger | `make db-validate` plus focused DB lifecycle test |
| Frontend TypeScript/UI behavior | `pnpm --filter @unitrack/web lint` and `pnpm --filter @unitrack/web build` |
| User-visible role flow | targeted Playwright spec or a new focused spec when the gap is important |
| Docs-only change | read-back and source cross-check; do not run unrelated builds |

## Vocabulary And Compatibility Names

| Product Term | Compatibility Name | Rule |
| --- | --- | --- |
| Folder | `class`, `classes`, `course_sections` | UI and docs should say folder unless explaining API/DB compatibility names. Do not revive a standalone course module without explicit scope. |
| Assignment | `task`, `tasks` | Active product work is assignment-scoped. Historical child tasks remain schema-only and should not re-enter active workflows without a deliberate redesign. |
| Submission | `progress_update`, `progress_updates` | Student work submissions are assignment-scoped progress updates with review state. |
| Evidence file | `uploaded_files` | Evidence is private support data, readable after review, with writes gated by project and submission lifecycle. |
| Resource link | `resource_links` | Resource links support projects, milestones, assignments, and pending assignment submissions; they are not a separate product module. |
| Project manager | Admin or supervising teacher | Students are viewers/contributors only. Frontend affordances are UX; backend and DB constraints are authoritative. |
| Closed project | `completed` or `archived` | Completed projects allow limited pending-review/status behavior; archived projects are read-only except reactivation/status rules. |

## Stable Decisions

| Decision | Why It Exists | Revisit When |
| --- | --- | --- |
| Project-first product model | Keeps the core workflow on teacher-supervised project work instead of course administration. | A real course/term/section workflow becomes a validated requirement. |
| Admin-created accounts, no public invites | Reduces onboarding/security scope for the MVP and keeps membership controlled by admins/teachers. | Email delivery, verification, or self-service onboarding becomes necessary. |
| Assignment-first submissions, no active child work items | Keeps student reporting and teacher review simple and auditable. | Users need real subtask tracking that affects grading/review workflows. |
| Server and database are authoritative for access/integrity | Frontend guards improve UX but cannot protect data by themselves. | Never as a replacement; only add layers such as generated contracts or policy helpers. |
| Transaction-locked lifecycle and manager rechecks | Prevents stale permission/status races on project-scoped writes. | New write routes should preserve this convention or replace it with a stronger shared abstraction. |
| Private R2 evidence storage through API-proxied downloads | Preserves project permissions while making hosted evidence durable. | Download volume/cost justifies signed URLs with equivalent authorization controls. |
| No custom CDN or load balancer for first launch | Vercel and Render already provide HTTPS routing; single API instance avoids shared-rate-limit complexity. | Traffic, uptime, or operational requirements exceed first-launch assumptions. |
| Raw SQL in feature handlers for now | Keeps the scaffold thin and explicit while the domain stabilizes. | Query duplication, contract drift, or performance tuning becomes the dominant cost. |

## Documentation Efficiency Rules

- Keep `docs/project.md` as the executive index: status, routes, top risks, commands, and next slices.
- Keep vertical feature behavior, UI/API/data rules, source maps, tests, and maintenance checklists in `docs/features/*.md`.
- Keep cross-cutting architecture, auth/security, deployment, and testing guidance in top-level docs.
- Keep `docs/audit.md` focused on current audit state and durable findings; avoid relying on non-durable `/tmp/opencode` evidence as the only proof of behavior.
- Prefer committed automated tests or committed docs over temporary screenshots for long-lived evidence.
- When behavior changes, update only the docs that own that behavior plus `docs/project.md` if status, routes, risks, source maps, or next slices changed.
