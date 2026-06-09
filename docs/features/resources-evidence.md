# Resources And Evidence Onboarding

This document explains the current UniTrack resource-link and evidence-file implementation for engineers who need to maintain project references and progress evidence.

## Purpose

Resources and evidence support the project supervision workflow without becoming separate product modules:

- Resource links attach useful URLs to a project, milestone, assignment, or submission, with a centralized project overview and compact row actions for dense pages.
- Evidence files attach uploaded files to progress submissions only, with per-submission show-more guards.
- Reads remain available to project viewers for historical review.
- Writes follow project lifecycle status so closed projects remain stable records.

Project lifecycle semantics are documented in `docs/features/projects.md`. Assignment and submission behavior is documented in `docs/features/official-tasks.md`.

## Current Status

| Capability | Status | Notes |
| --- | --- | --- |
| Resource list | Implemented | Project viewers can list links for project, milestone, assignment, and submission targets; project detail centralizes project/checkpoint/assignment links while the management dialog scrolls internally. |
| Resource create/update/delete | Implemented | Project viewers can add links, owners can edit/delete their links, and managers can edit/delete all links while the project is `active` or `on_hold`; deletes use the app confirmation dialog. |
| Duplicate URL guard | Implemented | A target cannot receive the same URL twice. |
| Evidence file list/download | Implemented | Project viewers can list and download evidence files; submission panels initially show 8 files with a show-all control. |
| Evidence upload | Implemented | Progress submitters or project managers can upload evidence only while the project is `active`. |
| Evidence delete | Implemented | Uploaders or project managers can delete evidence while the project is `active` or `on_hold`; deletes use the app confirmation dialog. |
| Archived/completed write gates | Implemented | Completed projects block resource/evidence writes; archived projects are read-only. |
| Storage backend | Implemented locally | Files are stored under `UPLOAD_STORAGE_DIR` with a 10 MB upload limit. |
| Frontend automated tests | Missing/partial | Backend lifecycle coverage exists; resource/evidence component tests are still needed. |

## User-Facing Behavior

| User action | Expected result |
| --- | --- |
| Project viewer opens project detail resources | Existing project links are readable as chips; checkpoint and assignment resource targets are managed from one overview plus quiet per-row actions. |
| Project viewer adds a resource on an active/on-hold project | Link is created for the selected target and the resource query refreshes. |
| Student edits another user's resource | Backend returns `403`. |
| Manager edits or deletes any resource on an active/on-hold project | Mutation succeeds. |
| User deletes a resource link | App confirmation dialog appears before the delete mutation runs. |
| User tries resource writes on completed or archived projects | Backend returns `409`; frontend hides add/edit/delete affordances. |
| Progress submitter uploads evidence on an active project | File metadata is stored and the project file query refreshes. |
| User downloads evidence from a readable project | File downloads when metadata and storage path exist. |
| User opens a submission with many evidence files | The first 8 files are shown, with a show-all control for the rest. |
| User deletes evidence | App confirmation dialog appears before the file metadata/storage cleanup runs. |
| User tries evidence upload outside active projects | Backend returns `409`; frontend hides upload affordances. |

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

## Backend Implementation Map

| File | Responsibility |
| --- | --- |
| `apps/api/internal/app/resources.go` | Resource handlers, URL validation, target validation, owner/manager checks. |
| `apps/api/internal/app/files.go` | Evidence upload/download/delete handlers, local storage writes, file metadata reads. |
| `apps/api/internal/app/projects.go` | Shared project lifecycle helpers used by resource and file handlers. |
| `apps/api/internal/app/permissions.go` | Relationship checks for project viewers and managers. |
| `apps/api/internal/app/lifecycle_test.go` | Resource ownership, target validation, evidence lifecycle, and project-status gate coverage. |

## Frontend Implementation Map

| File | Responsibility |
| --- | --- |
| `apps/web/src/features/resources/components/resource-link-drawer.tsx` | Centered scrollable resource dialog, add/edit/delete forms, delete confirmation, resource chips, and compact resource action buttons. |
| `apps/web/src/features/files/components/evidence-file-panel.tsx` | Evidence upload/download/delete panel with delete confirmation and an 8-file initial list for submission rows. |
| `apps/web/src/features/projects/pages/project-detail-page.tsx` | Centralized project resource overview, project/milestone/assignment resource target actions, and lifecycle-aware resource affordances. |
| `apps/web/src/features/tasks/pages/task-detail-page.tsx` | Assignment resource shelf and lifecycle-aware evidence affordances. |
| `apps/web/src/lib/permissions.ts` | Client lifecycle affordance helpers. |

## Test Coverage

Backend lifecycle tests cover:

| Test | Coverage |
| --- | --- |
| `TestResourceLinksLifecycleAndOwnership` | Resource create/list/update/delete, duplicate URL guard, and owner/manager permissions. |
| `TestResourceLinkTargetAndURLValidation` | URL scheme validation and cross-project target rejection. |
| `TestProgressEvidenceFileLifecycleAndPermissions` | Evidence upload, list, download, delete, storage cleanup, and non-member blocking. |
| `TestOnHoldProjectBlocksNewWorkButAllowsManagerMaintenance` | Resource writes remain allowed on on-hold projects. |
| `TestCompletedProjectAllowsPendingReviewsOnly` | Completed projects block resource writes. |
| `TestArchivedProjectIsReadOnlyExceptStatusChange` | Archived projects block resource writes. |

## Known Gaps And Risks

| Gap or Risk | Impact |
| --- | --- |
| Local filesystem storage | Production deployment still needs persistent storage, backup, retention, MIME policy, and malware scanning. |
| Target relationships are code-validated | Database foreign keys do not enforce every resource/file target relationship. |
| Frontend tests are sparse | Resource dialog and evidence panel affordance regressions can slip through lint/build. |

## Maintenance Checklist

When adding or changing resource/evidence behavior:

- Preserve project viewer reads and lifecycle-gated writes.
- Keep resource targets limited to project, milestone, assignment, and submission targets unless schema/docs are updated.
- Keep evidence uploads submission-scoped.
- Keep resource owner checks and manager override checks aligned between backend and frontend affordances.
- Keep `UPLOAD_STORAGE_DIR` persistence and cleanup behavior explicit in deployment work.
- Update lifecycle tests whenever project status semantics change.
