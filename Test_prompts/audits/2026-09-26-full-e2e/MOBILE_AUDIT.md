# The phone: audit and revamp plan

26 September 2026, revision `0649d71`.

The brief asked for a revamp so that the phone version is "robust, perfectly usable", because it will be used as much as the desktop. This document has four parts:

1. An audit of the phone experience as the code has it.
2. The fixes already prepared (FX-06, FX-17, FX-18).
3. The revamp specification.
4. How to prove it works.

## How this audit was made — and what it is not

It is a **static** audit: the code of every phone-reachable surface was read. The automated sweep was written but not run. It is `mobile-sweep.cjs` in the session's scratchpad (copied below), and it screenshots every route at phone width and measures horizontal overflow, elements past the edge, and tap targets under 40 px.

Midway through the session the permission layer began refusing every shell command and browser action. That meant no dev server, no Playwright and no screenshots. So nothing here was looked at on a screen, and the revamp itself could not be built and checked in this session. Building UI without seeing it would not give a "robust" result, so the revamp is specified here in enough detail to build straight from, and `NEXT_SESSION.md` says how.

## What exists

- **One boundary.** Below 768 px, `useIsMobile()` mounts `MobileShell` instead of the sidebar frame. The server snapshot is desktop, and hydration swaps once.
- **The shell.** A top bar (brand, title, search) and five tabs: Home, My Work, Browse, Inbox, More. It uses `h-dvh` and safe-area padding.
- **Phone-specific screens:**
  - Home (`home-mobile.tsx`), My Work (`my-work-mobile.tsx`), Browse, More;
  - the board (`mobile-board-screen.tsx`): cards with status, priority and date sheets, a floating New item button, select plus a bulk bar, grid mode, and Kanban one lane at a time with Move to;
  - the tracker row editor.
- **Surfaces that switch on a phone:**
  - the task opens full screen;
  - cell editors open as sheets (`cell-shell.tsx`);
  - board menus render as sheets (`menu-sheet.tsx`);
  - automation dialogs become bottom sheets;
  - Members, the portal board, shared boards, the undo bar and the update card have phone branches.
- **Everything else is responsive CSS only.** That covers Dashboard, Inbox, Messages (which switches list and thread), profile, team pages, Settings (sections become a horizontal row), the automations page, Portal and Booking (including the form editor), the archive, the booking wizard, login and join.

In all, only 16 files are phone-aware.

## Findings

Severity uses the audit scale.

