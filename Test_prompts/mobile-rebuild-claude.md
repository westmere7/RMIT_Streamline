# Claude prompt: complete mobile rebuild with desktop preservation

Rebuild the entire mobile experience of RMIT Streamline while preserving the existing desktop application's appearance and behavior.

Implement the changes in the existing repository. This is a complete mobile interface rebuild, including working interactions and verification—not a mockup or design proposal.

## Project and access

**Repository:** `E:\WORK_OFFLINE\apps\RMIT_Streamline`

**Live reference:** https://rmit-streamline.vercel.app

**Login email:** `duc@rmit.local`

**Password:** supplied separately in the conversation; intentionally omitted from this file.

Use these credentials only to inspect the reference application. Do not put them in source files, documentation, screenshots, committed tests, or logs. Use environment variables for test credentials.

Inspect production without creating, editing, deleting, submitting bookings, sending messages, or changing permissions. Use local fixtures or an explicitly configured test environment for mutation tests.

## 1. Non-negotiable desktop preservation

The desktop application is the baseline to preserve.

- Preserve desktop layouts, spacing, typography, colors, sidebar, toolbars, tables, views, dialogs, panels, keyboard shortcuts, and interactions.
- Preserve desktop routes, deep links, data behavior, and saved preferences.
- Do not redesign desktop components as part of this work.
- Do not change global design tokens, Tailwind breakpoints, shared component defaults, or base element styles to solve mobile problems.
- Add mobile-specific components, scoped styles, and explicit responsive variants.
- When modifying a shared component, its existing desktop output and default behavior must remain unchanged.
- Avoid unrelated refactoring, dependency upgrades, database changes, and infrastructure changes.

Use a conservative responsive boundary:

- Below 768 CSS pixels: the new mobile experience.
- At 768 CSS pixels and above: preserve the existing interface, including existing tablet behavior.
- Verify the 767/768 boundary explicitly.
- Use viewport width, not user-agent detection.

“Desktop intact” includes state isolation. Opening the app on mobile or resizing the window must not overwrite desktop sidebar width/collapse state, column widths, remembered board views, or other desktop presentation preferences.

Shared business data must remain shared. If a user edits a task on mobile, desktop should receive the normal data update.

## 2. Understand the repository first

Read AGENTS.md, README.md, KNOWLEDGE_BASE.md, package.json, and relevant source files before implementation.

AGENTS.md warns that this installed Next.js version has breaking differences. Read the relevant guides in:

`E:\WORK_OFFLINE\apps\RMIT_Streamline\node_modules\next\dist\docs`

Verify actual installed versions and APIs before coding.

The current stack includes:

- Next.js App Router, React, TypeScript
- Tailwind CSS and Radix UI wrappers
- TanStack Query and Zustand
- Supabase Auth, Postgres, Realtime, and Storage
- IndexedDB local provider
- A read-only memory adapter for shared content
- Tiptap, dnd-kit, and ExcelJS
- Vitest and Playwright

Important entry points:

- `E:\WORK_OFFLINE\apps\RMIT_Streamline\src\components\layout\app-shell.tsx`
- `E:\WORK_OFFLINE\apps\RMIT_Streamline\src\components\layout\sidebar.tsx`
- `E:\WORK_OFFLINE\apps\RMIT_Streamline\src\app\globals.css`
- `E:\WORK_OFFLINE\apps\RMIT_Streamline\src\hooks\use-media-query.ts`
- `E:\WORK_OFFLINE\apps\RMIT_Streamline\src\lib\routes.ts`
- `E:\WORK_OFFLINE\apps\RMIT_Streamline\src\features\data\data-context.tsx`
- `E:\WORK_OFFLINE\apps\RMIT_Streamline\src\features\boards\board-page.tsx`
- `E:\WORK_OFFLINE\apps\RMIT_Streamline\src\features\items\item-detail-panel.tsx`
- `E:\WORK_OFFLINE\apps\RMIT_Streamline\src\features\trackers\tracker-page.tsx`

Inspect the current git status. Preserve all pre-existing uncommitted work. The repository may have newer functionality than the live deployment or knowledge base; current executable source is authoritative.

Create a route and feature inventory before coding. Track each screen through implementation and verification so secondary screens are not forgotten.

