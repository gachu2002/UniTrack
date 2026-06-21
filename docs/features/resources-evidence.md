# Resources And Evidence Onboarding

This document explains the current UniTrack resource-link and evidence-file implementation for engineers who need to maintain project references and progress evidence.

## Purpose

Resources and evidence support the project supervision workflow without becoming separate product modules:

- Resource links attach useful URLs to a project, milestone, assignment, or assignment submission, with project-level side-rail chips and compact row actions for dense pages.
- Evidence files attach uploaded files to assignment progress submissions only, with visible styled per-submission panels, a custom upload docket, and show-more guards for long file lists.
- Reads remain available to project viewers for historical review.
- Writes follow project lifecycle status so closed projects remain stable records; resource writes and evidence metadata upload/delete re-check status under a project-row lock before committing.
- Reviewed submission support records are immutable in the API and database: once a submission is reviewed, its resource links and evidence files remain readable/downloadable but cannot be added, edited, or deleted.

Project lifecycle semantics are documented in `docs/features/projects.md`. Assignment and submission behavior is documented in `docs/features/official-tasks.md`.

## Current Status

| Capability | Status | Notes |
| --- | --- | --- |
| Resource list | Implemented | Project viewers can list links for project, milestone, assignment, and assignment-submission targets; project detail shows project links in the side rail, checkpoint/assignment links from ledger rows, and pending-submission links from assignment history/review contexts while the management dialog scrolls internally. |
| Resource create/update/delete | Implemented | Project viewers can add links, owners can edit/delete their links, and managers can edit/delete all links while the project is `active` or `on_hold`; writes re-check lifecycle, current project access, current manager authority, and target validity under a project-row lock. Deferred database triggers enforce project/target matching and reviewed-submission immutability. Deletes use the app confirmation dialog. |
| Duplicate URL guard | Implemented | A target cannot receive the same URL twice. |
| Resource dialog state | Implemented | Resource add/edit forms are keyed by target and resource, so drafts reset when users switch between project, checkpoint, assignment, and submission targets. |
| Evidence file list/download | Implemented | Project viewers can list and download evidence files from styled submission panels, including completed and archived readable projects; panels initially show 8 files with a show-all control. |
| Evidence upload | Implemented | Progress submitters or project managers can upload evidence to assignment-scoped pending submissions only while the project is `active`; metadata insert re-checks lifecycle, current project access, submitter/manager authority, target state, and active assignment membership under a project-row lock after staging the file. Deferred database triggers enforce project/target matching and reviewed-submission immutability for file metadata. The frontend uses a styled choose-file docket with client-side 10 MB validation. |
| Evidence delete | Implemented | Uploaders or project managers can delete evidence while the project is `active` or `on_hold` and the submission is still pending review; metadata delete re-checks lifecycle, current project access, current manager/owner authority, and target state under a project-row lock. Frontend delete buttons use separate lifecycle-aware manager/owner flags and deletes use the app confirmation dialog. |
| Archived/completed write gates | Implemented | Completed projects block resource/evidence writes; archived projects are read-only. |
| Storage backend | Implemented | Development/tests use local filesystem storage under `UPLOAD_STORAGE_DIR`; production uses private Cloudflare R2 through the API storage adapter when `UPLOAD_STORAGE_BACKEND=r2`. Startup rejects local evidence storage when `APP_ENV=production`. |
| Frontend automated tests | Partial | Playwright access-control coverage verifies completed-project evidence remains downloadable without upload/delete affordances; resource/evidence component tests are still needed. |

## User-Facing Behavior

