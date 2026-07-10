# UniTrack Training Mode

This file defines how to learn UniTrack quickly without changing product code. Use it together with `onboarding-progress.md`.

## Prime Directive

Progress is based on learner understanding, not assistant exploration.

A section is complete only when the learner can explain the section back, answer checkpoint questions, and identify the key source files without guessing.

## Session Start Prompt

Use this prompt to resume training:

```text
Start UniTrack training mode. Read onboarding-training.md and onboarding-progress.md. Begin at the current step. Do not advance progress until I pass the teach-back checkpoint.
```

## Assistant Rules

- Do not modify product code during onboarding unless explicitly requested later.
- Keep learning files separate from product docs and source code.
- Use docs as the spine, then trace claims into real files.
- Teach by workflows and source paths, not by dumping every file.
- Ask the learner to explain back before marking a section complete.
- If the learner cannot explain it, keep the section current and record the weak spot.
- Update `onboarding-progress.md` only after the checkpoint result is known.
- Separate `prepared notes` from `completed learning`.

## Learner Rules

- Ask questions as soon as something is vague.
- Prefer explaining in your own words over repeating exact wording.
- Say `pause` when overloaded; the tracker should record where to resume.
- Say `quiz me` when ready to test a section.
- Say `teach it another way` when an explanation does not land.

## Training Loop

Each section follows this loop:

1. Pre-quiz: 2 to 4 quick questions to expose current understanding.
2. Plain-English model: explain the section without code first.
3. Source trace: walk real files in the minimum useful order.
4. Flow trace: follow one user action or request end to end.
5. Teach-back: learner explains the model and file path back.
6. Correction: assistant fixes gaps and records weak spots.
7. Tracker update: mark complete only if teach-back is good enough.

## Pass Criteria

A section can advance when the learner can do these three things:

- Explain the concept without reading notes.
- Name the main source files involved.
- Trace one concrete flow or responsibility through the system.

Use confidence scores honestly:

| Score | Meaning |
| ---: | --- |
| 1/5 | I recognize terms but cannot explain them. |
| 2/5 | I can explain the high-level idea with help. |
| 3/5 | I can explain the section and find the main files. |
| 4/5 | I can trace flows and debug likely issues. |
| 5/5 | I can teach this section to someone else and make safe changes. |

## 8-Hour Training Sequence

| Order | Section | Main Question | Checkpoint |
| ---: | --- | --- | --- |
| 1 | Product overview | What is UniTrack and who does what? | Explain goal, roles, routes, vocabulary, and core workflow. |
| 2 | Architecture map | What owns what? | Explain web/API/database/storage/deploy boundaries and key files. |
| 3 | Backend/API map | How does a request move through the API? | Trace `main.go -> config -> server.go -> auth -> handler -> permissions -> SQL -> response`. |
| 4 | Database model | What invariants does Postgres enforce? | Explain core tables, migrations, constraints, triggers, and lifecycle gates. |
| 5 | Frontend map | How does UI fetch, mutate, and refresh data? | Trace `main.tsx -> router -> page -> feature api.ts -> query keys -> invalidation`. |
| 6 | End-to-end workflows | How do real user actions cross the stack? | Trace login, project creation, assignment, submission, review, evidence. |
| 7 | Testing | Which checks prove which risks? | Map API, DB, frontend, and Playwright checks to touched risks. |
| 8 | Deployment/security | How does this run safely in production? | Explain Vercel, Render, Neon, R2, env vars, cookies, CORS, trusted proxies. |
| 9 | Final drill | Can you navigate independently? | Answer mixed questions and locate files quickly. |

## Product Overview Drill

Goal: build the first mental model before deep code reading.

Files to use:

- `docs/project.md`
- `docs/engineering-guide.md`
- `apps/web/src/app/router.tsx`
- `apps/api/internal/app/server.go`
- `apps/api/internal/app/types.go`
- `docs/features/*.md`

Teach-back questions:

- What problem does UniTrack solve?
- What is the core workflow?
- What can admins, teachers, and students do?
- Why does the UI say `folder` and `assignment` while source names say `classes` and `tasks`?
- What are the active frontend routes?
- What does it mean that backend/database are authoritative?

## Architecture Drill

Goal: understand ownership boundaries.

Files to use:

