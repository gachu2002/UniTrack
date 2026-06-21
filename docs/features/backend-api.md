# Backend API Onboarding

This document covers cross-cutting API request-boundary behavior that is shared across UniTrack feature handlers.

## Purpose

The backend API provides the REST surface for the web app and keeps request parsing, authentication, route registration, and error semantics consistent before feature-specific handlers mutate data.

## Current Status

| Capability | Status | Notes |
| --- | --- | --- |
| Route registration | Implemented | `apps/api/internal/app/server.go` registers `/api/v1` health/auth routes and the authenticated project/admin/dashboard/workspace routes. |
| Shared JSON decoding | Implemented | `decodeJSON` caps JSON bodies at 1 MB, rejects unknown fields, and requires exactly one JSON value per request body. |
| Error responses | Implemented | JSON errors use `{ "error": string }` through shared helpers. |
| Protected API boundary | Implemented | Protected routes use `requireAuth`; unsafe requests pass through the trusted-origin guard. |
| Route ID validation | Implemented for active routes | Entity route IDs that are consumed outside project/folder/user permission loaders are validated as UUID-shaped strings before database UUID casts. Malformed IDs return `400`. |
| Client/route alignment | Audited A14 | Web API client endpoint paths match the registered backend routes for the current surface. |

## Request Behavior

| Request shape | Result |
| --- | --- |
| Valid single JSON object with known fields | Handler-specific validation runs. |
| JSON with trailing objects, arrays, or other extra values | `400` with a single-value request-body error. |
| JSON with unknown object fields | `400` with an unknown-field error. |
| Malformed JSON syntax | `400` with a syntax-focused error where available. |
| Route ID that is not UUID-shaped | `400` before database access for task, milestone, progress-update, member, resource-link, and file IDs. |
| Well-formed but missing entity ID | Handler-specific `404` or `403`, depending on the access rule. |

## Backend Implementation Map

| File | Responsibility |
| --- | --- |
| `apps/api/internal/app/server.go` | API route registration, CORS, origin guard, protected group. |
| `apps/api/internal/app/response.go` | JSON response helpers, strict request decoder, UUID route-param helpers, common DTO mapping helpers. |
| `apps/api/internal/app/security.go` | Trusted-origin guard and in-memory rate limiting. |
| `apps/api/internal/app/auth.go` | Session/auth middleware used by protected routes. |
| `apps/api/internal/app/lifecycle_test.go` | Cross-cutting backend API regressions alongside feature lifecycle tests. |

Important functions:

| Function | What It Does |
| --- | --- |
| `writeJSON` / `writeError` | Emit JSON success/error responses with shared envelope behavior. |
| `decodeJSON` | Reads request JSON with size, unknown-field, and single-value enforcement. |
| `decodeJSONErrorMessage` | Maps decoder failures to stable client-facing errors. |
| `validUUIDParam` / `requireValidUUIDParam` | Validate route IDs before handlers query UUID columns. |
| `Handler` | Builds the chi router and binds authenticated/public API routes. |

## Regression Coverage

| Test | Coverage |
| --- | --- |
| `TestJSONDecoderRejectsTrailingValues` | A valid login JSON object followed by another JSON value is rejected and does not create a session. |
| `TestProtectedRoutesRejectMalformedUUIDParams` | Malformed task, milestone, progress-review, and evidence-upload route IDs return `400` without leaking database UUID errors. |

## Maintenance Notes

- Add new JSON handlers through `decodeJSON` unless the endpoint intentionally uses multipart or another content type.
- Validate new path IDs before SQL if they are not already checked by a relationship/permission helper that turns malformed UUIDs into `400`.
- Keep web API client endpoint strings aligned with `server.go`; route drift belongs in the A14 audit checklist.