| User action | Expected result |
| --- | --- |
| Project viewer opens project detail resources | Existing project links are readable as side-rail chips; checkpoint and assignment resource targets are managed from quiet per-row actions. |
| Project viewer adds a resource on an active/on-hold project | Link is created for the selected target and the resource query refreshes. |
| Project viewer switches resource targets | The dialog form remounts for the new target, preventing a draft for one target from being submitted to another. |
| Student edits another user's resource | Backend returns `403`. |
| Manager edits or deletes any resource on an active/on-hold project | Mutation succeeds. |
| User deletes a resource link | App confirmation dialog appears before the delete mutation runs; reviewed-submission links return `409` instead of mutating history. |
| User tries resource writes on completed or archived projects | Backend returns `409`; frontend hides add/edit/delete affordances. |
| Progress submitter uploads evidence on an active project | File metadata is stored and the project file query refreshes. |
| User downloads evidence from a readable project | File downloads when metadata exists and the selected storage backend contains the object. |
| User opens a submission with evidence files or upload rights | The styled evidence docket is visible with the submission under review or in the history row; the first 8 files are shown as compact file cards, with a show-all control for the rest. |
| User deletes evidence | App confirmation dialog appears before the file metadata/storage cleanup runs; reviewed-submission evidence returns `409` and remains downloadable. |
| User tries evidence upload outside active projects | Backend returns `409`; frontend hides upload affordances. |
| Uploader opens own evidence on a completed or archived project | Download remains available, but upload and delete affordances are hidden because closed records are read-only. |
| User opens reviewed submission support | Resource management, upload, and delete controls are hidden; resource links and evidence downloads remain visible. |
| User targets historical child-task progress | Resource creation and evidence upload are rejected because active submission support is assignment-scoped. |

## API Contract

Base path: `/api/v1`