Capture reproducible desktop baselines before changing code. Use the same local fixture data, browser, viewport, fonts, theme, and state for before-and-after comparisons. Treat the live deployment as a product reference, not a pixel baseline for a different source revision.

## 3. Mobile product direction

Make this feel like a polished work-management application designed for a phone.

Retain Streamline's existing identity:

- Existing logo and icon language
- RMIT red for primary actions
- Navy foundation in dark mode
- Existing light and dark theme semantics
- Existing status and priority meanings

Use:

- Clear hierarchy and readable task titles
- Compact but comfortable spacing
- Approximately 16px body text and form inputs
- Touch targets of at least 44 × 44 CSS pixels for primary interactive controls
- Adequate spacing between adjacent actions
- Accessible labels and visible focus
- Restrained transitions that respect reduced motion
- Clear loading, empty, error, saving, and retry states

Avoid excessive decorative cards, oversized headers, gradients unrelated to the brand, tiny table controls, and long toolbars that run offscreen.

Known issues to address:

- Home currently stacks six recent-board cards before My Work.
- Mobile Home hides task status and priority in its My Work list.
- Board headers and tools compete for limited width.
- Boards still expose wide desktop tables as the primary phone experience.
- Task fields and controls can exceed the available phone width.
- The shell currently writes a narrow-screen collapse decision into the shared sidebar preference.
- Responsive rules currently mix 768px and 1024px thresholds; audit their interactions carefully.

Verify these against the current source rather than assuming the deployment is identical.

## 4. Mobile shell and navigation

Build a consistent mobile shell with:

- Compact top bar showing meaningful page context
- Search available from every main workspace screen
- Bottom navigation with no more than five destinations
- Predictable back navigation
- Clear current-location and unread indicators

Suggested bottom navigation:

**Home / My Work / Browse / Inbox / More**

Browse should expose teams, boards, favourites, trackers, and any current workspace lists.

More should provide access to Dashboard, Book a task, Messages, Members, Settings, Profile, and account actions according to permissions.

Keep all existing destinations discoverable. Reuse existing URLs. Do not invent a separate mobile backend or duplicate every route under `/mobile`.

Use full-screen navigation surfaces or accessible sheets where appropriate. Do not squeeze the full desktop sidebar into the phone layout.

Support safe-area insets and dynamic viewport height. Bottom navigation, toasts, sheets, and fixed actions must not cover content.

## 5. Home and My Work

Rebuild Home around quick access to work:

- Compact greeting and workspace context
- Current personal work near the top
- Clear overdue/today indicators derived from existing data
- Compact recent and favourite boards
- Teams and recent activity further down
- Useful loading and empty states

Do not put a large stack of navigation cards ahead of actionable work.

My Work must retain the existing grouping:

**Overdue, Today, This Week, Later, No Date, Completed.**

Task rows/cards should show:

- Readable title
- Board context
- Status
- Priority when present
- Due date and overdue indication
- Relevant assignment and update information

Reuse the existing assignment, grouping, completion, and linked-task deduplication logic. Do not treat asset assignment as identical to task assignment.

## 6. Boards and all seven views

Preserve every existing board capability while adapting its presentation for touch.

For the default Main Table view, provide a mobile task-list/card presentation over the same filtered board data:

- Collapsible groups with counts
- Readable task titles
- Status, assignees, priority, and due date
- Task reference where present
- Subitem and unread-update indicators
- Clear item details and overflow actions
- Discoverable creation and selection modes
- Accessible bulk actions

Keep every custom field available through details or a field editor. Do not silently discard fields that do not fit on a card.

An explicit grid mode may remain for advanced use, with scrolling contained within the grid. It must not make the entire page overflow horizontally.

Provide compact access to:

- Search
- Person and other existing filters
- Sort
- View selection
- Group and column configuration
- Board settings, sharing, activity, and membership actions
- Existing archive, restore, duplicate, and delete flows where permitted

Show active-filter counts and a clear reset action. Preserve existing filtering and sorting semantics.

Adapt all seven views:

