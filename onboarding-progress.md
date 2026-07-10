# UniTrack Onboarding Progress

This is a local learning tracker for understanding UniTrack end to end. It is not product documentation and should be updated as the walkthrough progresses.

Training protocol: use `onboarding-training.md`. Do not mark sections complete until the learner passes the teach-back checkpoint.

## How To Resume

Use this prompt in a future session:

```text
Start UniTrack training mode. Read onboarding-training.md and onboarding-progress.md. Begin at the current step. Do not advance progress until I pass the teach-back checkpoint.
```

## Current Position

Last completed: Product overview
Current step: Architecture map
Next step: Backend/API map

Important: prepared notes below are not counted as learned until the learner reviews them, answers the checkpoint questions, and confirms confidence.

## Confidence

Rate each area from 1 to 5.

| Area | Confidence | Notes |
| --- | ---: | --- |
| Product purpose and vocabulary | 3/5 | Learner passed teach-back: can explain goal, roles, core workflow, vocabulary mapping, and main routes. |
| Architecture | 1/5 | Notes are prepared, but this has not been reviewed interactively yet. |
| Backend/API | 1/5 | Need to trace server setup, middleware, handlers, responses, and permissions. |
| Database | 1/5 | Need to trace migrations, core entities, constraints, triggers, and lifecycle rules. |
| Frontend | 1/5 | Need to trace routing, feature folders, API client, query state, and UI system. |
| Testing | 1/5 | Need to map test commands, coverage areas, and gaps. |
| Deployment/security | 1/5 | Need to map env vars, services, auth/session risks, storage, and launch checks. |

## 8-Hour Roadmap

| Target Time | Section | Goal | Status |
| --- | --- | --- | --- |
| 0:00-0:30 | Product overview | Understand purpose, users, vocabulary, active routes, and main workflow. | Complete |
| 0:30-1:15 | Architecture map | Understand frontend/API/data/storage/deploy boundaries and domain model. | Current |
| 1:15-2:30 | Backend deep dive | Understand server setup, auth/session, permissions, handlers, responses. | Not started |
| 2:30-3:30 | Database deep dive | Understand migrations, entities, lifecycle constraints, integrity triggers. | Not started |
| 3:30-4:45 | Frontend deep dive | Understand routes, feature modules, API calls, cache/state, UI patterns. | Not started |
| 4:45-5:45 | End-to-end workflows | Trace login, workspace, assignment, submission, review, resources/evidence. | Not started |
| 5:45-6:30 | Testing strategy | Understand which tests prove which risks and where coverage is thin. | Not started |
| 6:30-7:15 | Deployment/security | Understand Vercel, Render, Neon, R2, env vars, startup and rollback. | Not started |
| 7:15-8:00 | Recap and quiz | Build a compact mental model, answer questions, identify weak spots. | Not started |

## Completed

- Created this onboarding tracker.
- Created `onboarding-training.md` to define the training-mode protocol, pass criteria, drills, and allowed learning files.
- Identified the intended walkthrough structure.
- Prepared source notes for product overview from `docs/project.md`, feature docs, frontend router, API route registration, and DTO names.
- Prepared source notes for architecture map from `docs/architecture.md`, `docs/deployment.md`, source entrypoints, frontend shared libs, API shared helpers, storage adapter, and representative migrations.

## Learner Checkpoints

| Section | Learner Status | Required Before Advancing |
| --- | --- | --- |
| Product overview | Completed | Passed teach-back on product goal, roles, main workflow, route examples, and UI/code vocabulary mapping. |
| Architecture map | Not completed | Explain web/API/database/storage/deployment boundaries and where each lives in source. |
| Backend/API map | Not started | Trace one request from route registration through auth, handler, permission check, SQL, and response. |

## Learner Checkpoint Results

| Date | Section | Result | Notes |
| --- | --- | --- | --- |
| 2026-07-10 | Product overview | Passed | Strong on goal, roles, core workflow, and main routes. Keep reinforcing that students can submit support/evidence where allowed, and that API/DB names are compatibility names rather than separate products. |

## Prepared Product Overview Notes