| Method | Endpoint | Access | Request | Success | Common Errors |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/projects/{projectId}/resource-links` | Project viewer | Cookie only | `200` resource list | `400`, `401`, `403`, `500` |
| `POST` | `/projects/{projectId}/resource-links` | Project viewer plus lifecycle gate | Resource create DTO | `201` resource DTO | `400`, `401`, `403`, `409`, `500` |
| `PATCH` | `/projects/{projectId}/resource-links/{resourceLinkId}` | Owner or project manager plus lifecycle gate | Partial resource update DTO | `200` resource DTO | `400`, `401`, `403`, `404`, `409`, `500` |
| `DELETE` | `/projects/{projectId}/resource-links/{resourceLinkId}` | Owner or project manager plus lifecycle gate | Cookie only | `200` deleted status | `400`, `401`, `403`, `404`, `409`, `500` |
| `GET` | `/projects/{projectId}/files` | Project viewer | Cookie only | `200` file list | `400`, `401`, `403`, `500` |
| `POST` | `/projects/{projectId}/progress-updates/{updateId}/files` | Submitter or project manager plus active-project gate | Multipart `file` | `201` file DTO | `400`, `401`, `403`, `404`, `409`, `500` |
| `GET` | `/projects/{projectId}/files/{fileId}/download` | Project viewer | Cookie only | File download | `400`, `401`, `403`, `404`, `500` |
| `DELETE` | `/projects/{projectId}/files/{fileId}` | Uploader or project manager plus lifecycle gate | Cookie only | `200` deleted status | `400`, `401`, `403`, `404`, `409`, `500` |

Lifecycle gates:

| Project status | Resource writes | Evidence upload | Evidence delete | Reads/downloads |
| --- | --- | --- | --- | --- |
| `active` | Yes | Yes | Yes | Yes |
| `on_hold` | Yes | No | Yes | Yes |
| `completed` | No | No | No | Yes |
| `archived` | No | No | No | Yes |

Submission-state gate for `progress_update` targets:

| Submission review status | Resource writes | Evidence upload/delete | Reads/downloads |
| --- | --- | --- | --- |
| `pending_review` | Yes, when project lifecycle allows support writes | Yes, when project lifecycle allows the specific evidence operation | Yes |
| `approved`, `needs_changes`, `rejected` | No | No | Yes |

## Backend Implementation Map

| File | Responsibility |
| --- | --- |
| `apps/api/internal/app/resources.go` | Resource handlers, URL validation, transaction-scoped project access/manager checks, locked target validation, reviewed-submission immutability, project-aware assignment-submission target validation, owner/manager checks. |
| `apps/api/internal/app/files.go` | Evidence upload/download/delete handlers, project-aware assignment-submission checks, reviewed-submission immutability, storage-backed file writes/reads/deletes, locked lifecycle/access/target re-checks for metadata writes, and file metadata reads. |
| `apps/api/internal/app/storage.go` | Local and Cloudflare R2/S3-compatible evidence storage backends behind the upload-file storage interface. |
| `apps/api/internal/config/config.go` | Upload storage backend configuration and production validation that requires R2 when `APP_ENV=production`. |
| `apps/api/db/migrations/20260621000100_support_target_integrity.sql` | Deferred trigger backstop for resource/evidence project-target matching and direct target-row drift. |
| `apps/api/db/migrations/20260621000200_reviewed_support_immutability.sql` | Deferred trigger backstop for reviewed-submission support immutability and final review status. |
| `apps/api/internal/app/projects.go` | Shared project lifecycle preflight and transaction-lock helpers used by resource and file handlers. |
| `apps/api/internal/app/permissions.go` | Relationship checks for project viewers and managers, including transaction-scoped rechecks used by support writes. |
| `apps/api/internal/app/lifecycle_test.go` | Resource ownership, target validation, evidence lifecycle, and project-status gate coverage. |

## Frontend Implementation Map

| File | Responsibility |
| --- | --- |
| `apps/web/src/features/resources/components/resource-link-drawer.tsx` | Centered scrollable resource dialog, target-keyed add/edit/delete forms, delete confirmation, stale-state refresh on support conflicts, resource chips, and compact resource action buttons with target-specific labels. |
| `apps/web/src/features/files/components/evidence-file-panel.tsx` | Styled evidence upload/download/delete docket with client-side 10 MB validation, target-specific download/delete labels, delete confirmation, stale-state refresh on support conflicts, and an 8-file initial list for submission rows. |
| `apps/web/src/features/projects/pages/project-detail-page.tsx` | Project-level reference chips in the detail side rail, milestone/assignment row resource actions, and lifecycle-aware resource affordances. |
| `apps/web/src/features/tasks/pages/task-detail-page.tsx` | Assignment review desk/history placement, pending-submission resource management, support-data load/error blocking for reviews, and lifecycle-aware evidence affordances. |
| `apps/web/src/features/tasks/components/progress-timeline.tsx` | Threads pending-review-aware resource, upload, manager-delete, and owner-delete affordances into submission support panels. |
| `apps/web/src/lib/permissions.ts` | Client lifecycle affordance helpers. |
| `apps/web/e2e/access-control.spec.ts` | Browser regression coverage for closed-project evidence download/read-only affordances. |

## Test Coverage

Backend lifecycle tests cover:

| Test | Coverage |
| --- | --- |
| `TestResourceLinksLifecycleAndOwnership` | Resource create/list/update/delete, duplicate URL guard, and owner/manager permissions. |
| `TestResourceLinkTargetAndURLValidation` | URL scheme validation and cross-project target rejection. |
| `TestDatabaseRejectsCrossProjectSupportTargets` | Direct SQL cannot create cross-project support targets or leave support metadata orphaned by moving/deleting target rows. |
| `TestDatabasePreservesReviewedSubmissionSupport` | Direct SQL cannot add, edit, delete, or retarget support for reviewed submissions, or revert final review status. |
| `TestProgressEvidenceFileLifecycleAndPermissions` | Evidence upload, list, active-project delete, closed-project download preservation, completed/archived delete blocking, storage cleanup, and non-member blocking. |
| `TestLocalFileStorePutOpenDelete` | Local storage backend writes, reads, sizes, deletes, and returns a storage-not-found error after delete without a database dependency. |
| `TestEvidenceUploadRechecksProjectAccessAfterLifecycleLock` | Evidence upload waits on the project row and rejects when the submitter loses membership before metadata insert. |
| `TestReviewedSubmissionSupportRecordsAreImmutable` | Reviewed submission resources/evidence cannot be created, updated, deleted, uploaded, or deleted while evidence download remains available. |
| `TestResourceCreateRechecksProjectAccessAfterLifecycleLock` | Resource creation waits on the project row and rejects when the viewer loses membership before insert. |
| `TestResourcePartialUpdatePreservesConcurrentMetadataChange` | Resource PATCH reads the current row inside the locked transaction and preserves concurrent metadata changes. |
| `TestLifecycleLockRejectsAssignmentAfterConcurrentCompletion` | Representative project-row lifecycle lock coverage for write rejection after a concurrent status transition. |
| `TestChildTaskProgressIsExcludedFromAssignmentSurfaces` | Historical child-task progress cannot receive evidence uploads or resource links. |
| `TestOnHoldProjectBlocksNewWorkButAllowsManagerMaintenance` | Resource writes remain allowed on on-hold projects. |
| `TestCompletedProjectAllowsPendingReviewsOnly` | Completed projects block resource writes. |
| `TestArchivedProjectIsReadOnlyExceptStatusChange` | Archived projects block resource writes. |

Frontend Playwright coverage includes:

| Test | Coverage |
| --- | --- |
| `closed assignment evidence stays downloadable but read-only` | Creates a project, assignment, submission, and evidence file through the API, completes the project, then verifies the student can see/download the file without upload/delete buttons. |

Ad hoc A11 Playwright audit evidence is stored in `/tmp/opencode/unitrack-a11-audit-20260620/` and covers pending submission resource management, evidence visibility, mobile pending support controls, and reviewed-submission read-only support controls.

## Known Gaps And Risks

| Gap or Risk | Impact |
| --- | --- |
| Object-storage hardening | Production uses R2 for durable evidence bytes, but still needs backup, retention, MIME policy, malware scanning, quotas, and repair jobs for rare DB/object-storage drift. |
| Target relationships are polymorphic | Deferred database triggers enforce project/target matching, but the schema still uses polymorphic target columns instead of target-specific join tables. Trigger helpers must be updated if target types change. |
| Reviewed-support repairs must be deliberate | Normal direct writes are trigger-blocked after review; operational repairs should delete or repair parent/support rows deliberately in one transaction and preserve historical audit intent. |
| Resource delete confirmation stacks on top of the resource dialog | The UI remains usable, but focus/assistive semantics could improve with a single modal layer or destructive `alertdialog`. |
| Frontend tests are still partial | Closed-project evidence affordances have Playwright coverage, but resource dialog and lower-level evidence panel permutations still need tests. |
| Resource target-switch coverage is manual | Keyed resource form remounts are implemented, but target switching still needs dedicated browser coverage. |

## Maintenance Checklist

When adding or changing resource/evidence behavior:

- Preserve project viewer reads and lifecycle-gated writes.
- Keep resource/evidence metadata mutations inside transactions that call the project-row lifecycle lock helper.
- Recheck current project viewer/manager authority inside support-write transactions before committing.
- Keep resource targets limited to project, milestone, assignment, and submission targets unless schema/docs are updated.
- Keep evidence uploads assignment-submission-scoped.
- Keep support target trigger helpers aligned with resource/evidence target types and project-aware joins.
- Keep reviewed submission resource/evidence records immutable in both API code and database triggers while preserving reads/downloads.
- Keep resource owner checks and manager override checks aligned between backend and frontend affordances.
- Keep evidence owner-delete and manager-delete affordances lifecycle-aware separately; uploader ownership alone must not reveal delete buttons on completed/archived projects.
- Keep resource forms keyed or remounted when the target resource context changes.
- Keep local `UPLOAD_STORAGE_DIR` behavior for development/tests and R2 behavior for production aligned with `docs/deployment.md`.
- Update lifecycle tests whenever project status semantics change.