- **Main Table:** grouped mobile task list plus access to the grid.
- **Kanban:** readable lanes with a lane selector or contained horizontal lane navigation; provide explicit move controls as an alternative to dragging.
- **Calendar:** readable date navigation and agenda access, while preserving existing date-oriented capabilities.
- **Timeline:** usable time navigation, readable labels, and access to task dates.
- **Gantt:** retain hierarchy, progress, milestones, and dependency information with controlled scrolling and touch-friendly editing alternatives.
- **Workload:** readable person summaries, period controls, and drill-down.
- **Chart:** responsive charts with readable legends, tap-accessible values, filters, and textual summaries.

Do not replace complex views with “Use desktop” placeholders. Do not remove functionality because its current presentation is desktop-oriented.

Mobile presentation choices must not overwrite a user's remembered desktop view. Explicit deep-link view parameters must remain meaningful.

## 7. Task details, updates, assets, and editors

On phones, task details should occupy a full-screen surface.

Preserve:

- Task title, ID/reference, cover, and board/group context
- Overview, Updates, Assets, and Activity
- Description and rich-text behavior
- Every supported custom field
- Linked tasks and existing synchronization behavior
- Subitems
- Sharing and permission-aware actions
- Booking allocation controls where applicable

Use vertically arranged fields or compact labeled sections. Avoid fixed-width desktop field cells.

Use accessible sheets or full-screen editors for people, statuses, priorities, dates, timelines, tags, dependencies, and other complex inputs.

Preserve all current column types, including derived asset recap. Do not reintroduce obsolete Files-column functionality from historical documentation.

Preserve rich-text mentions, links, replies, and supported update actions.

Assets must retain quantity, type, assignees, due dates, completion, and recap behavior. Make adding and editing deliverable lines comfortable on a phone.

Opening and closing an item must preserve the board's filters and scroll position. Direct item links, refresh, and browser Back must work. A directly loaded item must have a sensible return destination.

Keep unsaved input and pending saves safe across sheets, navigation, resizing, and keyboard changes.

## 8. Remaining application coverage

Rebuild the mobile presentation of every existing route and relevant dialog, including:

- Sign-in and invitation onboarding
- Teams and board discovery
- Trackers index and tracker editor
- Workspace lists if present in the current source
- Inbox, notifications, quiet updates, and notification settings
- Direct messages and conversation navigation
- Member directory, invitations, role controls, and member management
- Profiles and profile editing
- Workspace settings and all existing settings sections
- Dashboard and its sharing controls
- Internal task booking
- Public booking
- Public shared boards
- Public shared items
- Public shared dashboards
- Share password gates, expired links, access denied, and not-found states
- Global search, account menu, About, and version-update prompts

For messages, use a conversation-list-to-thread flow on phones with a keyboard-safe composer. Preserve drafts and existing messaging behavior.

For booking, use clear sections or steps with existing validation, deliverables, destination rules, templates, and confirmation/reference output. Changing the presentation must not change the submission contract.

For trackers:

- Preserve sheets, typed cells, row structures, editing, autosave, undo/redo, and existing Excel import/export.
- Provide readable sheet navigation.
- Contain spreadsheet scrolling within the editor.
- Offer a touch-friendly cell or row editor.
- Preserve data and existing workbook semantics.
- Do not substitute static cards for a functioning spreadsheet.

For settings and administration, reorganize dense interfaces into readable sections with reachable actions. Enforce the same permissions as desktop.

Public shares must remain read-only and retain their existing token, password, expiry, and access rules.

## 9. Implementation boundaries

Reuse existing feature hooks, board models, services, repository interfaces, mutation paths, query keys, and permission helpers.

Do not duplicate business logic inside mobile components.

Keep the existing local, Supabase, and public-memory provider behavior intact. Preserve optimistic updates, error rollback, realtime synchronization, and cache invalidation.

Prefer mobile presentation components colocated with their feature modules and a small shared mobile component set.

Keep providers, subscriptions, notification effects, and data controllers above presentation boundaries where appropriate. Do not mount two complete applications and merely hide one with CSS: that can duplicate subscriptions, mutations, focusable elements, and network work.

Simple presentational CSS variants are fine. Complex views should mount only the appropriate interactive presentation.

Use hydration-safe responsive rendering. No window access during server rendering, hydration warnings, or repeated remounting that loses drafts.