- UniTrack is a project-first platform for teacher-supervised student work.
- The core product flow is `Teacher -> Project -> Assignment -> Submission -> Review`.
- Users are `admin`, `teacher`, and `student`.
- Admins manage accounts and can manage existing projects.
- Teachers supervise projects, own folders, manage teams, create checkpoints/assignments, and review submissions.
- Students view member projects and submit assigned work.
- UI language uses `Workspace`, `folder`, `checkpoint`, `assignment`, `submission`, `review`, `resource`, and `evidence`.
- API/DB/source compatibility names still include `classes`, `course_sections`, `milestones`, `tasks`, `progress_updates`, and `uploaded_files`.
- Active frontend routes are `/login`, `/admin/users`, `/dashboard`, `/workspace`, `/workspace/classes/:classId`, `/workspace/projects/:projectId`, and `/workspace/projects/:projectId/tasks/:taskId`.
- Legacy `/projects*` and `/classes*` routes redirect into `/workspace*` routes only for compatibility.
- The backend registers protected REST routes under `/api/v1` for auth, admin users, dashboard, projects, members, milestones, tasks, progress updates, resources, files, and classes/folders.
- The backend and database are authoritative for auth, permissions, lifecycle, and integrity; frontend guards are UX only.

## Prepared Architecture Map Notes

- UniTrack is a thin monorepo with one frontend workspace under `apps/web` and one Go API under `apps/api`.
- Frontend stack: React, TypeScript, Vite, React Router, TanStack Query, Zustand, Axios, Tailwind/shadcn/Radix, React Hook Form, Zod, Playwright.
- Backend stack: Go, chi, pgx/Postgres, goose migrations, cookie sessions, raw SQL handlers, local/R2 evidence storage.
- Web app owns user-facing routes, forms, role-aware affordances, accessible states, API calls, cache keys, and cache invalidation.
- API owns auth boundary, trusted-origin/CORS/session rules, route contracts, permission checks, lifecycle transactions, and SQL writes.
- Database owns durable entities, foreign keys, uniqueness, deferred project-match triggers, assignment/submission integrity, and reviewed-support immutability.
- Storage owns evidence bytes only; evidence metadata and authorization remain in the API/database.
- Production deploy shape is Vercel frontend, Render Go API, Neon Postgres, Cloudflare R2, and basic uptime monitoring.
- Backend startup flow is config load/validation, pgx pool connection, bootstrap admin safety, pending evidence cleanup retry, then chi HTTP server.
- Frontend startup flow is React `StrictMode`, `BrowserRouter`, TanStack `QueryClientProvider`, then `AppRouter`.
- API base URL is `VITE_API_URL`; Axios uses `withCredentials: true` because sessions are cookie-backed.
- TanStack Query owns server state with `staleTime` 30 seconds and `gcTime` 10 minutes; Zustand only mirrors current user.
- Frontend API contracts are manually maintained in `apps/web/src/types/api.ts` and feature `api.ts` files, so DTO changes require manual sync.
- Shared API response helpers enforce JSON responses, strict 1 MB request body decoding, no unknown fields, single JSON value, and UUID route-param validation.
- Project-scoped writes should validate IDs/JSON, preflight access, open a transaction, lock the project row, recheck lifecycle and permissions, lock target rows, let DB constraints backstop invariants, commit, then reload DTOs.
- Key database invariants include one project leader, one pending submission per assignment, assigned active student requirement, official-assignment-only submissions, folder owner/project supervisor matching, support target project matching, and reviewed support immutability.
- Verification is risk-based: frontend changes use web lint/build, API changes use API build and focused Go tests, DB changes use `make db-validate`, and user-visible role flows use Playwright.

## Open Questions

- How do the main frontend route components compose their feature modules?
- How do individual backend handlers implement the project-scoped transaction/write pattern?
- Which lifecycle tests correspond to each database trigger or integrity invariant?
- Which tests are most useful for proving the main workflows?
- How exactly do auth cookies, trusted origins, and trusted proxy CIDRs interact in production?

## Key Files Learned

