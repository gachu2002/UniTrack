# UI System

## Scope

The UI system supports the academic ledger visual direction across the web app: dark navigation, a wider protected content frame, paper-like content sections, compact command headers, quiet project fact strips, centralized project resource overviews, flat split Work Plan hierarchy, divider-based milestone and assignment rows, searchable selected assignment panels, flat assignment dossier pages, divider-based submission feeds, status stamps, fixed-shell and confirmation dialogs, compact inline actions, low-emphasis header team popovers, violet edit buttons, and shared loading/error/empty/forbidden states.

## Shared Components

- Shared primitives live under `apps/web/src/components/ui/`.
- Protected app pages use `AppLayout`, which keeps the sidebar but uses a wide low-padding content frame; auth pages such as `/login` stay outside this shell.
- Form controls use shadcn/Radix-style primitives for selects, popovers, calendars, tabs, cards, fields, separators, skeletons, and empty states.
- Auth-related public pages use `AuthFrame` for a dark static blue/ocean background with subtle grid, horizon, and layered wave accents behind the existing centered card layout; the frame temporarily applies an auth-page class to `html` and `body` so the reserved scrollbar gutter does not show the light app background.
- `DatePicker` preserves the app-level `value` and `onValueChange` string API while composing `Popover`, `Calendar`, and `Button` internally.
- `Select` uses Radix select primitives through `SelectTrigger`, `SelectValue`, `SelectContent`, and `SelectItem`; empty choices should use explicit sentinel values instead of empty-string item values.
- `DialogContent` uses fixed-shell panels, keeps headers visible, constrains panels to the viewport, and scrolls only the middle content area; the shared default is moderately narrow, project/assignment forms opt into wider panels for multi-column fields, and short forms keep bottom padding above the panel edge.
- Destructive actions use `ConfirmDialog`, not browser `window.confirm`, so checkpoint delete, member removal, resource delete, and evidence delete have consistent app chrome and destructive buttons.
- Project, milestone, and assignment resource management uses a centralized project resource overview and centered dialogs instead of page-edge drawers to preserve the wide project dossier layout.
- Project-level resources render as chips in the overview; milestone and assignment resources use quiet target rows or per-row actions, with the scrollable centered dialog reserved for add/edit/delete management.
- Project detail uses a compact command header that avoids repeated status/lifecycle copy, moves metadata into a quiet fact strip, then one flat split `Work Plan` section where the left milestone column is wider and the right panel searches and caps assignment rows for the selected checkpoint.
- Dense list surfaces should prefer local search, explicit caps, and show-more controls over full pagination for the current 100-200 record fake-data target.
- Assignment detail uses a flat dossier pattern: a clean command header, inline state/priority/submission summary, instructions without a card, divider-based details/resources, and divider-based submissions with inline evidence/review controls.
- Dashboard pages use compact summary chips and action-first queues instead of generic KPI cards; sections should answer what the user should do next.
- Project team controls should live in a low-emphasis header `Team` trigger with a count and a popover instead of a right-side rail or full panel by default. The trigger should not lift, use saturated gradients, or visually compete with the page title.
- Edit actions use the shared violet `edit` button variant so edit controls have a clear color identity without becoming primary actions.
- Global CSS keeps the browser scrollbar gutter stable and neutralizes Radix select scroll-lock margin compensation so opening a select on long pages does not shift the layout.
- Button variant styles live in `apps/web/src/components/ui/button-variants.ts` so component files only export React components for Fast Refresh compatibility.

## Source Map

| Source | Purpose |
| --- | --- |
| `apps/web/src/components/layout/app-layout.tsx` | Protected app shell, sidebar/mobile header, and wide low-padding content frame. |
| `apps/web/src/components/ui/` | Shared shadcn/Radix-compatible UI primitives. |
| `apps/web/src/components/ui/date-picker.tsx` | App-facing date picker wrapper with string value handling. |
| `apps/web/src/components/ui/calendar.tsx` | React DayPicker composition and calendar styling. |
| `apps/web/src/components/ui/select.tsx` | Radix Select primitive wrappers. |
| `apps/web/src/components/ui/dialog.tsx` | Fixed-shell dialog primitive with visible headers, larger form-friendly width, and scrollable body content. |
| `apps/web/src/components/shared/confirm-dialog.tsx` | Shared app confirmation dialog for destructive actions. |
| `apps/web/src/features/auth/components/auth-frame.tsx` | Shared auth shell with subtle ocean-themed background accents. |
| `apps/web/src/features/dashboard/pages/dashboard-page.tsx` | Action-first dashboard layout, compact summary chips, review queue, overdue assignment queue, and project follow-up queue. |
| `apps/web/src/features/projects/pages/project-detail-page.tsx` | Compact project command header, quiet fact strip, centralized resource overview, flat split Work Plan hierarchy, selectable milestone rows, searchable selected assignment rows, capped team popover results, centered resource dialog, and compact resource target actions. |
| `apps/web/src/features/tasks/pages/task-detail-page.tsx` | Flat assignment dossier header, inline state summary, instructions, divider details/resources, and single-action assignment command area. |
| `apps/web/src/features/tasks/components/progress-timeline.tsx` | Divider-based submission feed with inline resource links, evidence files, and review form. |
| `apps/web/src/features/resources/components/resource-link-drawer.tsx` | Scrollable resource link dialog, capped inline shelf, chip, and compact resource action components. |
| `apps/web/src/index.css` | Global theme tokens and academic ledger styling. |

## Verification

- `pnpm --filter @unitrack/web lint`
- `pnpm --filter @unitrack/web build`
