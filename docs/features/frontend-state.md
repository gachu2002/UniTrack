# Frontend State And Data Flow Onboarding

This document covers cross-cutting frontend state behavior for React Query caches, form drafts, stale permission/lifecycle errors, and browser regression coverage.

## Purpose

UniTrack keeps the backend authoritative for permissions and lifecycle rules, while the frontend keeps query caches and forms aligned with those server decisions. This feature slice documents the conventions that prevent stale UI controls, stale filtered lists, and accidental cross-target form submissions.

## Current Status

| Capability | Status | Notes |
| --- | --- | --- |
| Query key registry | Implemented | `apps/web/src/lib/query-keys.ts` centralizes auth, admin, dashboard, project, task, resource, file, and folder query keys. |
| Shared invalidation helpers | Implemented | `apps/web/src/lib/query-invalidation.ts` groups workspace, admin account-impact, project, assignment workflow, support, evidence, and folder invalidations and exposes stale `403`/`409` refresh helpers. |
| Auth state sync | Implemented | `useCurrentUser()` writes successful `/auth/me` responses to the auth store and clears the store only on confirmed `401` responses, leaving transient refetch failures from erasing role/self guard context. |
| Admin account cache impact | Implemented | Account create/update invalidates account lists plus dashboard, project, and folder caches because role/status changes can reassign or clean active work. |
| Admin transition support data | Implemented | Replacement teacher/admin choices are loaded through a dedicated active teacher/admin query, not from the currently filtered account table. |
| Folder candidate search state | Implemented | Folder detail hides previous placeholder candidates while deferred search/refetch is stale, preventing clicks on old standalone-project rows. |
| Resource form target state | Implemented | Resource dialogs remount per target and form key, so add/edit drafts cannot cross-submit to another resource target. |
| Folder edit clearing | Implemented | Workspace and folder detail edit forms send explicit empty descriptions so users can clear saved folder notes. |
| Frontend state regression tests | Partial | Playwright covers folder description clearing and stale folder candidate hiding; broader form/cache permutations remain future coverage. |

## Implementation Map

| File | Responsibility |
| --- | --- |
| `apps/web/src/lib/query-keys.ts` | Query key definitions and key families. |
| `apps/web/src/lib/query-invalidation.ts` | Shared invalidation and stale-error refresh helpers. |
| `apps/web/src/features/auth/hooks.ts` | Auth query to auth-store synchronization. |
| `apps/web/src/features/admin/pages/admin-users-page.tsx` | Account mutations, broad invalidation, transition support-data query, self guards. |
| `apps/web/src/features/classes/pages/class-detail-page.tsx` | Folder detail cache refreshes and stale-safe add-project candidate search. |
| `apps/web/src/features/workspace/pages/workspace-page.tsx` | Folder shelves, folder edit/create state, and explicit description clearing. |
| `apps/web/src/features/resources/components/resource-link-drawer.tsx` | Target-keyed resource dialog forms and shared stale support-state refreshes. |
| `apps/web/src/features/projects/components/project-forms.tsx` | Project/team form invalidations and stale lifecycle/permission refreshes. |
| `apps/web/src/features/projects/pages/project-detail-page.tsx` | Project plan/team/resource dialogs and stale project workflow refreshes. |
| `apps/web/src/features/tasks/components/task-forms.tsx` | Assignment create/edit/submit/review invalidations and shared stale workflow refreshes. |
| `apps/web/e2e/state-flow.spec.ts` | A15 browser regressions for folder description clearing and stale folder candidates. |

## Maintenance Rules

- Add new query keys to `queryKeys` instead of using ad hoc arrays in feature code.
- Use `invalidateProjectData`, `invalidateClassData`, `invalidateWorkspaceData`, `invalidateAssignmentWorkflowData`, `invalidateProjectSupportData`, or `invalidateProjectEvidenceData` when mutations affect rollups beyond one query.
- On stale `403` or `409` mutation failures, refresh the affected project/folder/workspace state so rejected controls disappear.
- Do not derive modal support choices from the currently filtered table when a transition requires a full candidate set.
- Key or remount local-state forms when the target entity changes, especially resource/support dialogs that can switch between project, milestone, assignment, and submission targets.
- Keep browser fixtures API-created where possible so tests are deterministic and do not depend on demo rows.

## Test Coverage

| Test | Coverage |
| --- | --- |
| `folder edit can clear description` | Verifies folder edit sends an explicit empty description and the detail page shows fallback copy after save. |
| `folder candidate search hides stale previous results while refreshing` | Delays a candidate search response and verifies the prior project option disappears while the new search is refreshing. |

## Known Gaps

- Admin account create/search/sign-in has Playwright coverage; account update, password reset, and transition-conflict flows still need dedicated browser coverage.
- Resource dialog target-switch behavior is covered by implementation and lint/build, but not yet by a browser test.
- React Query invalidation is still convention-based; future broad mutations should use the shared helpers instead of hand-written partial invalidation lists.