- `AGENTS.md`: repository working rules and command summary.
- `docs/project.md`: executive project index, routes, risks, commands, and next slices.
- `docs/engineering-guide.md`: task map for what to read, change, and verify.
- `docs/security-auth.md`: roles, sessions, route guards, and permission review rules.
- `docs/features/admin-accounts.md`: admin account lifecycle and `/admin/users` behavior.
- `docs/features/dashboard.md`: role-aware dashboard queues.
- `docs/features/workspace-projects.md`: workspace, folders, projects, checkpoints, and team rules.
- `docs/features/assignment-review.md`: assignment, submission, review, and evidence workflow.
- `docs/features/resources-evidence.md`: resource links, evidence files, storage, and immutability rules.
- `apps/web/src/app/router.tsx`: active frontend routes, protected layout, role guards, and legacy redirects.
- `apps/api/internal/app/server.go`: API route registration, CORS, origin guard, and auth-protected route group.
- `apps/api/internal/app/types.go`: role constants and main DTO shapes.
- `docs/architecture.md`: system shape, domain model, lifecycle rules, write pattern, API boundary, DB integrity, frontend state model.
- `docs/deployment.md`: first-launch stack, required env vars, preflight, launch steps, storage, health checks, rollback, limits.
- `docs/testing.md`: verification commands, Playwright knobs, suite map, and coverage gaps.
- `package.json`: root scripts for web and API commands.
- `pnpm-workspace.yaml`: frontend-only pnpm workspace rooted at `apps/web`.
- `apps/web/package.json`: frontend dependencies and scripts.
- `apps/api/go.mod`: Go module dependencies for chi, pgx, AWS S3/R2, and crypto.
- `Makefile`: canonical build/test/db commands.
- `apps/api/cmd/server/main.go`: API process entrypoint, config validation, DB connection, bootstrap, cleanup, graceful HTTP server.
- `apps/api/internal/config/config.go`: env parsing and production safety validation.
- `apps/api/internal/database/pool.go`: pgx pool creation and ping.
- `apps/api/internal/app/response.go`: JSON response, strict JSON decode, UUID validation, common DTO helpers.
- `apps/api/internal/app/permissions.go`: project viewer/manager helpers and transaction rechecks.
- `apps/api/internal/app/storage.go`: local and R2 evidence storage adapters.
- `apps/web/src/main.tsx`: frontend entrypoint and provider composition.
- `apps/web/src/app/providers.tsx`: TanStack Query provider and toaster.
- `apps/web/src/lib/env.ts`: frontend API URL resolution.
- `apps/web/src/lib/axios.ts`: credentialed Axios client and global 401 handling.
- `apps/web/src/lib/query-client.ts`: TanStack Query defaults.
- `apps/web/src/lib/query-keys.ts`: shared query key namespace.
- `apps/web/src/lib/query-invalidation.ts`: cross-feature invalidation helpers.
- `apps/web/src/lib/permissions.ts`: frontend-only lifecycle/role affordance helpers.
- `apps/web/src/types/api.ts`: manually mirrored API DTO contracts.
- `apps/api/db/migrations/20260601000100_init_mvp.sql`: initial domain tables.
- `apps/api/db/migrations/20260619000100_assignment_submission_integrity.sql`: assignment/submission integrity anchors.
- `apps/api/db/migrations/20260620000100_folder_and_task_integrity.sql`: folder-owner and project-supervisor integrity triggers.
- `apps/api/db/migrations/20260621000100_support_target_integrity.sql`: resource/evidence target project-match triggers.
- `apps/api/db/migrations/20260621000200_reviewed_support_immutability.sql`: reviewed submission support immutability.
- `apps/api/db/migrations/20260708000100_block_child_task_progress_updates.sql`: official-assignment-only submitter guard.

## Working Method

For each section:

1. Pre-quiz current understanding.
2. Explain the section in plain language.
3. Trace the claims into source files.
4. Trace one concrete workflow or request.
5. Ask the learner to teach it back.
6. Correct gaps and record weak spots.
7. Update this tracker only if the learner passes the checkpoint.

## Session Log

| Date | Update |
| --- | --- |
| 2026-07-09 | Created tracker and set current step to Product overview. |
| 2026-07-09 | Added `onboarding-training.md` and switched future sessions to training mode with teach-back gates. |
| 2026-07-09 | Prepared product overview notes from docs and source, but did not count learner completion. |
| 2026-07-09 | Prepared architecture map notes from docs and source, but did not count learner completion. |
| 2026-07-09 | Corrected tracker to distinguish assistant-prepared notes from learner-completed checkpoints. |
| 2026-07-10 | Learner passed Product overview teach-back and advanced current step to Architecture map. |
