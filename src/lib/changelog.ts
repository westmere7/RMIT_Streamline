/**
 * What changed in each release, newest first.
 *
 * Add an entry whenever package.json's version is bumped: the update pop-up
 * reads this from the new build (/api/changelog) and shows every entry between
 * the version a page is running and the one the server has.
 */

export interface ChangelogEntry {
  /** package.json version, e.g. "0.32.0". */
  version: string;
  /** Release day, YYYY-MM-DD. */
  date: string;
  /** The release in a few words. */
  title: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.41.10",
    date: "2026-09-25",
    title: "Roomier folded threads",
    changes: [
      "A collapsed update shows who wrote it and when on one line, with its reactions and replies on the right, and up to two lines of what it says below.",
    ],
  },
  {
    version: "0.41.9",
    date: "2026-09-25",
    title: "Status bars line up",
    changes: [
      "In Time in each status, every bar ends at the same point, whatever the length of the time beside it.",
    ],
  },
  {
    version: "0.41.8",
    date: "2026-09-25",
    title: "Names sit still",
    changes: [
      "Long item names no longer scroll on hover. They fade out at the end, and the whole name is in the tooltip.",
    ],
  },
  {
    version: "0.41.7",
    date: "2026-09-25",
    title: "Time in each status, redrawn",
    changes: [
      "Task journey's Time in each status is a card of its own, longest first. Each status has a bar for its share, its time and percentage, and the one the task is in now is marked.",
      "The Where the time went bar is gone. The figures above it already give the queue and team times.",
    ],
  },
  {
    version: "0.41.6",
    date: "2026-09-25",
    title: "Task journey on the portal",
    changes: [
      "Task journey now works on the portal. A request's history loads when you open it, trimmed to what the journey shows.",
      "The sidebar selects a board where you opened it from. Choosing it in its team moves the selection there from Favourites.",
    ],
  },
  {
    version: "0.41.5",
    date: "2026-09-25",
    title: "Favourites stay put",
    changes: [
      "A board opened from Favourites is selected there alone. Its team in the sidebar no longer opens to it or highlights it too.",
    ],
  },
  {
    version: "0.41.4",
    date: "2026-09-25",
    title: "Quicker scroll, roomier rename",
    changes: [
      "A long name starts moving half a second after the hover.",
      "When you rename a task, the name field spans the whole cell. Its badges and buttons step aside until you finish.",
      "The logo at the top of the sidebar sits a little further in.",
    ],
  },
  {
    version: "0.41.2",
    date: "2026-09-25",
    title: "Long names scroll",
    changes: [
      "Hover a row whose name is too long, and after a second the name scrolls to its end and back, looping until you move away. It stays still for anyone who asks their system for less motion.",
      "Done tasks are no longer crossed out anywhere. They stay slightly muted.",
    ],
  },
  {
    version: "0.41.1",
    date: "2026-09-25",
    title: "Names use the whole cell",
    changes: [
      "An item's name uses the whole cell until the row is hovered. Rename, open and more take up room only then.",
      "A name too long for its cell fades out at the end instead of ending in “…”. It stops before the linked, updates and blocked icons, which always stay whole.",
    ],
  },
  {
    version: "0.41.0",
    date: "2026-09-25",
    title: "Date, Time and Date + Time columns",
    changes: [
      "Three new columns: Date, Time and Date + Time. None of them counts as a deadline.",
      "Format in a column's menu sets how its values are written: Sep 16, 16 Sep 2026, 16/09/2026 or 2026-09-16, and 19:06 or 7:06 PM. Date + Time is compact by default: Sep 16, 19:06.",
      "Task Allocation has a Booking time column, filled in by itself from when the task was booked and never edited. No other board can have one.",
      "Automations can set the new columns.",
    ],
  },
  {
    version: "0.40.1",
    date: "2026-09-25",
    title: "Threads read as threads",
    changes: [
      "An update's text sits further left, under its author.",
      "Replies and the reply box hang off the update by a thread line, so they read as its conversation.",
    ],
  },
  {
    version: "0.40.0",
    date: "2026-09-25",
    title: "Snapshots",
    changes: [
      "Admins can take a snapshot of everything the workspace holds, saved as one file in the database: boards, tasks, comments, people and settings.",
      "Download any snapshot, or upload one downloaded before.",
      "Restoring a snapshot asks for your password, and saves the current state as a snapshot first, so a restore can be undone.",
      "Settings has a Data group for Snapshots and Storage.",
    ],
  },
  {
    version: "0.39.1",
    date: "2026-09-25",
    title: "Reactions on updates",
    changes: [
      "React to an update or a reply with one of sixteen emoji. Click a reaction to add yours or take it back. Hover it to see who reacted.",
      "Reactions sit quietly under the update: the emoji and a count in a hairline outline, with no fill.",
      "Reactions appear live for everyone with the task open. A collapsed update shows its tally.",
    ],
  },
  {
    version: "0.38.1",
    date: "2026-09-25",
    title: "Settings touch-ups",
    changes: [
      "Departments and Asset types no longer repeat their description above the list.",
      "The System theme swatch shows light and dark side by side.",
    ],
  },
  {
    version: "0.38.0",
    date: "2026-09-25",
    title: "Settings, regrouped",
    changes: [
      "Settings sections are grouped (Workspace, Lists, People, You, Help) and each has an icon.",
      "Tickets has its own section. Lists is split into Departments and Asset types.",
      "Overview shows teams, boards, people and tickets issued. Each figure opens what it counts.",
      "Appearance includes the theme. Roles shows ticks and dashes. Members is linked from People.",
    ],
  },
  {
    version: "0.37.2",
    date: "2026-09-25",
    title: "A wider Item column, and quieter edits",
    changes: [
      "Drag the Item column's edge to widen it. It never goes narrower than the default. Double-click the edge to reset it.",
      "Editing a cell no longer offers to undo. Set it again instead.",
      "A compact Brief column centres its header as well as its cells.",
    ],
  },
  {
    version: "0.37.0",
    date: "2026-09-25",
    title: "Download a brief as Word",
    changes: [
      "A brief, or any rich-text document, downloads as a Word file from its pop-up, with its service header, headings, lists and links.",
      "Allocate to: every team opens to its boards, even a team with just one.",
      "In the column picker, the one-per-board note sits under its own rule, apart from the type's description.",
    ],
  },
  {
    version: "0.36.3",
    date: "2026-09-25",
    title: "Service first in the brief",
    changes: [
      "A booking brief opens with its service and what it involves as a header, above the questions.",
      "A special type already on the board still shows its description in the picker. Clicking it moves that column to where you were adding one.",
    ],
  },
  {
    version: "0.36.2",
    date: "2026-09-25",
    title: "One of each special column",
    changes: [
      "A board holds one column of each special type. A type already on the board is greyed out in the picker. Date is the exception.",
      "Brief columns start compact, showing only \"Brief\". Widen the column to see the start of the brief.",
    ],
  },
  {
    version: "0.36.1",
    date: "2026-09-25",
    title: "Briefs follow the task",
    changes: [
      "A booked task keeps its brief, so adding a Brief column to any board fills it in straight away for every booked task there.",
      "The plain copy of the brief that allocation left at the top of a description is removed once the Brief column holds it.",
    ],
  },
  {
    version: "0.36.0",
    date: "2026-09-25",
    title: "A Brief column",
    changes: [
      "Brief is a new system column type. A booking writes its brief into it, headings and all; on any other task it is a rich-text field of its own.",
      "Existing Brief columns, on Task Allocation and team boards, are now the Brief type, and allocation carries the brief across.",
      "The note under the system types now reads: read by the dashboard, portal and booking.",
    ],
  },
  {
    version: "0.35.4",
    date: "2026-09-25",
    title: "Portal tasks read like the app",
    changes: [
      "On the portal, a task's brief is a Brief row with its headings, the same as in the app, instead of a block of plain text.",
      "Portal columns use the app's names: Department, PIC, Due date, Assets recap and Asset type.",
      "Read-only viewers no longer see an empty description box.",
      "Removed a duplicate, empty Department column that appeared on Task Allocation.",
    ],
  },
  {
    version: "0.35.3",
    date: "2026-09-25",
    title: "Wider form editor",
    changes: ["Portal and Booking uses more of the screen: the form editor grows with the window, next to a slightly wider side panel."],
  },
  {
    version: "0.35.2",
    date: "2026-09-25",
    title: "One word: Department",
    changes: [
      "\"Department\" is the only word used for who the work is for: the column type, board columns, portal grouping, dashboard and the guide.",
      "Existing Stakeholder columns are now called Department; on Task Allocation the typed-in department is \"Requester department\".",
    ],
  },
  {
    version: "0.35.1",
    date: "2026-09-25",
    title: "Quicker delete for updates",
    changes: ["Deleting an update or reply asks with a small \"Delete?\" badge in place of the bin: click it again to delete, or leave it and it stands down."],
  },
  {
    version: "0.35.0",
    date: "2026-09-25",
    title: "Threaded updates",
    changes: [
      "Updates are threads: each update is a card with its replies inside and a \"Write a reply…\" box at the foot.",
      "Replies start as a plain box and open into the full editor when you need formatting.",
      "Collapse a conversation to one line, or collapse them all; long threads show the latest three replies first.",
      "The author of an update hears when somebody replies to it.",
    ],
  },
  {
    version: "0.34.4",
    date: "2026-09-25",
    title: "Visitors choose their size",
    changes: [
      "Booking form visitors can make the form larger or smaller for themselves; the team can turn that off in Booking form settings.",
      "The theme and size controls sit quietly at the foot of the brand panel, under the card on a phone, instead of in the form's header.",
    ],
  },
  {
    version: "0.34.3",
    date: "2026-09-25",
    title: "Booking form dropdowns at larger sizes",
    changes: ["On a booking form set larger or smaller, dropdowns and pickers open right beside their field, at the same size as the form."],
  },
  {
    version: "0.34.2",
    date: "2026-09-25",
    title: "Template save times",
    changes: ["Saved templates show the time they were saved as well as the date."],
  },
  {
    version: "0.34.1",
    date: "2026-09-25",
    title: "Booking form size, and smaller fixes",
    changes: [
      "Booking form settings: an interface size from 80% to 150%, for kiosks, big screens or anyone who wants it larger.",
      "A request being allocated shows a soft sweep and \"Moving…\" until it has left Task Allocation.",
      "Form editor: templates have a panel of their own, and a loaded template can be updated in one click.",
      "Task journey opens from an icon beside share and close in the task panel; that icon row is more compact.",
      "Team and board icons in menus keep their own colours.",
      "Profiles are calmer: one strip of figures and one card for the open-work splits.",
    ],
  },
  {
    version: "0.34.0",
    date: "2026-09-25",
    title: "Task journey",
    changes: [
      "Task journey: from a task's Activity tab, see its story from booking to archive: allocation, moves, status changes and deliverables, with how long each leg took.",
      "Where the time went: time in the queue, with the team and from done to archive, plus time spent in each status.",
      "Profiles read like a dashboard: headline figures, open work by due date, board and department, and tabbed lists.",
      "The portal area is now called Portal and Booking; the form editor's side panel is down to Copy link, Open form and Open Task Allocation.",
    ],
  },
  {
    version: "0.33.0",
    date: "2026-09-25",
    title: "Form editor: the published form, named",
    changes: [
      "The form editor shows the published form: its name, how many questions it asks, when it was published and how many tasks were booked since.",
      "Publishing asks for a name, defaulting to the team name with the date and time.",
      "Templates → Load the published form puts the live form back in the editor.",
      "Dashboard names lead somewhere: people open their profile, teams their page, and a department narrows the workload to it.",
    ],
  },
  {
    version: "0.32.0",
    date: "2026-09-25",
    title: "Departments, calmer motion, and a changelog",
    changes: [
      "New versions are announced in a pop-up with everything that changed since yours, to refresh now or later.",
      "The workspace's groups are now called Departments, and each person has one Department.",
      "Dashboard motion starts once the page has loaded: shapes grow in and the headline figures count up; small numbers stay still.",
      "Automations: board automations, recipes and activity each have their own tab.",
      "Search ranks every match, and the Admin panel follows the team's colours.",
      "A more compact task panel; the wide view pairs Overview with Updates and Assets with Activity.",
      "The folded asset progress bar spans the full width of the panel.",
    ],
  },
  {
    version: "0.31.0",
    date: "2026-09-24",
    title: "Portal link settings",
    changes: ["Each portal link has its own settings dialog, with Save and Discard.", "The portal header and booking follow the link's settings."],
  },
  {
    version: "0.30.0",
    date: "2026-09-23",
    title: "Resizable sidebar",
    changes: ["The sidebar can be dragged wider or narrower.", "Ticket numbers sit more neatly in the board table."],
  },
  {
    version: "0.29.2",
    date: "2026-09-20",
    title: "Task name first",
    changes: ["The task panel leads with the task's name, then everything else."],
  },
  {
    version: "0.29.1",
    date: "2026-09-20",
    title: "Folded groups on one line",
    changes: ["A folded group collapses to a single line."],
  },
  {
    version: "0.29.0",
    date: "2026-09-20",
    title: "Folded group summaries",
    changes: ["A folded group still shows a summary for every column."],
  },
  {
    version: "0.28.1",
    date: "2026-09-20",
    title: "Portal theming",
    changes: ["The portal follows the app's light or dark theme, with all of its own colours."],
  },
  {
    version: "0.28.0",
    date: "2026-09-20",
    title: "Two ways into the portal",
    changes: ["Booking and browsing the portal are shown as two clearly separate entry points."],
  },
  {
    version: "0.27.0",
    date: "2026-09-20",
    title: "Archived tasks in search",
    changes: ["An archived task is found where it lives, and is marked as archived."],
  },
  {
    version: "0.26.0",
    date: "2026-09-20",
    title: "Undo",
    changes: ["One standing offer to undo the last thing you did."],
  },
  {
    version: "0.25.0",
    date: "2026-09-20",
    title: "Grid and kanban on phones",
    changes: ["The card grid and kanban views fit a phone screen."],
  },
  {
    version: "0.24.0",
    date: "2026-09-20",
    title: "Boards on phones",
    changes: ["Boards work one-handed: card list, quick status, priority and date sheets, and a floating New item button."],
  },
  {
    version: "0.23.0",
    date: "2026-09-20",
    title: "Automations that listen for words",
    changes: ["Rules can trigger on words in an update.", "Subitems are kept out of actions that do not apply to them."],
  },
  {
    version: "0.22.0",
    date: "2026-09-20",
    title: "More triggers and actions",
    changes: ["Eighteen triggers and twenty-three actions, written in one panel."],
  },
  {
    version: "0.21.0",
    date: "2026-09-20",
    title: "Automations page",
    changes: [
      "A workspace Automations page with recipes, every rule and what they have done.",
      "Quick runs: a group of actions you point at tasks and fire by hand.",
      "Automations fire within a second, and a running rule is marked on the board.",
      "A heartbeat shows when the automation runner has stopped.",
    ],
  },
  {
    version: "0.20.0",
    date: "2026-09-20",
    title: "Tickets, pop-up tasks and automations",
    changes: [
      "Every task gets a ticket number, like CP_014, with a prefix set in Settings.",
      "Pop-up mode opens a task over the board, and two tasks can be open at once.",
      "Board automations: a rule watches for something and acts on it, even with nobody signed in.",
      "Loading placeholders for My Work, Inbox, Activity and the Dashboard.",
    ],
  },
  {
    version: "0.19.0",
    date: "2026-09-13",
    title: "Columns, links and live updates",
    changes: [
      "A Dropdown column, and a column type picker split into board fields and workspace fields.",
      "Column roles: a board says which column does which job.",
      "Linked tasks share their assets, and column pairs can be matched by hand.",
      "The task panel shows every column as a draggable row, with per-column menus.",
      "Changes appear live everywhere, not only on boards.",
    ],
  },
  {
    version: "0.18.0",
    date: "2026-09-12",
    title: "Rich-text brief and My Work",
    changes: ["The booking brief is one rich-text document, with branching questions.", "A reworked My Work page with filters.", "The portal shows its work as a board."],
  },
  {
    version: "0.17.0",
    date: "2026-09-12",
    title: "Booking editor upgrades",
    changes: ["Saved blocks, choice chips and a preview in the booking form editor.", "Portal settings can group the work shown."],
  },
  {
    version: "0.16.0",
    date: "2026-09-12",
    title: "Four-step booking",
    changes: ["Booking is a four-step wizard, driven by service types.", "The editor saves a draft; publishing is a separate step.", "A built-in guide in Settings."],
  },
  {
    version: "0.15.0",
    date: "2026-09-11",
    title: "One portal link",
    changes: ["One portal link per workspace, with a department selector."],
  },
  {
    version: "0.14.0",
    date: "2026-09-11",
    title: "Archive and workload",
    changes: ["An Archive page to find and restore archived tasks.", "A workload section on the Dashboard, and a treemap of the asset mix.", "The booking form remembers past answers."],
  },
  {
    version: "0.13.0",
    date: "2026-09-11",
    title: "Workload by department",
    changes: ["A person's workload is split by department.", "The version shows on the sign-in screens."],
  },
  {
    version: "0.12.1",
    date: "2026-09-10",
    title: "Lists carry their values",
    changes: ["Workspace lists carry their values, and renaming an entry updates the work that uses it."],
  },
  {
    version: "0.11.0",
    date: "2026-09-10",
    title: "Effort",
    changes: ["Asset rates turn deliverables into hours, and the Dashboard can report in effort."],
  },
  {
    version: "0.10.0",
    date: "2026-09-10",
    title: "Portal and Dashboard views",
    changes: [
      "The portal: a link, a page, and booking without an account.",
      "The Dashboard gets three views and a public share link.",
      "A mobile layout, ID search, and only the rows in view are drawn.",
      "Share a single task, and a people page showing what someone is carrying.",
    ],
  },
  {
    version: "0.9.0",
    date: "2026-09-08",
    title: "Dashboard",
    changes: ["A workspace Dashboard: output this year, who is carrying it, and what needs attention."],
  },
  {
    version: "0.8.0",
    date: "2026-09-08",
    title: "Board sharing",
    changes: ["Share a board with a read-only link.", "Tasks get a reference number."],
  },
  {
    version: "0.7.0",
    date: "2026-09-08",
    title: "Booking form editor",
    changes: ["The team shapes its own booking form.", "Work under way shows how far its deliverables have got."],
  },
  {
    version: "0.6.0",
    date: "2026-09-07",
    title: "Asset lines and branding",
    changes: ["Asset lines tick off, take several people, and open one at a time.", "The real Streamline logo, and About in a dialog."],
  },
  {
    version: "0.5.0",
    date: "2026-09-07",
    title: "Faster in production",
    changes: ["The app now runs next to its database in Singapore, so pages load faster."],
  },
  {
    version: "0.4.0",
    date: "2026-09-07",
    title: "Assets on every task",
    changes: ["Asset lines per task, with an Assets tab and an Assets recap column.", "A faster booking form."],
  },
  {
    version: "0.3.1",
    date: "2026-09-07",
    title: "Reliability fixes",
    changes: ["Fixed a status mix-up when creating tasks, and allocation subitems."],
  },
  {
    version: "0.3.0",
    date: "2026-09-07",
    title: "Covers and sizes",
    changes: ["Update badges, task covers and T-shirt sizes.", "Status labels follow linked tasks.", "A new sign-in screen."],
  },
  {
    version: "0.2.0",
    date: "2026-09-06",
    title: "Updates, trackers and profiles",
    changes: [
      "Formatted updates with mentions, notifications and OS toasts.",
      "Profiles, direct messages and avatars.",
      "Trackers with views, summaries, fill-down and Excel export.",
      "The app notices when a new version is live.",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-09-04",
    title: "First release",
    changes: ["Boards, groups, columns and views for the team's work."],
  },
];

/** Negative when `a` is older than `b`. Compares dotted numbers, so 0.10.0 is after 0.9.0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * The entries a page on `since` has not seen, newest first. When nothing is
 * newer (the same version, rebuilt), the latest entry is what there is to say.
 */
export function changesSince(since: string, entries: readonly ChangelogEntry[] = CHANGELOG): ChangelogEntry[] {
  const newer = entries.filter((entry) => compareVersions(entry.version, since) > 0);
  return newer.length > 0 ? newer : entries.slice(0, 1);
}
