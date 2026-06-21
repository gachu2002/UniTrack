# UI System

## Scope

The UI system supports the academic ledger visual direction across the web app with an ocean/dark-blue frame: dark navy navigation with a keyboard skip link, line-only water/current SVG accents, a wider protected content frame, foam-like light content sections, compact command headers, labeled project status stamps, compact project mission-control strips, quiet grouped Work Plans with manage-plan mode, divider-based checkpoint and assignment rows, searchable grouped assignment ledgers, structured assignment review desks and student workbench states, divider-based history feeds, styled evidence dockets, status stamps, fixed-shell and confirmation dialogs, compact inline actions, keyboardable radio-style choices, low-emphasis header team popovers, violet edit buttons, and shared loading/error/empty/forbidden states.

## Shared Components

- Shared primitives live under `apps/web/src/components/ui/`.
- Protected app pages use `AppLayout`, which keeps the sidebar but uses a wide low-padding content frame over a subtle ocean-gradient backdrop; auth pages such as `/login` stay outside this shell. The protected shell exposes `Skip to main content` as the first page tab stop and focuses `#main-content` when activated.
- Line-only ocean SVG assets live in `OceanMark`, `OceanDashboardIcon`, `OceanWorkspaceIcon`, `OceanAdminIcon`, and `OceanCurrentLines`; use them for brand/navigation/accent treatment instead of bitmap artwork or heavy filled illustrations.
- Form controls use shadcn/Radix-style primitives for selects, popovers, calendars, tabs, cards, fields, separators, skeletons, and empty states.
- Auth-related public pages use `AuthFrame` for a dark static blue/ocean background with subtle grid, horizon, and line-only current accents behind a compact centered card layout; login opts into single-line header copy. The frame temporarily applies an auth-page class to `html` and `body` so the reserved scrollbar gutter does not show the light app background, and it allows vertical scrolling on short mobile viewports.
- Auth forms should pair visible labels with `htmlFor`/`id` so assistive technology and browser automation can target fields by label.
- `DatePicker` preserves the app-level `value` and `onValueChange` string API while composing `Popover`, `Calendar`, and `Button` internally.
- `Select` uses Radix select primitives through `SelectTrigger`, `SelectValue`, `SelectContent`, and `SelectItem`; empty choices should use explicit sentinel values instead of empty-string item values.
- `Dialog` uses fixed-shell panels, keeps headers visible, constrains panels to the viewport, scrolls only the middle content area, traps keyboard focus, restores focus to the opener on close, and wires title/description ARIA attributes. Dialogs expose one named `Close dialog` button inside the panel; the backdrop is non-semantic and hidden from assistive technology while still supporting pointer dismissal. The shared default is moderately narrow, project/create-assignment forms opt into wider panels for multi-column setup, compact edit forms stay on the default width, and assignment create/edit forms use non-sticky action footers so assignee controls are not covered while scrolling.
- Destructive actions use `ConfirmDialog`, not browser `window.confirm`, so checkpoint delete, member removal, resource delete, and evidence delete have consistent app chrome and destructive buttons.
- Project, milestone, and assignment resource management uses quiet side-rail or row-level affordances plus centered dialogs instead of page-edge drawers so resources do not compete with the main work board.
- Project-level resources render as chips in the project detail side rail; milestone and assignment resources use quiet per-row actions, with the scrollable centered dialog reserved for add/edit/delete management.
- Project detail uses a compact command header with labeled lifecycle/progress stamps, then a compact mission-control strip with health metrics and up to three direct next-action links before the grouped assignment-first `Work Plan`; checkpoints and assignment rows stay in a single searchable ledger with role-aware filters and compact rows, default reading mode hides edit/reorder/add/zero-resource noise behind `Manage plan`, and details/reference cards sit below the board.
- Dense list surfaces should prefer local search, explicit caps, and show-more controls; admin account management additionally uses 25-row client paging so the explicit first-200 cap does not become a long action wall.
- Assignment detail uses a role-specific structure: pending teacher/admin reviews render as a review desk with submission/context/history in the main column and a sticky compact decision panel; student and read-only states render as a workbench with one clear state, brief, details/resources rail, and history feed.
- Decision groups should use native radio inputs where practical. Custom radio-style controls, such as folder color choices, must implement one tab stop plus Arrow/Home/End keyboard behavior and keep `aria-checked` current.
- Dashboard pages use compact summary chips and action-first queues instead of generic KPI cards; sections should answer what the user should do next.
- Project team controls should live in a low-emphasis header `Team` trigger with a count and a popover instead of a right-side rail or full panel by default. The trigger should not lift, use saturated gradients, or visually compete with the page title.
- Edit actions use the shared violet `edit` button variant so edit controls have a clear color identity without becoming primary actions.
- Global CSS keeps the browser scrollbar gutter stable and neutralizes Radix select scroll-lock margin compensation so opening a select on long pages does not shift the layout.
- Button variant styles live in `apps/web/src/components/ui/button-variants.ts` so component files only export React components for Fast Refresh compatibility.

