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
    version: "0.52.1",
    date: "2026-09-26",
    title: "Status in the task panel",
    changes: ["In the task panel the status is centred with the other values, and wide enough to read at a glance."],
  },
  {
    version: "0.52.0",
    date: "2026-09-26",
    title: "Report a bug",
    changes: ["Report a bug from your menu, or from About: say what happened, pick a category, and paste, drop or upload up to three screenshots. Each report becomes a task on the App development board."],
  },
  {
    version: "0.51.1",
    date: "2026-09-26",
    title: "Publishing the booking form",
    changes: ["Once a booking form with a new service or question is published, the editor stops saying a draft is waiting and no longer offers to publish it again."],
  },
  {
    version: "0.51.0",
    date: "2026-09-26",
    title: "Notifications from the start",
    changes: ["In a browser that has not been asked yet, Home offers to turn notifications on. Allowing them also switches on your notification setting."],
  },
  {
    version: "0.50.1",
    date: "2026-09-26",
    title: "Board search",
    changes: ["Searching a board for a letter or two, or for punctuation alone, no longer lists every task with a ticket."],
  },
  {
    version: "0.50.0",
    date: "2026-09-26",
    title: "Streamline on a phone",
    changes: [
      "Dialogs rise from the bottom of a phone's screen, and search opens full screen with Cancel.",
      "My Work on a phone has a search box and a Filters sheet with the same filters as on a desktop.",
      "Settings on a phone is a list: tap a section to open it, and Settings to go back.",
      "Task cards are calmer: the name, the status as a pill, the due date and the board. The task panel shows the status as a pill too.",
      "On a phone, each task on a board is its own card, edged in its group's colour.",
      "On a phone, Browse has New board, and the form editor keeps Save and Publish above the form.",
      "Streamline can be added to a home screen, where it opens full screen with its own icon.",
      "A bar says when the connection drops. Changes save when it returns.",
      "On an iPhone or iPad, the notification setting says to add Streamline to the Home Screen first.",
      "Menus and pickers stay inside the screen, and switches, chips and small buttons are easier to hit.",
      "A restore or wipe keeps a phone's screen on until it has finished.",
      "Your sidebar width, open teams and panel sizes are kept across reloads again.",
      "A What's new card after an update, off for now (Settings → Appearance).",
    ],
  },
  {
    version: "0.49.1",
    date: "2026-09-26",
    title: "Portal booking for every department",
    changes: [
      "Booking from the portal works for a department that has no requests yet, and so after a wipe.",
      "A public booking no longer renames anyone already in the member list. The name typed is used only for someone new.",
      "Typing a letter or two in search finds names again, not every ticket.",
      "“When a column is cleared” fires for statuses, dates and numbers too.",
      "Recurring automations, the Weekly review among them, fire on schedule again.",
      "Changing the ticket prefix keeps four-digit numbers whole.",
      "Editing an update can no longer move it to another task.",
      "A board made from a template no longer wakes its own automations for every task it starts with.",
      "Kanban by person keeps tasks whose owner is pending or has left.",
      "On a phone, Today and Tomorrow in the date sheet are your own days.",
      "On a touch screen, the buttons that appear on hover are always there: editing, deleting and reacting to updates, column and group menus, cover and archive actions.",
      "Long dialogs scroll inside the screen instead of running off it.",
      "Link cells open web and email addresses only. Countdown takes “in 45m”.",
      "A booking picked up from a draft keeps each deliverable's type.",
      "The in-app guide covers what the app does today.",
    ],
  },
  {
    version: "0.49.0",
    date: "2026-09-26",
    title: "Profile cards on hover",
    changes: [
      "Hover a face or name to see a compact profile card.",
      "People added by a booking show in Requester cells and in search, marked Pending onboarding.",
      "The booking form checks an email as you type and says when it has been used before.",
      "Signed in and booking for someone else, the email is checked too, and they become the requester.",
    ],
  },
  {
    version: "0.48.1",
    date: "2026-09-26",
    title: "Booking form fills in your name",
    changes: [
      "The booking form fills in the name for an email the workspace knows, and keeps a name you correct afterwards.",
    ],
  },
  {
    version: "0.48.0",
    date: "2026-09-25",
    title: "Requester, as a person",
    changes: [
      "Every board has a Requester column: who asked for the work, shown as an avatar like any people column.",
      "A booking fills it in. Signed in, it is you. Through a public link, a known email is that person and a new one becomes a pending member, with a join link an admin can pass on.",
      "The booking form fills in the name for an email the workspace knows. You can still change it, and the name you book with is saved.",
    ],
  },
  {
    version: "0.47.5",
    date: "2026-09-25",
    title: "A tidier task journey",
    changes: [
      "Deliverables ticked off one after another show as one step, naming them, instead of a card each.",
      "Deliverables that came with a booking now count, so the journey says 5 of 8 delivered rather than 1 of 1.",
      "Time in each status is one bar with a segment per status. A segment too thin to label points to its label with a line.",
    ],
  },
  {
    version: "0.47.4",
    date: "2026-09-25",
    title: "Tidier Task Allocation",
    changes: [
      "Task Allocation drops Requester department, Requested team and Allocated to. Department holds the department, and Requester holds the name of the person who booked.",
      "Columns you remove from Task Allocation stay removed. Only the special columns every board has are put back.",
    ],
  },
  {
    version: "0.47.3",
    date: "2026-09-25",
    title: "No more Storage settings",
    changes: [
      "Settings no longer has a Storage section. Snapshots and the Danger zone cover what it was for.",
    ],
  },
  {
    version: "0.47.2",
    date: "2026-09-25",
    title: "Archived items, away from Archive board",
    changes: [
      "In a board's menu, View archived items now sits with Open and Open as Kanban, well away from Archive board, so one is not clicked for the other.",
    ],
  },
  {
    version: "0.47.1",
    date: "2026-09-25",
    title: "Templates in a dropdown, and a clearer update card",
    changes: [
      "Create board picks its template from a dropdown, with each template's description and what it holds. Blank is the one built in; the rest are templates you saved.",
      "The new-version card is bigger, sits clear of the corner and has a softer shadow.",
      "Wiping all board data now removes every tracker too.",
    ],
  },
  {
    version: "0.47.0",
    date: "2026-09-25",
    title: "Board templates",
    changes: [
      "Save any board's layout as a template, from its menu or from Create board. Choose what comes with it: groups, column settings, widths and hidden columns, automations, task names, and its colour and icon.",
      "Create board offers your saved templates beside the built-in ones. Whoever saved a template, or an admin, can delete it.",
    ],
  },
  {
    version: "0.46.2",
    date: "2026-09-25",
    title: "Start tickets again after a wipe",
    changes: [
      "Wiping all board data can also start the ticket numbers again, so the next task is number 001.",
    ],
  },
  {
    version: "0.46.1",
    date: "2026-09-25",
    title: "A dashboard that says when there is nothing yet",
    changes: [
      "Dashboard panels with no data say so, instead of showing a flat line or an empty chart. That includes the headline figures, tasks by month and who is carrying what.",
      "A change against a very small number, fewer than five, shows the difference but no percentage.",
      "Chart scales count in whole numbers, so a nearly empty chart no longer reads 0, 1, 1, 1.",
    ],
  },
  {
    version: "0.46.0",
    date: "2026-09-25",
    title: "Danger zone, and safer restores",
    changes: [
      "Settings → Danger zone can wipe all board data for a clean start: every board and task goes, while settings, lists, teams and people stay. It needs your password and takes a snapshot first.",
      "Restoring a snapshot asks you to type RESTORE, and covers the app until it is done so nothing else can happen in the meantime.",
      "Only admins and owners can restore, wipe or manage snapshots.",
    ],
  },
  {
    version: "0.45.2",
    date: "2026-09-25",
    title: "Straight into the app",
    changes: [
      "Opening the app while signed in shows the loading screen and then your workspace, without the sign-in page on the way.",
    ],
  },
  {
    version: "0.45.1",
    date: "2026-09-25",
    title: "Shorter column notes",
    changes: [
      "The notes on the special column types in the column picker are one short line each.",
    ],
  },
  {
    version: "0.45.0",
    date: "2026-09-25",
    title: "A quieter update notice",
    changes: [
      "A new version is announced in a small card in the corner, not in the middle of the screen. Open What's new in the card to read the changelog.",
      "The column type picker says Already added for a special column the board has, and Removed from this board for one it took off.",
    ],
  },
  {
    version: "0.44.1",
    date: "2026-09-25",
    title: "Clearer wording when removing a column",
    changes: [
      "Removing a special column now says: Nothing is lost. Add it back any time and its values return.",
    ],
  },
  {
    version: "0.44.0",
    date: "2026-09-25",
    title: "Special columns on every board",
    changes: [
      "Every board has Status, PIC, Due date, Timeline, Priority, Department, Size, Assets recap and Brief. Boards that were missing some have them now, empty until filled.",
      "Deleting a special column only removes it from the board. What the tasks had in it is kept, and comes back when you add the column again. Plain columns still delete for good.",
      "Allocating or linking a task always carries its brief, due date, department and the rest, so the brief no longer lands in the description.",
    ],
  },
  {
    version: "0.43.1",
    date: "2026-09-25",
    title: "Selecting text while renaming",
    changes: [
      "Dragging across a name you are renaming selects the text instead of picking up the task. The same goes for column and group names.",
    ],
  },
  {
    version: "0.43.0",
    date: "2026-09-25",
    title: "Departments come only from the list",
    changes: [
      "Every booking link, public, portal or in the app, files the request under a department from Settings → Departments, and fills the task's Department column with it. A department that is not on the list is refused.",
      "No other word can be saved as a task's department, from any board, automation or link.",
      "Removing a department moves its tasks to another one or clears them. It no longer stays on them.",
      "Automations that set a Department pick it from the list.",
    ],
  },
  {
    version: "0.42.3",
    date: "2026-09-25",
    title: "One avatar per person on cards",
    changes: [
      "A person in two people columns on the same item shows once on its phone card, not twice.",
    ],
  },
  {
    version: "0.42.2",
    date: "2026-09-25",
    title: "Column types explain both groups",
    changes: [
      "The column type picker says what each group is: the board's own fields, as many as you like, and the special ones, one each, read by the dashboard and portal.",
    ],
  },
  {
    version: "0.42.1",
    date: "2026-09-25",
    title: "One Due date per board",
    changes: [
      "A board holds one Due date column, like every other special column. For another day, such as a start or briefed-on date, use a plain Date column.",
    ],
  },
  {
    version: "0.42.0",
    date: "2026-09-25",
    title: "Countdown column",
    changes: [
      "New Countdown column: set an end by typing a time from now (45m, 3d 4h, 2mo), a quick pick, or a day and time. It shows the time left in the unit that suits it, from minutes to months.",
      "Format sets the style (3d 4h or 3 days 4 hours), one or two units, what it says once the time is up, and when it turns amber.",
    ],
  },
  {
    version: "0.41.12",
    date: "2026-09-25",
    title: "A leaner Task journey",
    changes: [
      "Task journey drops its row of four figures (in the queue, with the team, deliverables, milestones). It now opens on the time in each status, then the timeline.",
    ],
  },
  {
    version: "0.41.11",
    date: "2026-09-25",
    title: "Fold an update from its header",
    changes: [
      "Clicking an update's header folds it. The author's name and the edit and delete buttons still do what they did.",
    ],
  },
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

/**
 * The releases a browser has not run before, for the "App updated" notice:
 * after `seen`, up to and including `current`, newest first. Empty when the
 * version has not moved on, or has gone back, so the notice stays away.
 */
export function releasesAfter(seen: string, current: string, entries: readonly ChangelogEntry[] = CHANGELOG): ChangelogEntry[] {
  if (compareVersions(current, seen) <= 0) return [];
  return entries.filter((entry) => compareVersions(entry.version, seen) > 0 && compareVersions(entry.version, current) <= 0);
}

/** The release before `version`, or null for the first. */
export function releaseBefore(version: string, entries: readonly ChangelogEntry[] = CHANGELOG): string | null {
  return entries.find((entry) => compareVersions(entry.version, version) < 0)?.version ?? null;
}
