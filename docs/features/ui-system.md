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

- Preserve the academic ledger/ocean visual direction and compact project-first hierarchy, but keep authenticated page backdrops flat and calm instead of layered radial/line backgrounds.
- Use the shared `PageHeader` for primary page tops: optional back link, title, badges, metadata pills, and compact right-side actions without decorative accent bars. Avoid large boxed hero headers unless a feature has an explicit reason.
- Use dividers only for real boundaries: page header separation, dense row lists, table/popover sections, or expanded disclosure bodies. Prefer whitespace for toolbar controls, short metadata, and small metric groups.
- Data table columns with sortable data use shared sortable headers with `aria-sort`; action-only columns such as Open or Actions remain static.
- Keep one protected `main#main-content` landmark for the app shell, plus the skip link, semantic dialogs, one named close control, labels for compact actions, and readable loading/empty/error/forbidden states.
- Shared dialogs render through a portal and use a top-layer stack: only the top dialog handles Escape, Tab trapping, and backdrop closure, while body scroll unlocks only after the last dialog closes.
- Page-level error states should be announced to assistive technology and distinguish retryable failures from forbidden states.
- Prefer native form controls for radio/decision groups unless custom ARIA keyboard behavior is fully implemented.
- Custom folder color radios use roving focus with arrow/Home/End keys, and the folder project attach combobox uses active-descendant keyboard behavior.
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
- Are dialogs semantic, focus-trapped, escape-closeable, stack-safe, and restored on close?
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