- `docs/architecture.md`
- `docs/deployment.md`
- `apps/api/cmd/server/main.go`
- `apps/api/internal/config/config.go`
- `apps/api/internal/app/server.go`
- `apps/api/internal/app/response.go`
- `apps/api/internal/app/permissions.go`
- `apps/api/internal/app/storage.go`
- `apps/api/db/migrations/*.sql`
- `apps/web/src/main.tsx`
- `apps/web/src/app/router.tsx`
- `apps/web/src/lib/axios.ts`
- `apps/web/src/lib/query-client.ts`
- `apps/web/src/lib/query-keys.ts`
- `apps/web/src/lib/query-invalidation.ts`
- `apps/web/src/types/api.ts`

Teach-back questions:

- What does the web app own?
- What does the API own?
- What does Postgres own?
- What does object storage own?
- Why are frontend permissions only affordances?
- What are the production services and why are they separate?

## Backend/API Drill

Goal: learn how requests are received, authenticated, authorized, validated, written, and returned.

Files to use:

- `apps/api/cmd/server/main.go`
- `apps/api/internal/config/config.go`
- `apps/api/internal/app/server.go`
- `apps/api/internal/app/security.go`
- `apps/api/internal/app/auth.go`
- `apps/api/internal/app/permissions.go`
- `apps/api/internal/app/response.go`
- Feature handlers: `admin_users.go`, `dashboard.go`, `classes.go`, `projects.go`, `milestones.go`, `tasks.go`, `resources.go`, `files.go`

Teach-back questions:

- What happens before the HTTP server starts?
- Which middleware protects API routes?
- How is the current user loaded?
- How are route params and JSON bodies validated?
- How do manager/viewer checks work?
- What is the transaction pattern for project-scoped writes?

## Database Drill

Goal: learn the durable model and integrity backstops.

Files to use:

- `apps/api/db/migrations/20260601000100_init_mvp.sql`
- `apps/api/db/migrations/20260603000100_lifecycle_hardening.sql`
- `apps/api/db/migrations/20260619000100_assignment_submission_integrity.sql`
- `apps/api/db/migrations/20260620000100_folder_and_task_integrity.sql`
- `apps/api/db/migrations/20260621000100_support_target_integrity.sql`
- `apps/api/db/migrations/20260621000200_reviewed_support_immutability.sql`
- `apps/api/db/migrations/20260708000100_block_child_task_progress_updates.sql`
- `apps/api/internal/app/lifecycle_test.go`

Teach-back questions:

- What are the core tables?
- Which tables define the main project workflow?
- What does one pending submission per assignment mean?
- How does the DB prevent support from crossing project boundaries?
- What becomes immutable after review?
- Which rules live in app code instead of DB constraints?

## Frontend Drill

Goal: learn how UI routes, queries, mutations, and affordances are composed.

Files to use:

- `apps/web/src/main.tsx`
- `apps/web/src/app/providers.tsx`
- `apps/web/src/app/router.tsx`
- `apps/web/src/components/layout/app-layout.tsx`
- `apps/web/src/lib/axios.ts`
- `apps/web/src/lib/query-client.ts`
- `apps/web/src/lib/query-keys.ts`
- `apps/web/src/lib/query-invalidation.ts`
- `apps/web/src/lib/permissions.ts`
- Feature folders under `apps/web/src/features`

Teach-back questions:

- How does the app boot?
- How are protected routes handled?
- How does the frontend know the API URL?
- What does TanStack Query own?
- What does Zustand own?
- What gets invalidated after assignment or project mutations?

## Workflow Drills

Trace these as real paths through frontend, API, DB, and tests:

- Login and `/auth/me` session bootstrap.
- Admin creates a teacher or student account.
- Teacher creates a project and adds a student.
- Teacher creates a checkpoint and assignment.
- Student submits assignment progress.
- Teacher reviews a pending submission.
- Student or teacher attaches resources/evidence.
- Evidence download after review.

## Progress Update Template

When a section is done, update `onboarding-progress.md` with:

```md
Last completed: <section>
Current step: <next section>
Next step: <section after next>

Confidence update:
- <area>: <score>/5 because <reason>

Learner checkpoint result:
- Passed: <yes/no>
- Weak spots: <short list>
- Next drill: <what to do next>
```

## Do Not Touch During Training

Unless explicitly requested, do not edit:

- `apps/api/**`
- `apps/web/**`
- `docs/project.md`
- `docs/architecture.md`
- `docs/security-auth.md`
- `docs/deployment.md`
- `docs/testing.md`
- `docs/features/**`

Allowed learning files:

- `onboarding-training.md`
- `onboarding-progress.md`
