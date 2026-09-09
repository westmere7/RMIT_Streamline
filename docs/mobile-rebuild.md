# The mobile rebuild

Below 768 CSS pixels Streamline now mounts a phone application. At 768 and above
it serves the interface it always did, unchanged.

## Architecture, and how the desktop is isolated

**One boundary, one hook.** `useIsMobile()` (`src/hooks/use-mobile.ts`) is the
only place the number 767 appears. It reads a media query through
`useSyncExternalStore`, whose server snapshot is `false` — so the server renders
the desktop branch, hydration matches, and the swap happens on the first commit.
Width, never the user agent: a narrow desktop window is a phone as far as layout
goes, and a tablet in landscape is not.

**One shell is mounted, not two.** `AppShell` branches on that hook and returns
either the phone shell or the existing frame. Hiding one with CSS would leave its
queries, subscriptions, mutations and focusable controls alive behind the one you
can see. Everything above the frame — providers, notifications, the command
palette, the version watcher — is shared, so neither shape owns the app's
behaviour.

**Presentation is new; logic is reused.** No business rule is reimplemented for
the phone. The mobile board reads the same `BoardModel`, writes the same
`useBoardMutations`, and drives the same `board-ui-store`, so a filter set on a
phone is the filter the grid shows. Where a rule lived inside a desktop component
it was extracted rather than copied:

| Was | Now | Used by |
| --- | --- | --- |
| Lane building inside `KanbanView` | `useKanbanLanes` / `useLaneOptions` | desktop Kanban, mobile Kanban |
| Member row mutations inside `MemberRow` | `MemberActions` | members table, member cards |
| Board menu actions | `useBoardMenuActions` (already shared) | sidebar row, board header, mobile header |

**Sheets instead of popovers.** `Sheet` (`src/components/ui/sheet.tsx`) is a
bottom sheet on Radix Dialog, so the accessible name, focus trap, focus
restoration, Escape and inert background come for free. `MenuSheet` renders any
`MenuAction[]` — the same declarations behind the right-click menu and the "…"
dropdown — as full-width rows with a drill-down for sub-menus. The important
consequence is in `PopoverCell`: below 768 a cell's editor opens as a sheet
rather than a popover, which gives **every column type** a touch-sized editor
with no second implementation to keep in step.

**State isolation.** Three separate rules:

- The narrow-screen sidebar fold is *derived*, never persisted:
  `collapsed = preferCollapsed || autoCollapsed`. The old shell wrote
  `setSidebarCollapsed(true)` into the shared preference, which then followed the
  reader back to their desktop. That effect is gone.