| ID | Finding | Sev | Where | Fix |
| --- | --- | --- | --- | --- |
| **M-01** | **Dialogs cannot scroll.** `DialogContent` is `fixed top-1/2 -translate-y-1/2` with no max-height and no overflow. On a phone — especially in landscape or with the keyboard up — the lower part of a tall dialog cannot be reached at all: Create board, Share by link, Save as template, the portal's two settings dialogs, Add member, Publish form, the ticket prefix dialog, snapshot restore and the Danger zone wipe. | **P1** (phone) | `src/components/ui/dialog.tsx:45` | **FX-17** (prepared): `max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain` |
| **M-02** | Dialogs are centred cards on a phone, not sheets. With `p-6` inside a `100% − 2rem` card, a 360 px screen leaves about 280 px for content. Footers stack (`flex-col-reverse`), which is right, but primary actions end up below the fold. | P2 | `dialog.tsx`, every dialog | Revamp R-2: responsive dialog |
| **M-03** | Popovers stay popovers on a phone except for cell editors. 256 px fixed width, anchored to a small trigger, no max-height. This affects filter, label and person pickers outside cells, date pickers in forms, and the portal range picker. | P2 | `popover.tsx`, callers | Revamp R-3 |
| **M-04** | **27 controls are revealed only by hover.** Tailwind 4 applies `hover:` only where the device can hover, so on touch these stay invisible — yet remain tappable, as invisible buttons. On phone surfaces this hides: edit, delete and the reply-reaction button on updates; the task panel's per-column menus; cover change/remove; archive restore/delete; message delete; list-entry remove in Settings; the sync unpair button; team rows; and the phone grid's row actions, add-subitem, group menu and column menu. | **P1** (phone) | 17 files | **FX-18** (prepared): `pointer-coarse:opacity-100` on the 15 phone-reachable ones. Desktop-only ones (sidebar row menus, sort arrows, resize handles, panel drag grip) are left |
| **M-05** | The date sheet's Today, Tomorrow and Next week use the UTC day, so on a Melbourne or Vietnam morning they are a day early. | P2 | `mobile-item-card.tsx:315-320` | **FX-06** (prepared) |
| **M-06** | The phone's Ticket toggle does nothing on the phone grid, but changes and syncs the desktop table setting. | P3 | `mobile-board-tools.tsx` | R-6: phone-only preference |
| **M-07** | My Work on a phone has no search and no filters. The desktop filter bar (kind search, PIC, board, status, priority, due, type) has no phone equivalent. | P2 | `my-work-mobile.tsx` | R-7 |
| **M-08** | Search opens as a desktop command dialog (`top-[18%]`, list `max-h-[380px]`). With the keyboard up, results sit behind it. | P2 | `command.tsx:27,54` | R-8: full-screen search sheet |
| **M-09** | Settings on a phone is one long page behind a horizontally scrolling row of ten section chips. Snapshots and the Danger zone live off the end of the row. | P2 | `settings-page.tsx` | R-9: settings as a list that drills in |
| **M-10** | The Portal and Booking form editor is a desktop layout (editor plus side panel). The portal card's gear dialogs hit M-01. | P2 | `book-task-page.tsx`, `booking-form-editor.tsx` | R-10: phone shows the portal card, settings sheets and "Preview the form"; editing the form says to use a larger screen |
| **M-11** | Dashboard panels stack, but the two workload tables are `min-w-[34–36rem]` in horizontal scrollers, and dense charts shrink to unreadable. There is no phone ordering. | P2 | `features/dashboard/views/*` | R-11: phone order, collapsible panels, list forms of the tables |
| **M-12** | The tracker page's name input is `w-96` (384 px) with no `max-w-full`, so it overflows a 360 px screen when renaming. | P3 | `tracker-page.tsx:107` | R-12 |
| **M-13** | Right-click context menus have no touch equivalent. Every context-menu action must also sit behind a visible "…" button. It does for board cards (`mobile-item-menu`); check Kanban cards, archive rows and tracker rows. | P2 | context-menu callers | R-13 |
| **M-14** | No web-app manifest: the app cannot be added to a home screen as an app (full screen, its own icon, theme colour), and iOS gives browser notifications only to installed web apps. | P2 | `src/app` (only `icon.svg`) | R-14: `manifest.ts`, icons, `themeColor`, `appleWebApp` metadata |
| **M-15** | Browser notifications: on iOS Safari outside an installed web app, `Notification` is not available. The "Notifications on this device" switch should then say so rather than fail. Needs checking on a device. | P3 | `use-os-notifications.ts`, settings dialog | R-15 |
| **M-16** | Journey dialog, Word download and the rich-text pop-up use desktop dialogs (M-01, M-02). | P3 | `task-journey-dialog.tsx`, `rich-text-field.tsx` | Covered by R-2 |
| **M-17** | Portal booking on a phone: the portal's own sign-in hint and the wizard's sign-in offer can both show (F-157 area). The scale controls sit under the card. | P3 | `portal-booking.tsx` | R-17 |
| **M-18** | Danger zone and snapshot restore run a full-screen blocking screen. On a phone that is right, but closing or backgrounding the tab mid-restore is likely. Its copy should say "keep this screen open". | P3 | `snapshots-section.tsx` | Copy |

## Prepared fixes (in `apply-fixes.mjs`, unverified until run)

| Fix | Change |
| --- | --- |
| **FX-17** (M-01) | Every dialog is capped at the screen's height and scrolls inside itself. |
| **FX-18** (M-04) | 15 hover-only controls become visible on coarse pointers: `item-updates` ×2, `item-detail-panel`, `item-cover`, `archive-table`, `messages-page`, `lists-section`, `sync-field-list`, `team-page`, `item-row` ×2, `group-section`, `column-header-row`, `tracker-grid` ×2. |
| **FX-06** (M-05) | The date sheet uses the local day. |