## Source Map

| Source | Purpose |
| --- | --- |
| `apps/web/src/components/layout/app-layout.tsx` | Protected app shell, keyboard skip link, ocean-themed sidebar/mobile header, line-current backdrop, and wide low-padding content frame. |
| `apps/web/src/components/shared/ocean-lines.tsx` | Shared line-only ocean mark, navigation icons, and animated current-line SVG accents. |
| `apps/web/src/components/ui/` | Shared shadcn/Radix-compatible UI primitives. |
| `apps/web/src/components/ui/date-picker.tsx` | App-facing date picker wrapper with string value handling. |
| `apps/web/src/components/ui/calendar.tsx` | React DayPicker composition and calendar styling. |
| `apps/web/src/components/ui/select.tsx` | Radix Select primitive wrappers. |
| `apps/web/src/components/ui/dialog.tsx` | Fixed-shell dialog primitive with visible headers, larger form-friendly width, non-semantic backdrop, single named close control, scrollable body content, focus trap, focus restoration, and ARIA title/description wiring. |
| `apps/web/src/components/shared/confirm-dialog.tsx` | Shared app confirmation dialog for destructive actions. |
| `apps/web/src/features/auth/components/auth-frame.tsx` | Shared auth shell with subtle ocean-themed background accents, compact centered card chrome, and optional single-line header copy. |
| `apps/web/src/features/dashboard/pages/dashboard-page.tsx` | Action-first dashboard layout, compact summary chips, review queue, overdue assignment queue, and project follow-up queue. |
| `apps/web/src/features/projects/pages/project-detail-page.tsx` | Compact project command header, labeled status stamps, mission-control strip, grouped assignment-first Work Plan, manage-plan mode, dialog checkpoint creation, role-aware assignment filters/search, quiet detail/reference cards, capped team popover results, centered resource dialog, and compact resource target actions. |
| `apps/web/src/features/tasks/pages/task-detail-page.tsx` | Structured assignment header, teacher review desk, student workbench/read-only states, brief/context panels, sticky details/decision areas, and history feed. |
| `apps/web/src/features/tasks/components/progress-timeline.tsx` | Divider-based history feed with inline resource links, visible styled evidence panels, configurable title/empty copy, and optional inline review form. |
| `apps/web/src/features/files/components/evidence-file-panel.tsx` | Styled per-submission evidence docket with custom choose-file control, compact file cards, downloads, deletes, and show-more guard. |
| `apps/web/src/features/resources/components/resource-link-drawer.tsx` | Scrollable resource link dialog, capped inline shelf, chip, and compact resource action components. |
| `apps/web/src/index.css` | Global ocean theme tokens, current-line animation utilities, loader animation, and academic ledger styling. |
| `apps/web/playwright.config.ts` | Browser-test configuration for Chromium smoke runs, screenshots on failure, traces on retry, and HTML reports. |
| `apps/web/e2e/auth-flow.spec.ts` | Local admin sign-in smoke check that reaches the dashboard when the API is available. |
| `apps/web/e2e/login-page.visual.spec.ts` | Login-page render check that attaches a full-page screenshot artifact to the Playwright report. |
| `apps/web/e2e/accessibility.spec.ts` | Keyboard/accessibility regressions for protected skip link, single dialog close control, modal focus containment, and folder color radio keyboarding. |

## Verification

- `pnpm --filter @unitrack/web lint`
- `pnpm --filter @unitrack/web build`
- `pnpm --filter @unitrack/web test:e2e` for Chromium browser smoke checks after the API and web stack are running.
- `pnpm --filter @unitrack/web test:e2e:headed` runs the same checks in a visible browser when a display is available.
- `pnpm --filter @unitrack/web test:e2e:ui` opens the standard Playwright test UI for local debugging.
- `pnpm --filter @unitrack/web test:e2e:report` opens the latest HTML report with captured screenshots, traces, and failure artifacts.
- Fresh Linux/WSL environments may need `pnpm --filter @unitrack/web test:e2e:install` plus `pnpm --filter @unitrack/web test:e2e:install-deps` for Chromium system libraries.