- Phone-only presentation choices (cards vs grid, the Kanban's lane) live under
  their own key, `streamline.mobile-view`. The board's own view settings are
  saved with the person's board visit and follow them to another device; a
  phone-shaped choice has no business there.
- Explicit view switches still go through the normal `setView`, because choosing
  Kanban is a decision, not a presentation artefact. Deep-linked `?view=` and
  `?item=` keep working on both.

**Touch sizing lives in the primitives.** `Button`, `Input`, `Textarea`,
`Select`, `Tabs` and the dropdown rows carry `max-md:` variants giving every
control a 44px floor and 16px text below 768 — 16px specifically because iOS
Safari zooms the page when a focused input is smaller than that. These are added
variants, not changed defaults: the desktop rules are untouched and desktop
output is byte-identical. Doing this at the source fixed touch targets across
twenty screens at once instead of twenty bespoke edits that would drift.

## Route and feature coverage

| Route | Mobile treatment |
| --- | --- |
| `/login`, `/join/[token]` | Existing centred card; inputs now 44px/16px |
| `/workspace/[slug]` (Home) | Rebuilt: greeting, overdue/today/open tallies, your work, board chips, activity |
| `…/my-work` | Rebuilt as cards; the same six sections and grouping |
| `…/browse` | **New route.** Favourites, teams, boards, trackers, people — filterable |
| `…/more` | **New route.** Dashboard, Book, Messages, Members, Settings, Profile, theme, About, sign out |
| `…/boards/[slug]` | Rebuilt: mobile header, chip tools, card list + contained grid, lane-picker Kanban, five date-axis views framed |
| — item details | Full-screen; fields stacked; every column type edits through a sheet |
| `…/inbox` | Existing layout; tabs and the read toggle touch-sized |
| `…/messages` | Already a list-to-thread flow below md; kept |
| `…/members` | Rebuilt as cards; actions shared with the table |
| `…/people/[userId]` | Existing layout; list rows touch-sized |
| `…/teams/[teamId]` | Existing layout; member name links fill their row |
| `…/trackers` | Existing card list |
| `…/trackers/[id]` | Spreadsheet kept and contained; **new row editor**; 48px sheet tabs; sheet actions button |
| `…/dashboard` | Existing responsive layout |
| `…/book` | Existing sections; inputs 44px/16px, asset chips 44px |
| `…/settings` | Existing sections; nav rows touch-sized |
| `/share/[token]` | **Rebuilt**: cards, lane picker, mobile tools — read-only enforced by context |
| `/share/item/[token]` | Full-screen panel |
| `/dashboard/[token]` | Existing responsive layout |
| `/book/[slug]/[key]` | Existing sections |
| Share password gate, expired, denied, not-found | Existing centred states, verified at 390 |

## What was found along the way

Two defects unrelated to layout, both fixed:

1. **ID search did nothing.** `matchesSearch` and `SearchService` only ever
   compared `item.name`, so typing a booking code — the thing people actually
   have to hand — found nothing. Both now match `item.reference` with the hyphen
   optional (`TA-7441`, `ta7441`, `7441`), and the command palette shows the code
   it matched on.

2. **A startup race destroyed the saved sidebar width.** The sidebar's team
   auto-expand runs as a child effect, and child effects run before the parent's
   `useUiStore.persist.rehydrate()`. Opening straight onto a board therefore
   persisted the session's defaults over the reader's saved width. Present at
   `HEAD` and unrelated to this work, but it destroyed the exact state the
   rebuild is meant to protect, so it is held until hydration.

## Verification

- **Boundary**: 767 → phone, 768 → desktop, asserted in both a unit test and a
  Playwright test that resizes live without reloading.
- **State isolation**: desktop → mobile → desktop on a board page leaves
  `sidebarWidth: 317` and `sidebarCollapsed: false` untouched, and the sidebar
  renders back at 317px. At 1023 the sidebar folds to 56px while the stored
  preference stays untouched.
- **Overflow**: zero page-level horizontal overflow at 320, 360, 390 and 430 —
  every board view, every route. The grid, the time-axis views and the
  spreadsheet scroll inside their own containers (the tracker: 3,584px of content
  in a 390px port).
- **Desktop regression**: at 1024, 1280, 1440 and 1920 the desktop shell renders
  with zero mobile elements mounted, 600 grid cells, the sidebar at its stored
  width, and no overflow. Members still renders its table with 36px controls at
  13px text. Screenshots of Home, a board, Members and Trackers at 1440x900,
  taken from a production build of `1de5b41` and one of this tree, are
  byte-identical (sha256 99f8677e, 2395afd7, 7e9ca882, a26bdc75).
- **Playwright**: 13/13 in the mobile suite. In the full suite every failure also
  fails on a `1de5b41` build run beside it — a strict subset of the baseline's,
  clustered in sign-in, drag-and-drop and share-password specs.
- **Writes**: the Kanban move control was driven end to end (lane counts
  22→21/1→2, then back). A tracker cell was edited through the row editor, seen
  in the grid, undone, and confirmed restored after a reload.
- **Accessibility**: sheets expose `role="dialog"` with an accessible name, trap
  focus, lock body scroll and mark the shell `aria-hidden`; zoom is not disabled
  (`initial-scale=1`, no `maximum-scale`).
- **Dark mode**: navy foundation preserved (`rgb(6, 8, 26)`), sheets and the
  bottom bar included.

## Known limits

- Everything was verified in emulated Chromium viewports. No physical handset and
  no WebKit run — worth doing before this reaches real phones, particularly for
  the `dvh` and safe-area behaviour, which emulation models worst.
- Reduced motion is coded (`motion-reduce` variants on the sheets) but was not
  exercised in a run.
- Adding a subitem from a card's menu creates "New subitem" and expects a
  rename, where the desktop opens an inline field.
- All mutation testing ran on the local IndexedDB provider with seeded fixtures.