How to check them:

1. Run `npm run check`.
2. Open the dev preview at 390 × 844 (`preview_resize` mobile).
3. Open a task and confirm you can edit, delete and react to an update, and open a column's menu.
4. Open Create board and Share by link in landscape (844 × 390) and scroll to their buttons.

## The revamp

### Goals

1. **Everything a person does at a desk can be done on a phone.** It may be a different shape, but it is never missing. The one exception is editing the booking form's structure, which gets a clear "use a larger screen" route.
2. **Nothing is reachable only by hover, right-click or drag.** Every such action also has a visible control of at least 44 × 44 px.
3. **No page scrolls sideways.** Tables that must stay wide scroll inside their own box, with a visible edge.
4. **Every overlay fits on the screen.** Dialogs, menus and pickers are sheets or full screens on a phone, reachable with the keyboard up.
5. **It feels like an app.** It can be installed, has instant feedback, is thumb-reachable, and keeps its state across tab switches.

### Architecture (build these first)

| # | Piece | Where | What |
| --- | --- | --- | --- |
| R-1 | `useIsMobile` stays the single boundary | `src/hooks/use-mobile.ts` | Add `usePointerCoarse()` beside it, for touch-only affordances on tablets (a 768–1024 px iPad stays on desktop). |
| R-2 | `ResponsiveDialog` | `src/components/ui/responsive-dialog.tsx` | The same API as `Dialog`/`DialogContent`. Below 768 px it renders the existing `Sheet` (bottom, `max-h-[88dvh]`, drag handle, sticky footer from `DialogFooter`); above, it renders the dialog. Migrate every `DialogContent` caller (about 40) by swapping the import. Keep `size` for desktop only. |
| R-3 | `ResponsivePopover` | `src/components/ui/responsive-popover.tsx` | Popover on desktop; a bottom sheet with a title on a phone. Migrate pickers: label, person, date, dependency, tags, the portal range, and filter popovers. `cell-shell.tsx` already does this for cells, so reuse its pattern. |
| R-4 | `MenuSheet` everywhere | `menu-sheet.tsx` | Row menus, the Kanban card menu, the archive row menu, tracker row/column menus and the user menu become sheets on a phone. A context menu keeps a visible "…" twin. |
| R-5 | `MobilePage` scaffold | `src/components/layout/mobile-page.tsx` | Title, back, actions and a scroll body with safe areas. Every phone route uses it, so headers, back behaviour and pull-to-refresh are uniform. |

### Page by page

| Route | Phone design |
| --- | --- |
| Home | Keep the counts and my work. Add "Favourites" as a horizontal strip, and "Recent boards". |
| My Work (R-7) | Add a search field and a Filters sheet with the desktop filters (`src/features/my-work/filters.ts` is pure, so reuse it). Chips show active filters. |
| Board | Keep cards, sheets, the button and select. Add: view switcher as a sheet; filter/sort sheets with the desktop's full set; group collapse; "Add group"; the column picker as a sheet (a special column's picker states included); column Format/Used as in a column sheet. Grid mode: sticky first column, no hover actions (FX-18). |
| Task (full screen) | Tabs Overview / Updates / Assets / Activity as a segmented control at the top. The update composer sits at the bottom above the keyboard (`position: sticky` + `env(keyboard-inset-height)` where supported). The reaction picker is a sheet. The journey opens full screen. Deliverables get their own full-screen editor. |
| Inbox | Tabs as a segmented control; swipe or "…" to mark read; Clear behind a sheet. |
| Messages | Already list ↔ thread; move the composer above the keyboard. |
| Dashboard (R-11) | Phone order: headline figures → needs attention → workload (as a list: person, open, overdue) → output by month → by team → asset mix → departments. Every panel collapsible, the state remembered. The settings menu becomes a sheet. |
| Automations | The page as tabs; rules as cards; the rule editor full screen (already a sheet); recipes as a list. |
| Portal and Booking (R-10) | The portal card and its settings as sheets. The form editor offers Preview and says "Editing the form works best on a larger screen" with a link that opens the desktop view in a new tab. |
| Settings (R-9) | The phone shows a list of groups and sections (like iOS Settings). Each section opens as its own page with back. Snapshots and the Danger zone are fully usable; destructive confirmations are sheets. |
| Members, profiles, teams | Card lists; actions in sheets; the hover card becomes a tap target that opens a sheet profile preview. |
| Trackers | Keep the row editor. Sheet and column management in sheets; the name input `max-w-full` (R-12). |
| Archive | Rows as cards with Restore/Delete visible. |
| Public: booking, portal, shares, dashboard link, join, login | Check at 320–414 px. The booking wizard's steps as a compact stepper; the portal's toolbar in a sheet; the dashboard link in phone order. |

