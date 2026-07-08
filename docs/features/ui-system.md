# UI System

Purpose: document shared UI conventions that should survive feature changes.

## User Problem

UniTrack needs a compact academic workspace UI that stays readable across teacher, student, and admin flows without hiding accessibility or state feedback.

## UI Surfaces

| Surface | Owns |
| --- | --- |
| App shell | Navigation, skip link, protected content frame. |
| Shared states | Loading, empty, error, forbidden, confirmation, status badges. |
| Forms/dialogs | Labels, validation, keyboard/focus behavior, one named close control. |
| Feature pages | Shared compact page headers, project-first visual hierarchy, and mobile/desktop usability. |

## Rules

- Preserve the academic ledger/ocean visual direction and compact project-first hierarchy.
- Use the shared `PageHeader` for primary page tops: small gradient accent, optional back link, title, badges, metadata pills, and compact right-side actions. Avoid large boxed hero headers unless a feature has an explicit reason.
- Keep the protected skip link, semantic dialogs, one named close control, labels for compact actions, and readable loading/empty/error/forbidden states.
- Prefer native form controls for radio/decision groups unless custom ARIA keyboard behavior is fully implemented.
- Keep decorative motion respectful of `prefers-reduced-motion`.
- Keep desktop and mobile layouts usable; avoid dense card sprawl on project and assignment pages.

## Source Map

| Source | Owns |
| --- | --- |
| `apps/web/src/components/ui` | Shared primitives. |
| `apps/web/src/components/layout/page-header.tsx` | Shared compact page top pattern and metadata pills. |
| `apps/web/src/components/shared` | App-specific shared states and visuals. |
| `apps/web/src/components/layout/app-layout.tsx` | Shell, nav, skip link. |
| `apps/web/src/index.css` | Theme tokens and global styling. |
| `apps/web/e2e/accessibility.spec.ts` | Focused accessibility regressions. |

## Review Checklist

- Does the change preserve the academic ledger/ocean direction instead of generic SaaS clutter?
- Are labels connected to controls and compact actions explicitly named?
- Are dialogs semantic, focus-trapped, escape-closeable, and restored on close?
- Do decorative animations stop or simplify under `prefers-reduced-motion`?
- Are mobile and desktop layouts both usable?
- Are loading, empty, error, forbidden, stale, and archived states readable?

## Verify

- `pnpm --filter @unitrack/web lint`
- `pnpm --filter @unitrack/web build`
- Targeted Playwright for dialogs, keyboard behavior, and role flows.

## Gaps

- No automated axe scan.
- Visual regression coverage is limited.