Scope mobile styling carefully, including portaled dialogs and popovers. A portal outside the mobile root must still receive the intended mobile treatment without changing desktop overlays.

Use separate storage keys for mobile-only presentation preferences when needed. Preserve existing desktop keys and values.

Do not add a new native framework, service worker, offline mutation queue, schema, API contract, or UI framework to complete this task.

## 10. Mobile interaction quality

Verify:

- No page-level horizontal overflow at supported phone widths.
- Intentional grids and time-axis views scroll within their own containers.
- Long titles, names, URLs, and labels remain usable.
- No hover-only, right-click-only, or drag-only essential actions.
- Explicit alternatives exist for reordering, moving, and selection.
- Sheets and dialogs have accessible names, focus management, dismissal, and focus restoration.
- Background content cannot be interacted with through modal overlays.
- Form controls remain visible when the virtual keyboard opens.
- Bottom navigation and fixed actions do not cover inputs or submit buttons.
- Zoom remains enabled.
- Text and status meaning are not conveyed by color alone.
- Touch scrolling does not accidentally trigger drag operations.
- Nested scrolling is limited and deliberate.
- Loading and failure feedback accurately reflect actual saves.
- Repeated taps do not submit duplicate mutations.

## 11. Verification and desktop regression protection

Add meaningful tests for the new mobile workflows and responsive boundaries. Keep existing desktop tests intact.

Test at least:

- 320 × 568
- 360 × 800
- 390 × 844
- 430 × 932
- 767px and 768px widths
- 1023px and 1024px widths
- 1280 × 800
- 1440 × 900
- 1920 × 1080

Cover light and dark themes. Test Chromium and WebKit where available, touch interaction, reduced motion, and keyboard behavior. Distinguish browser emulation from actual device testing in the report.

Use deterministic local fixtures for screenshots and mutation tests. Mask only truly dynamic content; do not hide changed UI or regenerate desktop baselines to make regressions pass.

Verify these journeys end to end:

1. Sign in and navigate all main destinations.
2. Find a board and search/filter tasks.
3. Open an item, edit fields, save, and verify persistence.
4. Return to the same board position and filter state.
5. Create a task and subitem in the test environment.
6. Use selection, bulk actions, and an explicit move control.
7. Add an update and edit an asset in test fixtures.
8. Open every board view and use its core controls.
9. Edit a tracker cell, switch sheets, verify save and undo.
10. Complete booking validation and a test submission.
11. Navigate an inbox item and a message thread.
12. Verify viewer, editor, administrator, and public-share restrictions.
13. Load deep links directly, refresh, and use browser Back.
14. Resize desktop → mobile → desktop with non-default desktop preferences and verify those preferences remain unchanged.
15. Verify mobile changes persist through existing data services and appear correctly in desktop.

Run the appropriate repository checks, including lint, typecheck, unit tests, relevant Playwright tests, and a production build.

**Important:** this repository's predev and prebuild scripts may run database migrations when configured. Use `SKIP_DB_MIGRATE=1` for UI development/testing/build verification unless migrations are explicitly required and authorized. Verify the active data provider before running tests. Do not run database seed or setup scripts against production.

Record pre-existing failures separately from regressions introduced by this work.

## 12. Workflow and completion

Begin with a concise audit, route/feature checklist, desktop baseline strategy, and implementation plan. Then proceed to implementation without stopping after the plan.

Work in manageable stages:

1. Mobile shell and shared interaction primitives
2. Home, My Work, and discovery
3. Boards, all views, and task details
4. Trackers, collaboration, booking, administration, and public screens
5. Accessibility, performance, responsive QA, and desktop regression verification

Make reasonable design and implementation decisions autonomously. Ask only when a missing requirement or access issue truly blocks progress.

Do not deploy or push to production as part of this task.

Deliver:

- The completed implementation
- A route/feature coverage checklist
- A concise explanation of the mobile architecture and desktop isolation
- Representative mobile screenshots
- Desktop before-and-after comparison evidence
- Test/build results with exact failures or limitations
- Changed files and any remaining issues

Do not call the task complete if secondary screens remain desktop-only, core actions are placeholders, or desktop regressions remain unexplained.

Success means someone can perform the application's existing workflows comfortably on a phone, while desktop users retain the same interface and behavior they had before.