### App-like behaviour

- **R-14 (installable).** Add `src/app/manifest.ts` (name, short_name "Streamline", `display: "standalone"`, `theme_color` navy, background, icons 192/512/maskable), `viewport.themeColor`, `appleWebApp` metadata and an apple touch icon.
- **R-15 (notifications).** Detect support: say "Add Streamline to your home screen to get notifications" on iOS outside the installed app.
- **Feedback.** Every tap that writes shows its result optimistically (already true for boards). Buttons have `active:` states. Long lists keep their scroll position across back navigation.
- **Offline and slow networks.** A slim "Reconnecting…" bar when the network drops, and queued edits reported on failure. `beginUnsavedWork` already guards leaving.

### Order of work

1. Apply FX-06, FX-17 and FX-18, and verify them (a quarter of a day).
2. Build R-2, R-3 and R-4, and migrate every dialog, popover and menu. Verify at 360/390/414 in portrait and landscape, light and dark.
3. R-5 scaffold; Settings (R-9); My Work filters (R-7); search sheet (R-8).
4. Task full screen, the composer above the keyboard, and deliverables.
5. Dashboard phone order (R-11); Portal and Booking on a phone (R-10); tracker and archive details.
6. R-14 manifest and install; R-15 notifications; offline bar.
7. Phone e2e suite and sweep; fix what they find.

## Proving it

- **The sweep.** `mobile-sweep.cjs <base> <out> 390 844`, then again at 360 × 780 and 844 × 390. Acceptance: `overflowX = 0` on every route; no element past the right edge outside a scroller; no interactive element under 40 px except inline text links.
- **Phone e2e.** Add a Playwright project `mobile` using `devices["iPhone 13"]` and `devices["Pixel 7"]`, with `hasTouch`. Keep `tests/e2e/mobile-layout.spec.ts` and add:

  | Spec | Covers |
  | --- | --- |
  | `mobile-task.spec.ts` | Open a task; edit, delete and react to an update; reply; tick a deliverable; change a column from the panel |
  | `mobile-dialogs.spec.ts` | Create board, Share, Save template, Add member and Publish in landscape; reach the primary button |
  | `mobile-my-work.spec.ts` | Search and filter |
  | `mobile-settings.spec.ts` | Every section reachable; snapshots and departments editable |
  | `mobile-booking.spec.ts` | Portal → book for a department with no work → receipt |

- **On devices.** Check on one iPhone (Safari) and one Android (Chrome): install to the home screen, notifications, keyboard overlap, safe areas, dark mode.

## The sweep script

```js
// node mobile-sweep.cjs <baseUrl> <outDir> [width] [height] — LOCAL provider only.
// Signs in as Danh on /login, discovers boards/teams/trackers/people from the
// app's own links, then for each route: screenshot, horizontal overflow,
// elements past the right edge (outside horizontal scrollers), and tap targets
// under 40px. Writes report.json beside the screenshots.
```

The full script is in the session scratchpad at `audit/mobile-sweep.cjs`, and a copy is kept beside this file as `mobile-sweep.cjs`.

Its settings-section list needs `general`, `tickets`, `teams`, `departments`, `asset-types`, `permissions`, `view`, `snapshots`, `danger` and `documentation`. The copy here has been corrected to those ids.
