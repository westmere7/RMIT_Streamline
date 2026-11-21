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
    version: "0.137.3",
    date: "2026-11-21",
    title: "Teams set apart in the sidebar",
    changes: ["Each team in the sidebar sits in its own faint, rounded box, so it is clear where one team ends and the next begins."],
  },
  {
    version: "0.137.2",
    date: "2026-11-21",
    title: "Sizes and roles, tidied",
    changes: ["Settings → Sizes keeps just each size's span and heading.", "Settings → Roles says what members and guests can do now: boards per team or seat, their own teams, and allocating when added."],
  },
  {
    version: "0.137.1",
    date: "2026-11-21",
    title: "Quieter team list",
    changes: ["A team that hides its trackers or docs no longer adds a \"more on the team page\" line to the sidebar."],
  },
  {
    version: "0.137.0",
    date: "2026-11-21",
    title: "Choose what a team shows in the sidebar",
    changes: ["Each team's menu has Show in sidebar: switch its trackers or docs off to keep the list short. Boards always show, the one you have open stays listed, and the team page still lists everything."],
  },
  {
    version: "0.136.6",
    date: "2026-11-21",
    title: "Person cards in more places",
    changes: ["Hovering a face or name now shows the person's card almost anywhere: update authors, @mentions, who made a task, the inbox, lanes, the dashboard, board and team members, assets and tracker sheets. It stays shut while a picker or menu is open."],
  },
  {
    version: "0.136.5",
    date: "2026-11-21",
    title: "Unlink asks first",
    changes: ["Unlinking a sheet from its task now asks first, and keeps the sheet's assets on the task as its own unless you switch that off."],
  },
  {
    version: "0.136.4",
    date: "2026-11-21",
    title: "A handier person card",
    changes: ["The card that opens over someone's face has a close button, their name opens their profile, each team opens its page, and Message starts a conversation with them."],
  },
  {
    version: "0.136.3",
    date: "2026-11-21",
    title: "The task's PIC and due, one click",
    changes: ["In an asset's details, the In charge and Due pickers offer the task's own PIC and due date at the top."],
  },
  {
    version: "0.136.2",
    date: "2026-11-21",
    title: "Team trackers first",
    changes: ["Use a tracker sheet has a Team trackers only switch, on by default: it lists the trackers of the task's own team. Switch it off to see every tracker."],
  },
  {
    version: "0.136.1",
    date: "2026-11-21",
    title: "Profiles update live",
    changes: ["A person's page keeps its figures current as work changes, with the same Live dot as the dashboard: amber while it reads again, Not updating if a refresh fails."],
  },
  {
    version: "0.136.0",
    date: "2026-11-21",
    title: "Choose which assets move into the sheet",
    changes: [
      "Move into sheet lists every asset the task shows, its linked task's included, each with a tick box. Untick what should stay. A linked task's asset becomes this task's and still shows on both.",
      "Linking a sheet from a task's Assets tab, or making a new tracker there, opens that list straight away. A new tracker made from a task is always linked to it.",
    ],
  },
  {
    version: "0.135.2",
    date: "2026-11-21",
    title: "Only sheets you can use",
    changes: ["Use a tracker sheet lists only the sheets a task can take. Sheets already holding another task's assets, and trackers with none left, no longer show."],
  },
  {
    version: "0.135.1",
    date: "2026-11-21",
    title: "Closed booking page, your heading and formatting",
    changes: ["The page a closed booking link shows is now a full page with your own heading, and the message takes formatting: bold, lists, links, colour. Edit both in a pop-up from the booking form's settings."],
  },
  {
    version: "0.135.0",
    date: "2026-11-21",
    title: "A message when booking is closed",
    changes: ["When the booking form isn't taking requests, or the portal is closed, the booking link now says so instead of showing a form that can't be sent. Write your own message in the booking form's settings on Portal and Booking, under When not taking requests."],
  },
  {
    version: "0.134.1",
    date: "2026-11-21",
    title: "The guide catches up",
    changes: ["Settings → Guide now covers team access, join-link approval, routing bookings by work type, booking PDFs and past forms, tracker sheets as a task's assets (Mark rows, columns that don't fit, Move into sheet), your profile and password, and who is online."],
  },
  {
    version: "0.134.0",
    date: "2026-11-21",
    title: "Move a task's assets into its sheet",
    changes: [
      "A task with a tracker sheet and assets of its own gets Move into sheet: they become rows below the sheet's and keep their dates. It says first which columns it adds and what won't stay exactly as it is, and won't start while a column can't hold what they have.",
      "Moving assets in while linking a sheet now keeps them the same way, and no longer drops people, extra links or notes it couldn't place.",
    ],
  },
  {
    version: "0.133.1",
    date: "2026-11-20",
    title: "When a column doesn't fit",
    changes: ["Choosing a column whose data doesn't fit a part (from the settings, the sheet or a column's menu) now asks what to do: clear the cells it can't read (and change the column's type when that can't hold the part), choose another column, make a new one, or cancel. It shows a few of the values and warns when the column gives another part too."],
  },
  {
    version: "0.133.0",
    date: "2026-11-20",
    title: "Mark rows by hand",
    changes: ["Task assets settings: Mark rows opens the whole sheet. Select rows (shift-click for a range) and make them assets, leave them out or make them bands; marks beat what was spotted and can bring back a row left out before. Only a row with one value can become a band, so nothing in the sheet is lost."],
  },
  {
    version: "0.132.5",
    date: "2026-11-20",
    title: "Columns with the wrong kind of data",
    changes: [
      "Task assets read dates typed as text (14/03/2026, 14 March 2026) and Excel date numbers, and counts like \"3 pcs\" or \"x3\".",
      "Picking a column on the sheet marks the cells the part can't read, and says so when the column's type can't hold it (a Checkbox column as the due date).",
      "A change made on the task is never written into a column that can't hold it; it says which column to fix instead.",
    ],
  },
  {
    version: "0.132.4",
    date: "2026-11-20",
    title: "Column box",
    changes: ["Column picker pop-up: the column under the pointer is boxed top to bottom."],
  },
  {
    version: "0.132.3",
    date: "2026-11-20",
    title: "Pick columns on the sheet",
    changes: ["Task assets settings: with Pick columns on the sheet on, each column picker opens the whole sheet in a pop-up. Point at a column to see it, click to choose, then Use it or Cancel."],
  },
  {
    version: "0.132.2",
    date: "2026-11-20",
    title: "Sheet preview on request",
    changes: ["Task assets settings open on the column pickers alone; Show the sheet brings the live preview up, and the choice is remembered in this browser."],
  },
  {
    version: "0.132.1",
    date: "2026-11-20",
    title: "Sheet preview stays in view",
    changes: ["Task assets settings: the sheet preview stays at the top while the settings scroll, column lists open below it rather than over it, and a wide sheet scrolls inside its box instead of widening the dialog."],
  },
  {
    version: "0.132.0",
    date: "2026-11-20",
    title: "See the sheet while matching columns",
    changes: [
      "Task assets settings show the sheet itself, each column tagged with the part it plays; pointing at a column in a dropdown or chip lights it up in the sheet.",
      "Rows that are not assets are spotted: a repeated header, a section or channel label typed as a row, a total. Sections become bands; headers and totals are left out of the assets and stay in the sheet. One switch turns this off.",
    ],
  },
  {
    version: "0.131.0",
    date: "2026-11-20",
    title: "Fresh sheets set themselves up",
    changes: ["Using an untouched sheet (nothing typed, columns still Column 1, Column 2…) for a task gives it the asset columns (Asset, Type, Quantity, Spec, PIC, Due date, Done) instead of asking you to match them. A sheet with anything in it keeps its columns."],
  },
  {
    version: "0.130.0",
    date: "2026-11-20",
    title: "Move a task's assets into a sheet",
    changes: [
      "New tracker for a task, or using an existing sheet for one, offers to move the task's own assets into it (on by default). They go in below the sheet's rows, never over them: loose assets above its first band, a block under the band of the same name or a new one.",
      "A column the assets need and the sheet lacks (due date, PIC, done, link, spec…) is added first, and new types join the Type dropdown, so nothing is lost. The task's old assets go only once the sheet's are in.",
    ],
  },
  {
    version: "0.129.2",
    date: "2026-11-20",
    title: "Version in the menu",
    changes: ["Your account menu shows the version beside About."],
  },
  {
    version: "0.129.1",
    date: "2026-11-20",
    title: "Tracker tidy-ups",
    changes: [
      "A checkbox column's Count empty counts unticked boxes; typing “done” ticks a box.",
      "Number columns read decimal numbers only (“0x10” stays text); a cell of spaces is empty.",
      "Column widths stay between 60 and 1200; a dropdown drops the colours of options it no longer has; a new column keeps the format and footer it was given.",
      "A quantity typed on a task is rounded in the sheet too; moving a sheet's asset line on the task says to move the row in the sheet.",
    ],
  },
  {
    version: "0.129.0",
    date: "2026-11-20",
    title: "Sturdier trackers",
    changes: [
      "Typing fast in a tracker (a value, Tab, the next value) no longer drops keys.",
      "Changing a column's type turns its values into the new type where they read as it, so a Number column formats them; a format or footer the new type has not got is dropped.",
      "Dates typed or pasted are read on the day written (no more a day early in Melbourne or Vietnam), impossible dates and dates without a year stay as typed, and an Excel date pasted as a number is read as a date.",
      "A row made into a band takes its label from the leftmost filled cell; new columns never repeat a name.",
      "Asset sheets: an impossible due date, a huge quantity or a very long band name no longer stops the task's assets updating; an email with a + finds the right person; lines are no longer rewritten on every save.",
    ],
  },
  {
    version: "0.128.0",
    date: "2026-11-20",
    title: "Keep a deleted tracker's assets",
    changes: [
      "Deleting a tracker, or one of its sheets, that holds a task's assets asks whether to keep them on the task. Kept (the default), they stay as the task's own assets.",
      "A sheet stays linked to its task by id, so trackers and tabs can be renamed freely.",
      "Renaming a tracker column: the name box is readable in dark mode.",
    ],
  },
  {
    version: "0.127.1",
    date: "2026-11-20",
    title: "Name the new tracker",
    changes: ["New tracker for this task asks for a name first, filled in with the task's."],
  },
  {
    version: "0.127.0",
    date: "2026-11-20",
    title: "New tracker from a task",
    changes: ["Use a tracker sheet: New tracker for this task makes a tracker named after the task, on its board's team, with a sheet already laid out for assets (Asset, Type, Quantity, Spec, PIC, Due date, Done), then links it."],
  },
  {
    version: "0.126.0",
    date: "2026-11-20",
    title: "Your own form header",
    changes: ["Booking form editor, Essentials: the form card's header (its name and the line under it) can be reworded; who is signed in is still added by the page. Blank keeps the workspace's or portal's name and “Task booking”."],
  },
  {
    version: "0.125.3",
    date: "2026-11-20",
    title: "Clearer booking page settings",
    changes: ["Booking form settings: Headline and Intro are now Left panel heading and Left panel text, the words on the dark panel beside the portal's booking form."],
  },
  {
    version: "0.125.2",
    date: "2026-11-20",
    title: "Tidier board members",
    changes: ["The board header's members sit side by side with a small gap instead of piled over each other."],
  },
  {
    version: "0.125.1",
    date: "2026-11-20",
    title: "Brand panel as it was",
    changes: ["Sign-in, booking, portal and join pages keep their glows and grid; the pixel watermark tried in 0.125.0 is gone."],
  },
  {
    version: "0.125.0",
    date: "2026-11-20",
    title: "Tidy past forms",
    changes: [
      "Past forms: each one's menu saves it as a template or deletes it; Clean up deletes every past form but the live one. The live form's entry is never deleted.",
      "Brief editor: pointing at the plus between two blocks opens the gap, showing where the new block will go.",
      "Booking pages: when the live form was published, in small print under the team's name.",
    ],
  },
  {
    version: "0.124.1",
    date: "2026-11-20",
    title: "Compact past bookings, PDF button wording",
    changes: [
      "Booking form, first step: “Book something like last time?” is one line with a dropdown; each entry shows its name, ticket, date and deliverables.",
      "The Download PDF button can be renamed in the editor, like the submit button. Only the wording changes.",
    ],
  },
  {
    version: "0.124.0",
    date: "2026-11-20",
    title: "Past bookings on the ticket",
    changes: [
      "Booking form editor, Confirm step: switches for the ticket's Download PDF button (on) and a list of the other bookings made with the same email (off). The list shows ticket, name, date and status; a name opens the task in the portal (while the portal is on), a ticket copies. The editor and Preview the form show both, with example rows.",
      "Templates: Save as new template at the foot of the list.",
      "Saved blocks show their whole name on hover.",
    ],
  },
  {
    version: "0.123.2",
    date: "2026-11-20",
    title: "No hover outlines, wrapping text",
    changes: [
      "Pointing at cards, chips, tiles and rows no longer draws an outline; the fill still changes. The booking editor's blocks keep theirs.",
      "In the booking form editor the line under each fixed question (task name, needed by, urgency, who is asking) can be edited.",
      "The editor's text boxes wrap long text and grow to fit it. Kind of work is now Service.",
      "Switching step in the editor opens the new step at its top.",
    ],
  },
  {
    version: "0.123.1",
    date: "2026-11-20",
    title: "Calmer step tabs",
    changes: ["In the booking form editor the open step is filled, like anything picked, rather than marked with a red number."],
  },
  {
    version: "0.123.0",
    date: "2026-11-20",
    title: "Approval for the join link is a choice",
    changes: ["Under the join link in Add member, admins choose whether each sign-up waits for their approval or gets in as soon as they set a password. It stays on until switched off."],
  },
  {
    version: "0.122.0",
    date: "2026-11-20",
    title: "Any board for a service",
    changes: [
      "Bookings go to lists Task Allocation and Auto-allocation first, then every board by team, each team's booking board marked.",
      "Picking a team's booking board follows the team; picking any other board sends that service's bookings there directly, with a note when its team nominates a different board.",
    ],
  },
  {
    version: "0.121.4",
    date: "2026-11-20",
    title: "Allocation on the published form",
    changes: ["The published form card says where its services send bookings: how many auto-allocate, go to a team, or go to Task Allocation; hover it for each service."],
  },
  {
    version: "0.121.3",
    date: "2026-11-20",
    title: "Auto-allocation at a glance",
    changes: [
      "With Auto-allocation on, the Bookings go to picker shows its rule (or how many there are, and where the rest go), every rule on hover; the picker spans the box under its title.",
    ],
  },
  {
    version: "0.121.2",
    date: "2026-11-20",
    title: "Exact work type rules",
    changes: [
      "Each Auto-allocation rule matches either work types that include any of its picks, or exactly its picks and nothing else.",
    ],
  },
  {
    version: "0.121.1",
    date: "2026-11-20",
    title: "Auto-allocation",
    changes: [
      "Bookings go to is one choice at the bottom of each service: Task Allocation, a team's board, or Auto-allocation, which picks the board from the work types chosen.",
      "Auto-allocation's rules set where everything else goes too: Task Allocation, a team's board or any board. Choosing a team again switches them off and keeps them.",
      "The question count under each service is gone.",
    ],
  },
  {
    version: "0.121.0",
    date: "2026-11-20",
    title: "Bookings routed by work type",
    changes: [
      "In the booking form editor, the button under Bookings go to opens where a service's bookings land: switch on picking the board by work type, add rules (first match wins), and choose where everything else goes.",
      "The form tells the requester where their booking will go as they pick work types, and a rule's board that has since gone falls back to the team's own board.",
    ],
  },
  {
    version: "0.120.1",
    date: "2026-11-20",
    title: "Clearer steps in the form editor",
    changes: [
      "The four steps of the booking form editor run across the full width, numbered, the open one raised.",
      "On step two, a large Brief for picker chooses the service; its list adds a service and removes any, asking first.",
    ],
  },
  {
    version: "0.120.0",
    date: "2026-11-20",
    title: "Past forms",
    changes: [
      "Past forms, beside Undo changes in the booking form editor, lists every form published here, newest first, with the live one marked; any of them can be published again.",
      "Save draft is gone: keep work as a template, or publish it. Saving a template selects it, and a new reload button beside it puts it back, dropping changes since.",
      "The publish button reads Publish current form, and Already published when there is nothing new to publish; the note above it is gone.",
    ],
  },
  {
    version: "0.119.0",
    date: "2026-11-20",
    title: "Booking as a PDF",
    changes: [
      "After booking, Download PDF saves the booking: the ticket, the details, the brief and the assets, headed by the RMIT and Streamline logos. Vietnamese names and words print as typed.",
      "The dashboard's PDF now carries the RMIT logo on its cover.",
    ],
  },
  {
    version: "0.118.1",
    date: "2026-11-19",
    title: "Allocators can allocate",
    changes: [
      "Someone added to Task Allocation can allocate a request to any team board they can see, without editing that board.",
      "Added to Task Allocation as an editor, they follow all of it from the start; they can turn any of it down from the board's bell.",
    ],
  },
  {
    version: "0.118.0",
    date: "2026-11-19",
    title: "More people can allocate",
    changes: [
      "Task Allocation opens to the people workspace admins add under its Members, so more than the admins can allocate. Only admins add them.",
      "Task Allocation has its own who can see and who can edit in its settings, starting at the people added. It no longer follows the Admin team.",
      "The Admin team takes workspace owners and admins only; someone made a member leaves it.",
    ],
  },
  {
    version: "0.117.4",
    date: "2026-11-19",
    title: "Where bookings land, shown right",
    changes: [
      "In the booking form editor, Bookings go to names the board a team picked for its bookings, with the team beside it.",
      "A booking's description no longer repeats what is already said elsewhere: the service (the brief opens with it), the asset lines and their types (the Assets tab), the email (the Requester's own) and, on a team's own board, the team. It keeps only what a board has no column for.",
      "A team's Bookings settings show where each answer goes, grouped: the board's columns, the brief, the Assets tab, and anything left for the description.",
    ],
  },
  {
    version: "0.117.3",
    date: "2026-11-19",
    title: "One work type, picked for you",
    changes: [
      "When a service on the booking form offers a single work type, it is picked already and stays picked.",
      "Picked chips on the booking form and in its editor share the picked service card's fill.",
    ],
  },
  {
    version: "0.117.2",
    date: "2026-11-19",
    title: "Quieter buttons and cards",
    changes: [
      "Block, Tracker and To-do on a task's Assets tab are icons, each with a tooltip.",
      "The picked service on the booking form is filled rather than outlined, in the form and its editor.",
      "Who published the booking form shows as their name, underlined, without the avatar.",
    ],
  },
  {
    version: "0.117.1",
    date: "2026-11-19",
    title: "Tracker beside Block",
    changes: [
      "On a task's Assets tab, Tracker sits beside Block to keep the assets in a tracker sheet; the dashed prompt above the list is gone.",
    ],
  },
  {
    version: "0.117.0",
    date: "2026-11-19",
    title: "Recently visited tasks",
    changes: [
      "Home lists the tasks you opened most recently under Recently visited, with their board and when you looked.",
    ],
  },
  {
    version: "0.116.5",
    date: "2026-11-19",
    title: "Home, rearranged",
    changes: [
      "Home leads with Portal and Booking as two cards (open, copy), then Favourites as board cards, Recently visited and My work.",
      "The right side of Home is Recent activity alone: it stays in view and scrolls on its own, with more of it. Your teams is gone from Home.",
    ],
  },
  {
    version: "0.116.4",
    date: "2026-11-19",
    title: "About in the account menu",
    changes: [
      "About is in the account menu, under Report a bug.",
    ],
  },
  {
    version: "0.116.3",
    date: "2026-11-19",
    title: "Colour and icon in full",
    changes: [
      "Team and board settings show the full colour and icon pickers on their General tab, with the look beside the name.",
    ],
  },
  {
    version: "0.116.2",
    date: "2026-11-19",
    title: "Team settings keep your changes",
    changes: [
      "Team settings opened from the sidebar or Settings showed the team as it was when opened, so a change seemed not to stick. They now always show it as it is.",
    ],
  },
  {
    version: "0.116.1",
    date: "2026-11-19",
    title: "Settings in tabs",
    changes: [
      "Team settings now open in tabs like Board settings: General, Access, Members, Bookings. Changes save as you make them; name and description with Save changes.",
      "Board settings has its own Access tab (who can see, who can edit, and the grid), and its colour and icon are one small picker beside the name.",
      "Creating a team asks only for its name, look and description; the rest is in its settings.",
    ],
  },
  {
    version: "0.116.0",
    date: "2026-11-19",
    title: "Who can see, who can edit",
    changes: [
      "Access is now two settings, \"Who can see\" and \"Who can edit\", with a grid showing what each group of people can do.",
      "Edit team sets them for all its boards: seen by everyone or only the team, edited by only the people added, the team's members, or everyone who can see. Admins only.",
      "Each board follows its team, or sets its own in Board settings → Access (including \"Only people added\", which was Private). Nobody's access changed.",
    ],
  },
  {
    version: "0.115.1",
    date: "2026-11-19",
    title: "Approved members get in",
    changes: [
      "Someone approved while on the waiting screen now goes straight into the workspace; they saw \"Workspace not found\" until they refreshed.",
      "\"Workspace not found\" also says the workspace may just not be open to you.",
    ],
  },
  {
    version: "0.115.0",
    date: "2026-11-19",
    title: "Approving new members",
    changes: [
      "People who join through the workspace join link now wait for an admin: they see a waiting screen until approved, admins get an inbox item, and Members shows them with Approve (Decline in the row menu). People an admin adds are let in as before.",
      "Edit team lists the team's members to add and remove, and its colour and icon are one small picker beside the name. The board access settings sit in the dialog without a box.",
      "Being added to a team shows its boards, trackers and docs at once, without a refresh.",
    ],
  },
  {
    version: "0.114.1",
    date: "2026-11-19",
    title: "Team access, follow-ups",
    changes: [
      "A team made team-only disappears for everyone outside it straight away, without a refresh.",
      "Someone added to a board of a team-only team still sees the team, holding just the boards they can open.",
      "A team, board, tracker or doc you can't open says \"You don't have access\" instead of \"not found\".",
    ],
  },
  {
    version: "0.114.0",
    date: "2026-11-19",
    title: "Teams decide board access",
    changes: [
      "Edit team sets who sees the team's boards (everyone in the workspace, or only the team) and whether its members can edit them. Admins only.",
      "A team kept to itself is hidden from everyone else, with its boards, trackers and docs.",
      "A team's board follows the team; its own setting is just Private. Team members who edit through the team show on the board as \"via <team>\".",
    ],
  },
  {
    version: "0.113.0",
    date: "2026-11-19",
    title: "Frame your photo",
    changes: [
      "Choosing a profile photo opens Adjust photo first: drag to place it, zoom, and turn it a quarter at a time. In Edit profile and when joining.",
    ],
  },
  {
    version: "0.112.1",
    date: "2026-11-19",
    title: "Names in the portal's activity",
    changes: [
      "The portal names the team's members, so a task's activity says who did what instead of \"Someone\". Names and avatars only.",
    ],
  },
  {
    version: "0.112.0",
    date: "2026-11-19",
    title: "Rich text descriptions",
    changes: [
      "A task's description takes rich text: headings, bold, lists, links and colour, with the formatting bar shown while the box is focused. Descriptions written before keep their line breaks.",
      "Portal and Booking: clicking a link card's blank space opens it in a new tab through a real link, so middle-click and Ctrl-click work too.",
      "The booking page's \"Back to our tasks\" reads \"Back to Portal\".",
      "The theme switch on portal, booking, shared and dashboard pages offers light and dark only; a page set to follow the device shows whichever that is.",
    ],
  },
  {
    version: "0.111.2",
    date: "2026-11-19",
    title: "Who published the form, with a face",
    changes: [
      "The published form's cards (Portal and Booking, and the editor) show who published it after the time, as their avatar and name; it opens their profile.",
    ],
  },
  {
    version: "0.111.1",
    date: "2026-11-19",
    title: "Form editor: outline on every step",
    changes: [
      "Every step of the form editor outlines the block under the pointer, fixed blocks included (Who is asking, the deliverables list, the recap cards). Blocks inside another still outline the one they sit in.",
      "\"Allow formatting\" is now \"Allow rich text formatting\".",
    ],
  },
  {
    version: "0.111.0",
    date: "2026-11-19",
    title: "Portal links on Home",
    changes: [
      "Home lists the Portal and the Booking form, to open or copy, with Manage going to Portal and Booking. Shown to admins and members, on the phone too.",
    ],
  },
  {
    version: "0.110.7",
    date: "2026-11-19",
    title: "Form editor: lighter frame",
    changes: [
      "Only top-level questions are outlined under the pointer; pointing at a follow-up outlines the question it belongs to.",
      "The editor's canvas has a soft shadow instead of an outline.",
    ],
  },
  {
    version: "0.110.6",
    date: "2026-11-19",
    title: "Form editor: outline, not fade",
    changes: ["In the booking form editor, the question under the pointer is outlined in the accent, and the others no longer fade."],
  },
  {
    version: "0.110.5",
    date: "2026-11-19",
    title: "Calmer form editor",
    changes: ["In the booking form editor, the questions around the one under the pointer fade back a little; one being typed in stays in full."],
  },
  {
    version: "0.110.4",
    date: "2026-11-19",
    title: "Who published the booking form",
    changes: ["The booking form's card in Portal and Booking and the editor's Published form card say who published it, from the next publish on."],
  },
  {
    version: "0.110.3",
    date: "2026-11-19",
    title: "Board header tidied",
    changes: [
      "Starred, Follow, Share and Automations share one look while on; Share is on while the board has a live link, Automations while a rule is switched on.",
      "Members and Invite sit together in a soft rounded group just before Activity, with no divider.",
    ],
  },
  {
    version: "0.110.2",
    date: "2026-11-19",
    title: "Plainer task panel edge",
    changes: ["The task panel loses the coloured outline round its top corners; the soft wash of the status colour across its header stays."],
  },
  {
    version: "0.110.1",
    date: "2026-11-19",
    title: "Board counts stay current",
    changes: ["The task count beside each board in the sidebar updates as tasks are added, allocated, archived or deleted, whoever does it."],
  },
  {
    version: "0.110.0",
    date: "2026-11-19",
    title: "Portal: filter by team",
    changes: [
      "The portal's top row holds three matching filters: department, team and how far back.",
      "Teams lists the teams whose boards hold the portal's work, with a count each; requests still waiting on Task Allocation show under All teams only.",
    ],
  },
  {
    version: "0.109.0",
    date: "2026-11-19",
    title: "Portal links for the whole team",
    changes: [
      "Members who are not admins see both portal links on Portal and Booking, to open and copy, with their settings listed and nothing to change.",
      "Members get Book a task there, and Back to the workspace on the booking form returns to it instead of looping back to the form.",
      "Weekly hours are saved in half hours.",
      "The online dot stays on top where pictures overlap.",
    ],
  },
  {
    version: "0.108.1",
    date: "2026-11-19",
    title: "Online dot on the picture's edge",
    changes: ["The online dot sits half on the picture at its bottom right, with a gap around it, and grows with larger pictures."],
  },
  {
    version: "0.108.0",
    date: "2026-11-19",
    title: "Who is online",
    changes: [
      "A green dot on someone's picture means they have Streamline open, wherever their picture appears.",
      "A tab left in the background for a minute stops counting as online.",
      "The Streamline logo in the sidebar goes to Home; About is in Settings.",
      "Changing who is in charge of an asset no longer reads \"to empty\" in the activity feed: it names who was put on or taken off.",
      "About says it was built by the RMIT marketing team.",
    ],
  },
  {
    version: "0.107.1",
    date: "2026-11-19",
    title: "RMIT logo on the shared dashboard",
    changes: ["The shared dashboard's header ends with RMIT's logo beside the theme and size control, like shared boards and tasks."],
  },
  {
    version: "0.107.0",
    date: "2026-11-19",
    title: "Theme and size on every visitor page",
    changes: [
      "The portal, both booking links, shared boards and tasks, and the shared dashboard all carry the same small control: light, dark or system, then − size +.",
      "Visitors can now make the portal board, shared pages and the shared dashboard larger or smaller, as they already could the booking form.",
      "Shared boards and tasks show RMIT's logo in the header.",
    ],
  },
  {
    version: "0.106.1",
    date: "2026-11-19",
    title: "Share switch says where it stands",
    changes: [
      "Share dialogs: the switch reads \"Link is off\" or \"Link is on\", whichever it is.",
      "Before a link exists the dialog starts at the switch. Once made, its address stays in view, on or off.",
    ],
  },
  {
    version: "0.106.0",
    date: "2026-11-18",
    title: "Formatted answers",
    changes: [
      "Booking form editor: short and long questions can allow formatting. Requesters then answer in the same editor as the Brief field: bold, italic, headings, lists, links and colour.",
      "The formatting is kept in the brief the team receives.",
    ],
  },
  {
    version: "0.105.3",
    date: "2026-11-18",
    title: "Moves in activity",
    changes: [
      "A task moved to another board, such as allocated from Task Allocation, now says where it went in activity and notifications instead of stopping at \"to\".",
    ],
  },
  {
    version: "0.105.2",
    date: "2026-11-18",
    title: "Assets",
    changes: [
      "The booking form's third step is called Assets, on the form, in its recap and in the editor. The guide names the steps the same way.",
    ],
  },
  {
    version: "0.105.1",
    date: "2026-11-18",
    title: "Essentials",
    changes: [
      "The booking form's first step is called Essentials, on the form and in its editor.",
    ],
  },
  {
    version: "0.105.0",
    date: "2026-11-18",
    title: "Add your own choice",
    changes: [
      "Booking form editor: a multiple choice question can let requesters add their own answers beside the ones offered (Let them add their own).",
      "On the form they type it into Add your own; it joins their choices and goes into the brief with them.",
    ],
  },
  {
    version: "0.104.2",
    date: "2026-11-18",
    title: "New questions start required",
    changes: [
      "Booking form editor: a question you add, or a step-one question you add back, starts as required. Switch it off to make it optional.",
    ],
  },
  {
    version: "0.104.1",
    date: "2026-11-18",
    title: "Question menus in one column",
    changes: [
      "Booking form editor: the menus for adding a question or a follow-up list the kinds in one column, so no name is cut off.",
    ],
  },
  {
    version: "0.104.0",
    date: "2026-11-18",
    title: "Switch question kinds, and acknowledgements",
    changes: [
      "Booking form editor: change a question between short, long and link, or between single and multiple choice, from its title bar. The wording and choices stay; you are asked first if follow-up questions would go.",
      "New question kind: Acknowledgement, a statement the requester ticks to confirm. Always required.",
    ],
  },
  {
    version: "0.103.13",
    date: "2026-11-18",
    title: "Typing on a phone",
    changes: [
      "Sheets and dialogs on a phone rise above the keyboard, and the field you are typing in is brought to the middle of what is left of the screen.",
    ],
  },
  {
    version: "0.103.12",
    date: "2026-11-18",
    title: "Delete teams in Settings",
    changes: [
      "Settings → Teams has a Delete button for workspace owners and admins, with the same choice to delete the team's boards, trackers and docs too.",
      "The delete dialog's count now includes archived boards, which go with the team when its boards are deleted.",
    ],
  },
  {
    version: "0.103.11",
    date: "2026-11-18",
    title: "Deleting a team",
    changes: [
      "Only workspace admins see Delete team. Members who manage a team can still archive it.",
      "A team delete that is refused now says so, and takes none of the team's boards, trackers or docs with it.",
    ],
  },
  {
    version: "0.103.10",
    date: "2026-11-18",
    title: "One share dialog",
    changes: [
      "Sharing a board or a task shows the same dialog before and after there is a link. Turning the link on creates it in place.",
    ],
  },
  {
    version: "0.103.9",
    date: "2026-11-18",
    title: "Phone fixes",
    changes: [
      "Browse shows how many tasks each board and team holds, like the sidebar, and an empty team is one line.",
      "Portal and Booking: a card's name and Not serving badge no longer run into its switch on a phone.",
      "Portal on a phone: the period and Book a task sit on their own row, and grouping joins the chips, so nothing overlaps.",
      "Settings → Appearance: the counts' section is called Board lists, since it covers Browse too.",
    ],
  },
  {
    version: "0.103.8",
    date: "2026-11-18",
    title: "Lighter shared links",
    changes: ["Shared board and task links check whether anything has changed before reading the board again, and still update within seconds when it has."],
  },
  {
    version: "0.103.7",
    date: "2026-11-18",
    title: "Lighter portal refreshes",
    changes: ["An open portal checks whether anything has changed before reading its board again, so a portal left on screen costs a fraction of what it did."],
  },
  {
    version: "0.103.6",
    date: "2026-11-18",
    title: "Fewer database reads",
    changes: ["Opening a workspace page no longer asks the database for the workspace's name once for every link on the page."],
  },
  {
    version: "0.103.5",
    date: "2026-11-18",
    title: "Faster profiles and My Work",
    changes: [
      "A person's profile and My Work read only that person's tasks, deliverables and activity, not the whole workspace, so they open much faster.",
      "A profile shows who the person is straight away; their figures and lists follow.",
      "A profile's Activity tab lists the person's latest twelve moves, however long ago.",
    ],
  },
  {
    version: "0.103.4",
    date: "2026-11-18",
    title: "Photos are your own",
    changes: ["Editing someone else's profile no longer offers to replace their photo, which only they can change."],
  },
  {
    version: "0.103.3",
    date: "2026-11-18",
    title: "Team counts are task counts",
    changes: ["The count beside a team in the sidebar is the tasks across its boards, in the team's colour.", "Count badges have squarer corners."],
  },
  {
    version: "0.103.2",
    date: "2026-11-18",
    title: "Switch off board counts",
    changes: ["Settings → Appearance: Task counts beside boards can be switched off, for this browser only."],
  },
  {
    version: "0.103.1",
    date: "2026-11-18",
    title: "Tidier team pages",
    changes: ["A team page's empty Boards, Trackers or Docs section is one quiet line instead of a large placeholder."],
  },
  {
    version: "0.103.0",
    date: "2026-11-18",
    title: "Task counts beside boards",
    changes: ["The sidebar and a team's board list show how many tasks each board holds. In the sidebar the board's … menu takes the count's place on hover."],
  },
  {
    version: "0.102.2",
    date: "2026-11-18",
    title: "Whole cards open their links",
    changes: ["Portal and Booking: anywhere on a card opens its link, settings list included."],
  },
  {
    version: "0.102.1",
    date: "2026-11-18",
    title: "Pictures upload from Safari",
    changes: ["Avatars, task covers and bug-report screenshots upload from Safari, iPhone and iPad again."],
  },
  {
    version: "0.102.0",
    date: "2026-11-18",
    title: "A simpler Portal and Booking page",
    changes: [
      "The Portal and Booking form cards sit side by side with their settings listed on them; the gear beside each switch changes them.",
      "The Booking form card says which form is live: its name, questions and services, and when it was published.",
      "Editing the form has its own page: Edit form on the Booking form card.",
      "Leaving the form editor with unsaved changes asks first.",
      "New link moves into each card's settings. Portal passwords are no longer set here.",
    ],
  },
  {
    version: "0.101.24",
    date: "2026-11-18",
    title: "Clearer card titles",
    changes: ["Portal and Booking: the Portal and Booking form cards have bigger titles."],
  },
  {
    version: "0.101.23",
    date: "2026-11-18",
    title: "Briefs show what was typed",
    changes: ["A # or * typed in a booking shows as itself in the brief, without a stray backslash."],
  },
  {
    version: "0.101.22",
    date: "2026-11-18",
    title: "RMIT logo on the portal",
    changes: ["The portal's top bar leads with the RMIT logo; Streamline's mark sits at the far end."],
  },
  {
    version: "0.101.21",
    date: "2026-11-18",
    title: "RMIT on the booking card",
    changes: ["The booking card carries RMIT's red pixel beside the team's name.", "The sign-in and booking pages drop the list of three features under the intro."],
  },
  {
    version: "0.101.20",
    date: "2026-11-18",
    title: "Booking page wording",
    changes: ["The booking page's built-in intro now speaks for Vietnam marketing and says a ticket comes straight away."],
  },
  {
    version: "0.101.19",
    date: "2026-11-18",
    title: "Cleaner portal links",
    changes: ["Portal and Booking: the portal and booking form are two simple cards under the portal's heading, no longer boxed inside another card."],
  },
  {
    version: "0.101.17",
    date: "2026-11-18",
    title: "Calmer All time",
    changes: ["Portal: All time is an ordinary choice in the date menu, without the warning colours."],
  },
  {
    version: "0.101.16",
    date: "2026-11-18",
    title: "Quieter board access",
    changes: ["A board's header shows your access as an icon beside its name; hover it for what it means."],
  },
  {
    version: "0.101.15",
    date: "2026-11-18",
    title: "The portal shows what the task holds",
    changes: [
      "Every column switched on in the portal's settings shows, even before anything is in it.",
      "The brief is the one on the board, including for tasks not booked through the portal.",
      "People show with their photos.",
    ],
  },
  {
    version: "0.101.14",
    date: "2026-11-18",
    title: "Wider service cards in the editor",
    changes: ["Form Editor: the kinds of work show in wider cards, with more rows when needed, so names are no longer cut off.", "Cards in the same row are the same height."],
  },
  {
    version: "0.101.12",
    date: "2026-11-18",
    title: "Cleaner picked chips",
    changes: ["Booking form and Form Editor: a picked chip's colour dot loses its outline."],
  },
  {
    version: "0.101.11",
    date: "2026-11-18",
    title: "Work type chips match the form",
    changes: ["Form Editor: the work types a service offers use the same chips as the booking form."],
  },
  {
    version: "0.101.10",
    date: "2026-11-18",
    title: "Clearer work type picks",
    changes: ["Form Editor: the work types a service offers show as solid, ticked chips in their colour."],
  },
  {
    version: "0.101.9",
    date: "2026-11-18",
    title: "Workspace menu counts",
    changes: ["The number beside another workspace in the menu counts only notifications its inbox shows, so one about a deleted task no longer sticks there."],
  },
  {
    version: "0.101.8",
    date: "2026-11-18",
    title: "Lighter join link",
    changes: ["Add member: the join link sits on the dialog itself instead of in a box."],
  },
  {
    version: "0.101.7",
    date: "2026-11-18",
    title: "Asset & Work types",
    changes: ["Settings: Asset types is now Asset & Work types, with a tab for each."],
  },
  {
    version: "0.101.6",
    date: "2026-11-18",
    title: "Wider service cards on the booking form",
    changes: ["Booking: the kinds of work show in wider cards, with more rows when needed, so names are no longer cut off."],
  },
  {
    version: "0.101.5",
    date: "2026-11-18",
    title: "Portal links open from their cards",
    changes: ["Portal and Booking: the portal and booking form open from their own cards (Open Portal, Open Form); the button at the top is gone."],
  },
  {
    version: "0.101.4",
    date: "2026-10-30",
    title: "About keeps its feature list",
    changes: ["About goes back to its own feature list."],
  },
  {
    version: "0.101.2",
    date: "2026-10-30",
    title: "Sign-in page copy",
    changes: ["New wording on the sign-in page: from brief to report, in one place."],
  },
  {
    version: "0.101.1",
    date: "2026-10-30",
    title: "Sign-in page copy",
    changes: ["The sign-in page now covers dashboards and reporting, and names the Vietnam marketing team."],
  },
  {
    version: "0.101.0",
    date: "2026-10-30",
    title: "Workspace descriptions in shared links",
    changes: ["A workspace can have a short description (Settings → Overview). A shared link to the workspace shows its name and that description."],
  },
  {
    version: "0.100.1",
    date: "2026-10-29",
    title: "Change password in your profile",
    changes: ["Change password moves from your menu into Edit profile, beside your email. It shows only on your own profile."],
  },
  {
    version: "0.100.0",
    date: "2026-10-29",
    title: "Change your password",
    changes: [
      "Change password in your menu: give your current password and a new one twice.",
      "Your other devices are signed out; you stay signed in where you made the change.",
    ],
  },
  {
    version: "0.99.0",
    date: "2026-10-29",
    title: "One list of work types",
    changes: [
      "The booking form's sub-services are now work types: each service offers some of the workspace's work types (Settings → Asset types), picked in the form editor.",
      "Renaming or removing a work type changes it in the published form, the draft and every saved form.",
      "A booking's brief lists them as Work types.",
    ],
  },
  {
    version: "0.98.3",
    date: "2026-10-29",
    title: "Work type heading",
    changes: ["The Work type heading in Settings → Asset types drops its edit link; the work types are edited just below."],
  },
  {
    version: "0.98.2",
    date: "2026-10-29",
    title: "Asset type heading",
    changes: ["Settings → Asset types heads its first column \"Asset type\"."],
  },
  {
    version: "0.98.1",
    date: "2026-10-26",
    title: "Shorter menu item",
    changes: ["A member's menu says Remove from workspace, on one line."],
  },
  {
    version: "0.98.0",
    date: "2026-10-26",
    title: "Remove from one workspace",
    changes: [
      "A member who is also in another workspace can be removed from this one only. Their other workspaces are not touched, and they can be added back from From other workspaces.",
      "Reinitiate, deactivate and remove sit together at the end of a member's menu.",
    ],
  },
  {
    version: "0.97.1",
    date: "2026-10-26",
    title: "Other workspaces behind a button",
    changes: [
      "Members lists only this workspace's people. Everyone else is under From other workspaces, with a search and an Add on each person.",
    ],
  },
  {
    version: "0.97.0",
    date: "2026-10-25",
    title: "Department when joining",
    changes: [
      "Add member has a Department, so the person arrives with one.",
      "The join page asks for a department too, already chosen if the admin set one, and the person can change it or leave it unset.",
      "Only departments from Settings → Departments can be picked.",
    ],
  },
  {
    version: "0.96.4",
    date: "2026-10-25",
    title: "Team buttons for those who can use them",
    changes: [
      "Settings → Teams shows Edit and Archive only on teams you can manage: as an admin of the workspace, or on the team yourself. New team is for members and up.",
      "An archive that is refused says why.",
    ],
  },
  {
    version: "0.96.3",
    date: "2026-10-25",
    title: "Deactivation reaches teams",
    changes: ["Someone deactivated in a workspace can no longer rename its teams or change who is on them."],
  },
  {
    version: "0.96.2",
    date: "2026-10-25",
    title: "Right-click for everyone on Members",
    changes: ["Right-clicking a person you can't manage opens a short menu (profile, copy email, your own details) instead of the browser's."],
  },
  {
    version: "0.96.1",
    date: "2026-10-24",
    title: "Right-click on Members",
    changes: [
      "Right-click a person on Members for the same menu as their ⋯ button.",
      "The edit details dialog keeps its buttons clear of the last field.",
    ],
  },
  {
    version: "0.96.0",
    date: "2026-10-24",
    title: "Admins edit member info",
    changes: [
      "Admins can edit any member's details, joined or not: name, title, department, timezone, work hours, photo. An Owner's details stay with the Owners.",
      "Admins can change a member's email, which changes the address they sign in with too. Their work stays theirs.",
      "Members has Edit info in each person's menu.",
      "Somebody who is also in a workspace you don't run is edited by an Owner.",
    ],
  },
  {
    version: "0.95.2",
    date: "2026-10-21",
    title: "Allocate with no boards to allocate to",
    changes: [
      "On Task Allocation, Allocate to no longer spins for ever when no team has a board: it shows greyed out with \"No boards\", the bulk bar's button is disabled, and the task panel says to add a board to a team.",
    ],
  },
  {
    version: "0.95.1",
    date: "2026-10-21",
    title: "A simpler size picker",
    changes: [
      "The size picker drops its list of example jobs and the marker under the sizes: each size's span and the kind of work it covers, then where the task fits.",
    ],
  },
  {
    version: "0.95.0",
    date: "2026-10-21",
    title: "T-shirt sizes that mean something",
    changes: [
      "Settings → Sizes says what each size stands for: a span of working time, the kind of work and typical jobs. It starts from the GCMC sizing sheet, XS a week to XL three to six months.",
      "A task's size picker shows every size's span and what it covers.",
      "With assets on the task, the picker shows their hours at your output rates, which size they fit, and sets it in one click.",
      "Follow assets keeps a task's size in step as its assets change. Asset types without a rate are named and left out.",
    ],
  },
  {
    version: "0.94.8",
    date: "2026-10-21",
    title: "No stripes on the task panel",
    changes: [
      "A stuck task's panel no longer has stripes across its header; it keeps the status colour along its top.",
    ],
  },
  {
    version: "0.94.7",
    date: "2026-10-21",
    title: "Stuck stripes clearer at the top",
    changes: [
      "The stripes on a stuck task's panel are a little stronger along the top edge, still fading out quickly below it.",
    ],
  },
  {
    version: "0.94.6",
    date: "2026-10-21",
    title: "Softer stuck stripes",
    changes: [
      "The stripes on a stuck task's panel are softer and fade out sooner, towards the sides as well as down.",
    ],
  },
  {
    version: "0.94.5",
    date: "2026-10-21",
    title: "Stuck tasks striped in the panel",
    changes: [
      "A stuck task's panel carries faint hazard stripes across its header, fading out down the page, unless the task has a cover photo.",
    ],
  },
  {
    version: "0.94.4",
    date: "2026-10-21",
    title: "Task panel in its status colour",
    changes: [
      "An open task's panel takes the colour of its status along its top edge and header, so you can see where it stands at a glance. A task with no status keeps the board's colour.",
    ],
  },
  {
    version: "0.94.3",
    date: "2026-10-21",
    title: "Lighter public dashboard links",
    changes: [
      "A public dashboard link left open re-reads the workspace only when something in it has changed.",
    ],
  },
  {
    version: "0.94.2",
    date: "2026-10-21",
    title: "Tooltips on the board's controls",
    changes: [
      "The board's header and toolbar explain themselves on hover: the Team and Private badges say who can see the board, and View, Saved views, Person, Tags, Filter, Sort, Hide, Clear all, New Item and the board menu each have a tooltip.",
      "Board managers can click the board's icon to change its icon and colour.",
    ],
  },
  {
    version: "0.94.1",
    date: "2026-10-21",
    title: "Your access on every board",
    changes: [
      "A badge beside the board name shows what you can do there: Owner, Can manage, Can edit or View only.",
    ],
  },
  {
    version: "0.94.0",
    date: "2026-10-12",
    title: "New columns from the asset settings",
    changes: [
      "Task assets settings can make the column a part is missing, from its column list: a Type dropdown of your asset types, a Quantity, a PIC People column, a Due date, a Done tick, a Link.",
      "Column letters sit in a rounded badge with room before the name.",
      "Picking a PIC in a form with Update wakes Update at once, without closing the list first.",
      "A line just added can be opened and edited straight away without its picker closing as it saves.",
      "A task open in another tab follows edits made in its tracker sheet.",
    ],
  },
  {
    version: "0.93.6",
    date: "2026-10-12",
    title: "To-do warning without a box",
    changes: [
      "The To-do warning keeps its amber text and Show all button without a box around it.",
    ],
  },
  {
    version: "0.93.5",
    date: "2026-10-12",
    title: "To-do says what it hides",
    changes: [
      "With To-do on, an amber strip says how many items are hidden, with Show all beside it.",
    ],
  },
  {
    version: "0.93.4",
    date: "2026-10-12",
    title: "No bars beside asset lines",
    changes: [
      "Asset lists, a sheet's and a task's own, drop the bar beside each line; a late date is still red.",
    ],
  },
  {
    version: "0.93.3",
    date: "2026-10-12",
    title: "A sheet's assets look like the task's",
    changes: [
      "A sheet's assets on a task are numbered and laid out as cards like the task's own, with the quantity, type, people and deadline, late ones marked red.",
    ],
  },
  {
    version: "0.93.2",
    date: "2026-10-12",
    title: "PIC set on a sheet's asset sticks",
    changes: [
      "Setting the PIC of a sheet's asset from the task no longer snaps back when someone else has the same name: the sheet gets a name only that person goes by, or their email.",
      "If the sheet takes a change but the task's assets cannot follow, you are told instead of the change quietly undoing itself.",
    ],
  },
  {
    version: "0.93.1",
    date: "2026-10-12",
    title: "To-do covers a sheet's assets",
    changes: [
      "To-do on a task's Assets tab lists your assets from its tracker sheet beside the ones added on the task, and leaves the sheet out when none there are yours.",
    ],
  },
  {
    version: "0.93.0",
    date: "2026-10-12",
    title: "Edit a sheet's assets on the task",
    changes: [
      "A task's assets from a tracker sheet open on the task: everything the sheet gives is shown, and the name, type, quantity, PIC, due date, and a spec or link from one column can be changed there. The change is made in the sheet.",
      "A sheet's assets sit in their own tinted card marked Sheet, which folds away, and the task's own assets below it are headed Added on this task.",
    ],
  },
  {
    version: "0.92.0",
    date: "2026-10-12",
    title: "Asset roles from the column menu",
    changes: [
      "A tracker column's header menu has Asset role: make it the asset name, type, quantity, PIC, due date, done, a spec or a link without opening the settings.",
      "Any column can play any part, one column per part; you are warned when some of its cells cannot be read that way.",
      "Task assets settings show each column's letter, and spec columns can be dragged into order with dividers and line breaks between them.",
      "On a task's Assets tab, the add box, Block and To-do sit at the top, above a tracker sheet's lines.",
    ],
  },
  {
    version: "0.91.2",
    date: "2026-10-12",
    title: "Removing asset lines quickly",
    changes: [
      "Removing asset lines in quick succession no longer shows an \"item_assets.getById\" error.",
    ],
  },
  {
    version: "0.91.1",
    date: "2026-10-06",
    title: "Better column guesses for asset sheets",
    changes: [
      "Using a sheet for a task now recognises Versions, Copies and Pcs as the quantity, and Signed off, Ready, Live and similar ticks as done.",
    ],
  },
  {
    version: "0.91.0",
    date: "2026-10-06",
    title: "Tracker sheets as task assets",
    changes: [
      "A tracker sheet can hold a task's assets: choose Use for a task on the sheet, or Use a tracker sheet on the task's Assets tab. Each row becomes one of the task's assets, counted in its recap, My Work, Workload and the dashboard by type, quantity and PIC.",
      "Pick which columns give each asset its name, type, quantity, PIC, due date and done, or give one value for every row, such as one PIC for the whole list.",
      "A People column picks workspace members; it exports to Excel as names.",
      "Tick a sheet's asset off on the task and its row is ticked in the sheet. Only people who can edit the task can change its sheet.",
      "Two people editing one sheet no longer overwrite each other: changes are merged cell by cell.",
      "Rename from any menu keeps the cursor in the box; double-click a column header to rename it, or its edge to fit it.",
      "Sheets reorder by dragging their tabs or with Move left and right; Duplicate sheet copies the rows too. Trackers can be duplicated or moved to another team.",
    ],
  },
  {
    version: "0.90.1",
    date: "2026-10-03",
    title: "Clearer connection cover",
    changes: [
      "The connection cover says what is wrong: the server isn't answering, the server answered with an error (usually maintenance), or the device is offline.",
      "It says since when and how many checks have failed, what happens to work in the meantime, and to tell an admin if it lasts.",
    ],
  },
  {
    version: "0.90.0",
    date: "2026-10-03",
    title: "Connection status",
    changes: [
      "When the server can't be reached, or the device goes offline, the page is covered and editing pauses until it's back, so nothing typed is lost. It retries on its own; Try now checks at once.",
      "When the connection returns, the page reads its data again, and a doc or tracker that could not save tries again.",
      "The guide covers docs, View only boards, Kanban rows and lanes, Gantt baselines, Workload capacity, work types, the Departments and Aging work panels, more than one workspace and Report a bug.",
    ],
  },
  {
    version: "0.89.0",
    date: "2026-10-02",
    title: "Docs",
    changes: [
      "Docs sit in a team beside its boards and trackers: Add new → Doc, or the team's own menu.",
      "Write in blocks: type / for headings, lists, to-dos, quotes, code and dividers, or use Markdown habits as you type; select text to bold it, italicise it or add a link.",
      "Upload a Word (.docx), Markdown, text or HTML file to make it an editable page, or a PDF to keep it as it is, read only.",
    ],
  },
  {
    version: "0.88.2",
    date: "2026-10-02",
    title: "Fainter Kanban card edges",
    changes: [
      "Kanban cards keep a faint outline, firmer on hover.",
    ],
  },
  {
    version: "0.88.1",
    date: "2026-10-02",
    title: "Kanban cards without outlines",
    changes: [
      "Kanban cards no longer have an outline; they stand off their lane by their fill and lighten on hover.",
    ],
  },
  {
    version: "0.88.0",
    date: "2026-10-02",
    title: "Workload with capacity",
    changes: [
      "Workload can measure Hours vs capacity: each task's deliverables at the workspace's rates, shared between its owners and spread over its working days, against each person's hours.",
      "Members has an Hours column for each person's hours a week here; empty is a 38-hour week.",
      "Hover a person for their open, stuck, overdue and undated work, busiest period and next due; hover a cell for its tasks and hours. Cells show a status or capacity bar, and done work is hidden unless Done is on.",
    ],
  },
  {
    version: "0.87.0",
    date: "2026-10-02",
    title: "Gantt baselines",
    changes: [
      "Save a baseline on the Gantt to keep today's dates as the plan; each bar then shows the plan under it and how many days it has slipped.",
      "The Gantt counts slipped tasks; the baseline can be replaced, hidden or cleared from its menu.",
    ],
  },
  {
    version: "0.86.0",
    date: "2026-10-02",
    title: "Aging work and department service",
    changes: [
      "Kanban cards show how long they have sat in their status once it is three days, amber from a week and red from two; Display turns it off.",
      "The dashboard shows open work by how long it has been in each status, and a Departments table: open, waiting, oldest, pick-up time, finished, turnaround, on time and sent back.",
    ],
  },
  {
    version: "0.85.0",
    date: "2026-10-02",
    title: "Kanban swimlanes",
    changes: [
      "Rows split the Kanban's lanes by person, priority, group or a dropdown; drag a card to any cell to change both.",
      "Rows fold away from their header, and a card can be added straight into a cell.",
    ],
  },
  {
    version: "0.84.3",
    date: "2026-10-02",
    title: "Softer lane headers",
    changes: [
      "An outlined lane's colour at the top is fainter and fades out smoothly, with no edge under the header.",
    ],
  },
  {
    version: "0.84.2",
    date: "2026-10-02",
    title: "Outlined Kanban lanes",
    changes: [
      "Tinted lanes are outlined by default, with the lane's colour fading down from the header.",
    ],
  },
  {
    version: "0.84.1",
    date: "2026-10-02",
    title: "Saved views in one list",
    changes: [
      "Saved views are one list, each marked Shared or Only you.",
      "The pop-up's Overview sits centred in its half.",
    ],
  },
  {
    version: "0.84.0",
    date: "2026-10-02",
    title: "Rename and reorder Kanban lanes",
    changes: [
      "Double-click a lane's name to rename its status, dropdown choice or group.",
      "Drag a lane by its header to put lanes in a new order; the table and pickers follow.",
      "Tint lanes has a style: Soft, Strong or Outline.",
    ],
  },
  {
    version: "0.83.2",
    date: "2026-10-02",
    title: "Kanban cards open as a pop-up",
    changes: [
      "Kanban cards open as a pop-up; Display, Open cards in switches them to the panel.",
    ],
  },
  {
    version: "0.83.1",
    date: "2026-10-02",
    title: "Kanban Display menu",
    changes: [
      "Cards, Width and Tint lanes moved into a Display menu beside Lanes by.",
      "A lane's scrollbar shows only while the pointer is over the lane.",
    ],
  },
  {
    version: "0.83.0",
    date: "2026-10-02",
    title: "Kanban lanes restyled",
    changes: [
      "Kanban cards show their ticket and a grip, and lanes have a quieter, outlined look.",
      "The lane a dragged card would land in is outlined in its colour, folded lanes included.",
      "A folded lane is a thin strip with its name and count; click it to open it again.",
      "Width sets lanes to Wide, Medium or Narrow, so more fit across.",
    ],
  },
  {
    version: "0.82.0",
    date: "2026-10-01",
    title: "Dropdown styles",
    changes: [
      "A Dropdown column's menu has Style: filled, soft, outline, a dot and the name, or coloured text; rounded, pill or square corners; filling the cell or fitting the name. Status keeps its own look.",
      "Making a toolbar button no longer breaks when it is switched to selected tasks after choosing Open a link, and the toolbar buttons say selected rather than ticked.",
    ],
  },
  {
    version: "0.81.1",
    date: "2026-10-01",
    title: "Progress bars sit still",
    changes: ["Progress bars no longer animate: the stripes on a part-done bar stay put, and the bar does not slide when it changes."],
  },
  {
    version: "0.81.0",
    date: "2026-10-01",
    title: "Buttons for selected tasks",
    changes: [
      "A toolbar button can be for when tasks are selected: it takes the slot while any are, and only offers what works on them (steps or a quick run). Buttons for when nothing is selected offer a quick run, a saved view or a link.",
      "A coloured toolbar button keeps its colour on hover instead of turning red.",
    ],
  },
  {
    version: "0.80.1",
    date: "2026-10-01",
    title: "Shorter toolbar button labels",
    changes: ["A toolbar button's label is up to 16 characters, with a count as you type, so it never crowds the toolbar."],
  },
  {
    version: "0.80.0",
    date: "2026-10-01",
    title: "Make your own toolbar buttons",
    changes: ["The arrow beside New item makes buttons of the board's own: a label, an icon and a colour, then what it does. It can run steps on the selected tasks, run a quick run, open a saved view or open a link. The one picked sits in the slot for everyone; New item stays as it is."],
  },
  {
    version: "0.79.1",
    date: "2026-10-01",
    title: "Links open the view they name",
    changes: ["A link to a board's Kanban, Calendar or any other view opens on that view, even when the board has a saved Default view."],
  },
  {
    version: "0.79.0",
    date: "2026-10-01",
    title: "View only boards",
    changes: ["Board menu → View only locks a board against accidental changes, for you alone or, for a board manager, for everyone on it. A strip says so, with Unlock beside it. It does not change who may edit."],
  },
  {
    version: "0.78.0",
    date: "2026-10-01",
    title: "The New item button is a slot",
    changes: ["Board managers can swap the toolbar's New item button for one of the board's quick runs, under a label of their own, from the arrow beside it. Pressed with tasks selected it runs on those; otherwise it asks which."],
  },
  {
    version: "0.77.0",
    date: "2026-10-01",
    title: "Last updated and Button columns",
    changes: [
      "Last updated shows who last changed each task and when. Its Format chooses which changes count and whether it shows the person, the time or both.",
      "Button puts a button on every task that runs a few steps in one press: set a status or priority, put you on it, set the due date, move it, tick its assets, post an update, open a link, duplicate or archive it. Pick a ready-made button or build your own label, colour, style and steps.",
    ],
  },
  {
    version: "0.76.3",
    date: "2026-10-01",
    title: "Portal link cards stand out",
    changes: ["The Portal and Booking form cards have a fill and edge of their own, and clicking a card's empty space opens its link in a new tab."],
  },
  {
    version: "0.76.2",
    date: "2026-10-01",
    title: "Portal shows only what can be used",
    changes: [
      "The portal no longer shows controls a visitor cannot use: no selection ticks on rows and groups, no locked column list under Hide (the Ticket switch stays), no Star or Follow on a task, and no Columns chip on a phone.",
      "The same goes for anyone else who can only read a board.",
    ],
  },
  {
    version: "0.76.1",
    date: "2026-10-01",
    title: "Pop-up opens on the overview",
    changes: [
      "A task opened in a pop-up shows its Overview on the left and its Assets on the right to start with.",
      "The browser tab icon is a little smaller.",
    ],
  },
  {
    version: "0.76.0",
    date: "2026-10-01",
    title: "Chart view removed",
    changes: ["Boards, portals and shared links no longer offer the Chart view. A link or setting that opened on it opens the Main Table."],
  },
  {
    version: "0.75.1",
    date: "2026-10-01",
    title: "Saved views say which one is on",
    changes: [
      "The views button always names the view on screen, Default view included.",
      "Save clears the Edited mark at once instead of after the save comes back; it returns if the save fails.",
    ],
  },
  {
    version: "0.75.0",
    date: "2026-10-01",
    title: "Save the Default view",
    changes: [
      "Board editors can save the Default view, which is what everyone sees on the board when no other view is open. It saves like any view but keeps its name and cannot be deleted.",
      "When the board toolbar runs short of room, Person and Tags move into the Filter panel, then the buttons drop their words, instead of all of them shrinking at once.",
    ],
  },
  {
    version: "0.74.0",
    date: "2026-10-01",
    title: "Saved views",
    changes: [
      "Save a board's setup as a view: the view, search, filters, sort, hidden columns and the view's own settings. Pick it again from Saved views beside the filters.",
      "Share a view with everyone on the board, or keep it to yourself. Changes to an open view are marked Edited until you save or discard them; views can also be renamed, duplicated and deleted.",
    ],
  },
  {
    version: "0.73.13",
    date: "2026-10-01",
    title: "Phone settings open on the list",
    changes: ["On a phone, Settings in More opens the list of sections first, rather than going straight into Overview."],
  },
  {
    version: "0.73.12",
    date: "2026-10-01",
    title: "Kanban cards without the shadow",
    changes: ["Kanban cards stand out by their fill and edge alone; the shadow is gone, and hovering a card lights its edge instead."],
  },
  {
    version: "0.73.11",
    date: "2026-10-01",
    title: "Kanban cards stand out",
    changes: [
      "Kanban cards sit a step lighter than their lane in the dark themes, with a firmer edge and shadow, and Tint lanes is on unless you turn it off.",
    ],
  },
  {
    version: "0.73.10",
    date: "2026-10-01",
    title: "To-do filters the list",
    changes: [
      "To-do in the Assets tab now narrows the list to your items in place, instead of opening a window; \"Only yours · 2 of 3 items\" shows while it is on, with Show all beside it.",
    ],
  },
  {
    version: "0.73.9",
    date: "2026-10-01",
    title: "Ticket search finds the ticket",
    changes: [
      "Searching for a ticket such as CT_011 finds that task alone, not CT_110 to CT_119 as well; the same in the board search and the portal.",
    ],
  },
  {
    version: "0.73.8",
    date: "2026-10-01",
    title: "Task menu matches the panel",
    changes: [
      "Right-click a task, on the table or a Kanban card, for what its panel offers: Task journey, Star, Follow with the changes to hear about, and the columns hidden from the panel or the board. Kanban cards also get Duplicate.",
    ],
  },
  {
    version: "0.73.7",
    date: "2026-10-01",
    title: "Work types focus from the radar",
    changes: [
      "Work types: a slice of the radar opens its card in the list with the other types still named a line each; moving onto the list shows it all again, and hovering a row lights its slice.",
    ],
  },
  {
    version: "0.73.6",
    date: "2026-10-01",
    title: "Steadier work types, plainer portal cards",
    changes: [
      "Work types: the type in focus shows its card in place of the list, so the panel no longer grows on hover.",
      "Portal and Booking form cards: flat, no colour wash, the same layout in both, links at the foot.",
    ],
  },
  {
    version: "0.73.5",
    date: "2026-10-01",
    title: "Month bars and work type detail",
    changes: [
      "Tasks by month: click a bar, this year's or last year's, for the tasks behind it.",
      "Work types: hover a slice of the radar or a row of the list and its row opens into the detail, with last year, change, tasks, overdue, delivered, the asset types in it and who is doing it.",
    ],
  },
  {
    version: "0.73.4",
    date: "2026-10-01",
    title: "Overdue is red, no icon",
    changes: ["Overdue dates and items are shown in red alone, without the warning icon: deliverables, board cells, Kanban, Calendar, Timeline, Gantt and the dashboard's boards list."],
  },
  {
    version: "0.73.3",
    date: "2026-10-01",
    title: "Work types in the PDF",
    changes: ["Export PDF has a Work types page: the radar against last year, a row per work type with its share, change, delivery and main asset types, the busiest people split by work type, and the explanation."],
  },
  {
    version: "0.73.2",
    date: "2026-10-01",
    title: "Work types radar, in motion",
    changes: [
      "The Work types radar draws itself in: the rim and rings, the spokes one by one, then the shape traced round. Changing the period, person or measure morphs it to the new figures.",
      "The Work types panel has its \"?\": what it shows, how it is counted, how to read it and what to do.",
    ],
  },
  {
    version: "0.73.1",
    date: "2026-10-01",
    title: "Work types radar fits",
    changes: ["The Work types radar keeps its labels inside its own space, each on three short lines, so none is cut off or runs into the list beside it."],
  },
  {
    version: "0.73.0",
    date: "2026-10-01",
    title: "Work types",
    changes: [
      "Asset types can be grouped into work types, each with a colour: pick them as chips on each asset type in Settings → Asset types. A type can be in several work types and counts in each.",
      "The dashboard has a Work types radar: this period against last year, for the whole team or one person, with each work type's share, change, delivery and main asset types. Click one for its tasks.",
    ],
  },
  {
    version: "0.72.1",
    date: "2026-10-01",
    title: "Progress on the task's line",
    changes: ["A task's progress is a small ring and percentage beside who made it; click it for the Assets tab. The \"0 of 2 items done\" bar under it is gone."],
  },
  {
    version: "0.72.0",
    date: "2026-10-01",
    title: "The tasks behind the dashboard",
    changes: [
      "Click a figure on the dashboard to see the tasks it counted: the headline cards, a team, department or priority, an asset type, the operations figures, a person's workload, and Turnaround, On time and Sent back.",
      "The list is plain and paged, 50 at a time, with its own search, open or done, team and sort; it leaves the dashboard as it was. Click a task to open it.",
    ],
  },
  {
    version: "0.71.4",
    date: "2026-10-01",
    title: "A ticket series per workspace",
    changes: ["A new workspace starts its own ticket series under its own prefix, from its name's initials (Content team is CT) and never one another workspace uses."],
  },
  {
    version: "0.71.3",
    date: "2026-10-01",
    title: "About, shorter",
    changes: ["About lists five highlights, the workspace dashboard first."],
  },
  {
    version: "0.71.2",
    date: "2026-10-01",
    title: "About, refreshed",
    changes: ["The About window lists what Streamline does best: linked tasks, automations, self-routing booking, the department portal, effort on the dashboard, deliverables and checklists, and live updates across workspaces."],
  },
  {
    version: "0.71.1",
    date: "2026-10-01",
    title: "Portal columns in a pop-up",
    changes: ["Portal settings show the columns as a short summary; Edit opens the list in a pop-up, shown columns first to drag into order, hidden ones below, special columns marked green."],
  },
  {
    version: "0.71.0",
    date: "2026-10-01",
    title: "Portal columns",
    changes: [
      "Portal settings list every column the boards use: drag to reorder, switch each on or off, special columns marked. It changes the portal only.",
      "A board's own column starts off; switching it on is what shows it to departments. Columns with the same name and kind on several boards are one column.",
      "Period in portal settings is now Default span.",
    ],
  },
  {
    version: "0.70.2",
    date: "2026-10-01",
    title: "An empty portal says why",
    changes: ["A portal with nothing to show says why — the period, the search, the filters, or no requests yet — with Show all time and Book a task."],
  },
  {
    version: "0.70.1",
    date: "2026-10-01",
    title: "A switch on each link",
    changes: [
      "Portal and Booking form each have an On/Off switch at the top of their card. The portal's opens or closes it; the booking form's starts or stops taking requests, once the portal is open.",
      "The Open switch in the portal header and Takes new requests in the booking settings are gone: the card switches do both.",
    ],
  },
  {
    version: "0.70.0",
    date: "2026-10-01",
    title: "Progress settings",
    changes: [
      "The Progress column has a Format menu: count each asset once or by quantity, show the bar, the number or both, and the number as 60% or 3/5.",
      "A new workspace, or access to one, shows in the workspace menu without a refresh.",
    ],
  },
  {
    version: "0.69.1",
    date: "2026-10-01",
    title: "Workspace menu",
    changes: ["The workspace menu lists every workspace the first time it opens, instead of filling in after a moment."],
  },
  {
    version: "0.69.0",
    date: "2026-10-01",
    title: "Checklists and Progress",
    changes: [
      "Updates can hold checklists: press the checklist button, or start a line with [ ]. Anyone working on the task can tick a box; hover a tick to see who ticked it.",
      "An update with a checklist shows how far through it is, 2/5, beside its replies.",
      "New special column, Progress: a bar of how many of the task's assets are done. Empty until the task has assets.",
      "The task panel's header keeps Star, Follow, the menu and Close. Task journey and Share by link are in the menu.",
      "The form editor's Templates panel: Save sits beside the dropdown as a small button, with Delete for the template loaded. Load a template is gone.",
      "Open Task Allocation is gone from under the form's links.",
      "The Admin panel in the sidebar is no longer boxed.",
    ],
  },
  {
    version: "0.68.1",
    date: "2026-09-30",
    title: "Pick a template",
    changes: ["The form editor's Templates panel opens with a dropdown of the saved templates: pick one and it loads."],
  },
  {
    version: "0.68.0",
    date: "2026-09-30",
    title: "Publish a template",
    changes: [
      "Load a template now has Publish beside Load: the template goes live under its own name, and your draft stays as it is.",
      "Publish is off for the template that is already the published form, and for one with something to fix, with the reason on hover.",
    ],
  },
  {
    version: "0.67.3",
    date: "2026-09-30",
    title: "Open the published form",
    changes: ["In the form editor, clicking the published form opens it, the one people are booking through, whatever the draft says."],
  },
  {
    version: "0.67.2",
    date: "2026-09-30",
    title: "Inbox only shows what still opens",
    changes: [
      "Notifications about a task or board that has since been deleted no longer show in the inbox or count on its badges.",
      "A notification about a task that moved to another board opens it there.",
    ],
  },
  {
    version: "0.67.1",
    date: "2026-09-30",
    title: "Straight in, and the workspace under the logo",
    changes: [
      "Signing in goes from the form to the loading screen to your workspace; the form no longer flashes back in between.",
      "The workspace you are in sits under the logo in the sidebar, and switches to your others.",
    ],
  },
  {
    version: "0.67.0",
    date: "2026-09-27",
    title: "Starred tasks",
    changes: [
      "Star a task from its panel, or from any My Work row, and it is kept in My Work's new Starred tab, read like your own work whatever board it is on.",
      "Done starred tasks fold into Done at the foot of the tab, with Clear done to unstar them all; the sidebar's Favourites has one Starred tasks link instead of a growing list.",
    ],
  },
  {
    version: "0.66.0",
    date: "2026-09-27",
    title: "Follow boards and tasks",
    changes: [
      "The bell on a board or a task follows it, even one you are not on, and chooses what reaches you: status changes, other changes, new updates, assets, and tasks added, moved or archived.",
      "Followed changes arrive as quiet updates (Things I follow in notification settings), never for your own changes, and a burst on one task arrives as one. Notification settings lists what you follow.",
    ],
  },
  {
    version: "0.65.1",
    date: "2026-09-27",
    title: "Tidier asset lists",
    changes: ["A task's asset lines put quantity, type, people and due date in columns that line up down the list, types are plain text rather than tinted chips, and the margin rail is only red for what is late."],
  },
  {
    version: "0.65.0",
    date: "2026-09-27",
    title: "My Work: Tasks and Assets",
    changes: ["My Work has two tabs: Tasks, as before, and Assets, every asset line you are in charge of across the workspace, grouped by when it is due, with the task and board it belongs to. Every row opens its task."],
  },
  {
    version: "0.64.3",
    date: "2026-09-27",
    title: "A tidier To-do",
    changes: ["To-do lists each line with its due date and how far off beside the name, and one quiet line of quantity, type, spec and links under it."],
  },
  {
    version: "0.64.2",
    date: "2026-09-27",
    title: "PIC in Board settings",
    changes: ["Board settings → Assets says PIC, whatever the board calls that column."],
  },
  {
    version: "0.64.1",
    date: "2026-09-27",
    title: "To-do",
    changes: ["My to-do in the Assets tab is now called To-do."],
  },
  {
    version: "0.64.0",
    date: "2026-09-27",
    title: "My to-do and PIC from assets",
    changes: [
      "The Assets tab has My to-do beside Block when any line on the task is yours: just your lines, with quantity, type, due date and days left, spec and links, ticked off or edited in place.",
      "Putting someone in charge of an asset adds them to the task's PIC. Board settings → Assets can turn that off, or turn on taking them off again when their last asset goes; only people it added are removed.",
      "The task panel comes in two widths, default and wide; the narrow one is gone.",
    ],
  },
  {
    version: "0.63.1",
    date: "2026-09-27",
    title: "Members, easier to scan",
    changes: [
      "Add member opens with the join link in its own card at the top, then the form for adding one person.",
      "The members list shows each person as a one-line card, with name, email and department in their own columns, and uses more of a wide screen.",
    ],
  },
  {
    version: "0.63.0",
    date: "2026-09-27",
    title: "One pool of people",
    changes: [
      "Members lists everyone in the app: this workspace's members first, then people in other workspaces, with the workspaces each is in.",
      "Admins add someone from the pool with Add to this workspace, choosing their role and teams; access and roles stay per workspace.",
    ],
  },
  {
    version: "0.62.0",
    date: "2026-09-27",
    title: "Export the dashboard as a PDF",
    changes: ["Export PDF on the dashboard downloads a branded report: every chart drawn sharp, beside what it shows, how it's counted, how to read it and what to do, with the period, filters and time it was made."],
  },
  {
    version: "0.61.2",
    date: "2026-09-27",
    title: "Current operations, in detail",
    changes: ["Each Current operations figure now says how late, how soon or how long stuck, and which team or department holds most of it."],
  },
  {
    version: "0.61.1",
    date: "2026-09-27",
    title: "Fuller panel explanations",
    changes: ["Each dashboard ? now says what the panel shows, how it's counted, how to read it and what to do about it."],
  },
  {
    version: "0.61.0",
    date: "2026-09-27",
    title: "A tighter dashboard",
    changes: [
      "Current operations sits beside Asset types, as two rows of big figures.",
      "Turnaround, On time and Sent back stack beside In and out.",
      "Requests in, the team comparison and Time in each status are gone.",
    ],
  },
  {
    version: "0.60.0",
    date: "2026-09-27",
    title: "Every dashboard panel explains itself",
    changes: [
      "A small ? beside each panel's name says what it shows and what it means for the team.",
      "The Per-person figures table is gone; the workload bars and their hover card carry the same numbers.",
    ],
  },
  {
    version: "0.59.3",
    date: "2026-09-27",
    title: "Rework in the demo data",
    changes: ["Some finished demo work now goes back once, to review or reopened, so Sent back on the dashboard has something to show."],
  },
  {
    version: "0.59.2",
    date: "2026-09-27",
    title: "A fuller In and out",
    changes: ["In and out has thicker bars with their counts, each month's change to the backlog under it, and the finish rate and busiest months above."],
  },
  {
    version: "0.59.1",
    date: "2026-09-27",
    title: "A calmer members list",
    changes: ["Members shows a chip only for Pending and Deactivated, puts title and department in one column, shows two teams and a count, and keeps the invite link in each row's menu."],
  },
  {
    version: "0.58.1",
    date: "2026-09-27",
    title: "Steadier dashboard charts",
    changes: ["Switching the dashboard between effort, tasks and asset units no longer throws the monthly columns off the top of the chart."],
  },
  {
    version: "0.58.0",
    date: "2026-09-27",
    title: "Countdown ring",
    changes: ["Countdown cells show a small ring of the time left: green, amber near the end, red once over. Choose ring and time, time only or ring only under the column's Format."],
  },
  {
    version: "0.57.4",
    date: "2026-09-27",
    title: "More on each workspace",
    changes: ["Settings → Workspaces shows each workspace's members, teams, boards, tickets, when it was last active and who its admins are."],
  },
  {
    version: "0.57.3",
    date: "2026-09-27",
    title: "Smoother workspace menu",
    changes: ["The Workspace menu shows a loading row while your other workspaces arrive, and they fade in rather than jump in."],
  },
  {
    version: "0.57.2",
    date: "2026-09-27",
    title: "Settings without Members",
    changes: ["Members is no longer listed in Settings; it is in your account menu, or More on a phone."],
  },
  {
    version: "0.57.1",
    date: "2026-09-27",
    title: "Clearer booking refusals",
    changes: ["A booking missing an answer, or naming a department or service that is not on the form, now says why instead of reporting a server error."],
  },
  {
    version: "0.57.0",
    date: "2026-09-27",
    title: "Several workspaces",
    changes: [
      "Owners can create more workspaces, from the Workspace menu. Each one has its own teams, boards, trackers, forms, portal, dashboard, automations and settings; the people and the departments are shared by all of them.",
      "Switch workspaces from your account menu, or More on a phone. Signing in opens the one you used last.",
      "Owners are above every workspace: they are in all of them, create, rename and delete workspaces in Settings → Workspaces, make other Owners from Members, and use snapshots. Admins run their own workspace.",
      "Adding someone who already has an account gives them access straight away, with no new account and no link.",
      "Deactivating someone removes this workspace only. Departments changed in one workspace change in all of them.",
      "Admins can take Portal and Booking out of their workspace's menu, in Settings → Overview.",
      "Settings is grouped into this workspace, every workspace, and you. Each section says whom it reaches.",
      "Each workspace keeps its own inbox, portal and booking form, and an update can only mention people in its own workspace. A booking never gives the requester access.",
      "Remove completely, in Members: the person's account and history go, and their tasks, boards and deliverables pass to you. Owners can remove anyone but an Owner; admins only people in no other workspace.",
      "Someone else's update can be deleted only by an admin or Owner who is a member of that board.",
      "Once someone has joined, only they can edit their profile.",
    ],
  },
  {
    version: "0.56.2",
    date: "2026-09-27",
    title: "Profile figures",
    changes: ["Profiles show eight figures: open, overdue, due this week and in-progress tasks, and assets done, overdue, due this week and units still to make. The open-work bars are gone."],
  },
  {
    version: "0.56.1",
    date: "2026-09-27",
    title: "More link icons",
    changes: ["Links have 36 icons to choose from, including photos, slides, spreadsheets, website, email and print."],
  },
  {
    version: "0.56.0",
    date: "2026-09-27",
    title: "Asset links and blocks",
    changes: [
      "An asset can hold any number of links, each with its own label and icon, in the order you set. They are in the row's menu, where each one opens or copies.",
      "Blocks group several assets under one person, each with its own type, quantity and due date. Add one with Block, and click its name to edit it all at once. A block can have its own links.",
      "The booking form's deliverables take no links.",
    ],
  },
  {
    version: "0.55.1",
    date: "2026-09-27",
    title: "Add member, on one screen",
    changes: ["Add member shows the form and the team's join link together, and teams are picked as chips."],
  },
  {
    version: "0.55.0",
    date: "2026-09-27",
    title: "Members, for managers",
    changes: [
      "Members has filters by status, role and team, and a search that covers job titles and departments.",
      "The table shows each person's department, when they joined or were invited, how many boards they are on, and when a pending invitation's link expires. Every column sorts.",
      "Admins can select people and change their role, add them to or remove them from a team, deactivate or reactivate them, copy invite links or cancel invitations, all at once.",
      "Export downloads the list as a spreadsheet.",
    ],
  },
  {
    version: "0.54.0",
    date: "2026-09-27",
    title: "A join link for the team",
    changes: ["Add member has a Join link: one link for everyone, where each person enters their own name and email and then sets a password. An email already in the workspace is turned away with what to do instead."],
  },
  {
    version: "0.53.1",
    date: "2026-09-27",
    title: "A simpler bug board",
    changes: ["App development leaves out what bug reports do not need: no Assets tab or Assets recap, no due date, timeline, department or size, and only the Main Table, Kanban and Chart views."],
  },
  {
    version: "0.53.0",
    date: "2026-09-26",
    title: "One dashboard, bug tickets",
    changes: [
      "The dashboard shows the same figures to everyone in the workspace, counted over every board, whether or not you can open them all.",
      "Every bug report gets a ticket of its own series, BUG_001 and on, apart from the tickets bookings get.",
      "Nobody can change or remove their own place on a board, and on App development only its owner manages who is on it.",
      "Signing out ends your session on this device only, not on your other devices.",
    ],
  },
  {
    version: "0.52.2",
    date: "2026-09-26",
    title: "The App development board",
    changes: [
      "App development is built in: it is there as soon as the person who looks after the app opens the workspace, and it cannot be archived, moved or deleted.",
      "Only the board's own members see it. Being a workspace admin no longer opens it.",
      "The activity feed only shows what happened on boards you can open.",
    ],
  },
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
