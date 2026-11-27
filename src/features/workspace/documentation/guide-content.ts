/** User-facing guidance, kept separate from rendering so the download and search
 * use the same copy. Verify behavior against feature/service code when updating;
 * the repository knowledge base holds the implementation detail. */
/** A screenshot from public/guide (see scripts in the docs PR): shown before the words, which explain it. */
export interface GuideFigure {
  /** File name in public/guide, without the extension. */
  shot: string;
  alt: string;
  caption?: string;
  /** A phone screenshot: shown narrower. */
  phone?: boolean;
}

/** Where a screenshot is served from. */
export const guideShotPath = (shot: string) => `/guide/${shot}.webp`;

export interface GuideSection {
  title: string;
  figures?: GuideFigure[];
  paragraphs?: string[];
  steps?: string[];
  bullets?: string[];
  table?: { headers: string[]; rows: string[][] };
  note?: { title: string; text: string };
}

export interface GuideArticle {
  id: string;
  title: string;
  category: string;
  summary: string;
  audience: string;
  sections: GuideSection[];
  related: string[];
}

export const GUIDE_ARTICLES: GuideArticle[] = [
  {
    id: "quick-start-stakeholder",
    title: "Quick start: department",
    category: "Quick start guides",
    summary: "Book work, follow it, and answer the team if they need more.",
    audience: "Departments requesting creative or marketing work",
    sections: [
      { title: "Before you start", bullets: [
        "Ask the team for the booking link or the Guest portal link. You need no account.",
        "Have ready: the goal, the audience, what you need and how many, the date, and links to your files.",
        "Name one person on your side to gather feedback.",
      ] },
      { title: "Book a task", figures: [
        { shot: "booking-essentials", alt: "The booking form's Essentials step: name, email, department, title, date and kind of work" },
        { shot: "booking-brief", alt: "The booking form's Brief step, with questions for the chosen kind of work" },
      ], steps: [
        "Open the booking link, or Book a task on the Guest portal.",
        "Essentials: your name, email, department, a title, the date, and the kind of work.",
        "Brief: answer the questions for that kind of work.",
        "Assets: each item with its type, quantity and size. You can skip this.",
        "Confirm: check everything, then book.",
      ] },
      { title: "Keep your receipt", figures: [
        { shot: "booking-receipt", alt: "The booking receipt with its ticket, Download PDF and a link to the task", caption: "When the team offers it, Follow your request opens your task with no sign-in." },
      ], bullets: [
        "The ticket, such as CP_014, is how you refer to the request.",
        "Download PDF saves a copy.",
        "If the booking seemed to fail, ask the team before booking again.",
      ] },
      { title: "If the team sends it back", figures: [
        { shot: "resubmit-form", alt: "The requester's form, filled in, with the team's note at the top" },
      ], steps: [
        "Open the link the team sends you. Your form opens with your answers and their note.",
        "Change what they asked for. Send again stays off until something on the form is different.",
        "Send again. The same task and ticket take your new answers.",
      ], note: { title: "One use, 14 days", text: "The link works once, for 14 days. If it no longer opens, ask the team." } },
      { title: "Follow progress", figures: [
        { shot: "guest-portal", alt: "The Guest portal listing a department's requests by status" },
      ], bullets: [
        "On the Guest portal, choose your department and a period, or search for your ticket.",
        "Open a request for its brief, status, deliverables, updates and journey.",
        "Send feedback in one message, quoting the ticket.",
      ] },
    ],
    related: ["booking", "portal", "sharing", "workflow"],
  },
  {
    id: "quick-start-admin",
    title: "Quick start: admin",
    category: "Quick start guides",
    summary: "Set up the workspace, give each team a manager, and route incoming work.",
    audience: "Workspace owners and admins",
    sections: [
      { title: "Set up the workspace", figures: [
        { shot: "members", alt: "The Members page with roles, teams and statuses" },
      ], steps: [
        "Members → Add member: add each person with a role. Send their join link yourself; the app sends no email.",
        "Settings → Teams: create the teams. In Team settings, add people under Members and set Access.",
        "Settings → Departments and Asset & Work types: who you work for, and what you make.",
        "Team settings → Bookings: where each team's bookings land.",
        "Portal and Booking: publish the booking form, open the Guest portal, and share the links.",
      ], note: { title: "Manager is not a workspace role", text: "Roles are Owner, Admin, Member and Guest. Team and board access decide what a manager can do. Give Admin only for workspace-wide jobs." } },
      { title: "Route new requests", figures: [
        { shot: "allocation-menu", alt: "A booked task's menu with Allocate to and Send back at the top" },
      ], steps: [
        "Open Task Allocation. New bookings arrive in Booked by Form.",
        "Something missing? Send back asks the requester for it.",
        "Otherwise, Allocate to → team → board.",
        "Tell the team's manager it has arrived.",
      ] },
      { title: "Keep things running", bullets: [
        "Switch on a few automation recipes.",
        "Add allocators in Task Allocation's Board settings → Members.",
        "Review the Dashboard with each manager.",
        "Owners: take a snapshot before a big change.",
        "Someone leaving: reassign their work, then Deactivate here in Members.",
        "Download guide, at the top of this page, gives you a copy to pass to departments.",
      ] },
    ],
    related: ["members", "permissions", "booking", "settings", "automations", "quick-start-manager"],
  },
  {
    id: "quick-start-manager",
    title: "Quick start: team manager",
    category: "Quick start guides",
    summary: "Turn incoming requests into assigned, achievable work.",
    audience: "Managers and leads responsible for a delivery team",
    sections: [
      { title: "Check your access", bullets: [
        "Sign in with your join link and open your team's boards.",
        "You need edit rights there. Board settings and automations need the board's owner or an admin.",
        "Agree with the admin whether bookings come straight to your board or through Task Allocation.",
      ] },
      { title: "Plan an incoming task", figures: [
        { shot: "board-table", alt: "A team board in Main Table, grouped, with Status, PIC and Due date columns" },
      ], steps: [
        "Read the Brief, the deliverables and the requester. Ask if anything is unclear.",
        "Check the team's load in the Workload view.",
        "Set the PIC, priority, due date and status.",
        "Give each deliverable an owner and a date.",
        "Post the plan as an update: who makes it, who reviews it, what done means.",
      ] },
      { title: "Every day", bullets: [
        "Look for overdue, stuck, undated and unassigned work.",
        "Keep decisions in the task's updates.",
        "Tick deliverables off as they go. Close with a status that means done.",
        "Let automations chase deadlines and stuck work.",
      ] },
      { title: "Escalate with a decision to make", paragraphs: ["Bring the admin the ticket, the problem, what it changes, and what you recommend. Record the decision as an update."] },
    ],
    related: ["workflow", "tasks", "views", "assets", "automations", "dashboard", "quick-start-admin"],
  },
  {
    id: "start",
    title: "Start here",
    category: "Getting started",
    summary: "Find your way around the workspace.",
    audience: "Everyone",
    sections: [
      { title: "Your first visit", figures: [
        { shot: "home", alt: "Workspace home with the portal links, favourite boards, recent work and activity" },
      ], steps: [
        "Open your join link, set a password, and complete your profile. If an admin must approve you, you wait until they do.",
        "Home: your links, favourite boards, recent work and activity.",
        "My Work lists your tasks; the Inbox your notifications.",
        "Teams and boards are in the sidebar. Star the ones you use.",
      ] },
      { title: "Where to go", table: { headers: ["Place", "For"], rows: [
        ["Home", "Links, favourites, recent work."],
        ["My Work", "Every task you are PIC on, by due date."],
        ["Inbox / Messages", "Notifications; direct conversations."],
        ["Dashboard", "Output, workload and requests, against last year."],
        ["Automations", "Rules that run on their own."],
        ["Portal and Booking", "The Guest portal and booking links; book work."],
        ["Teams / Boards / Trackers / Docs", "Where work, records and pages live."],
        ["Settings", "Workspace setup, appearance, snapshots, and this guide."],
      ] } },
      { title: "Find anything", bullets: [
        "Ctrl+K or Ctrl+F (⌘K or ⌘F on a Mac) searches tasks, boards, teams and people.",
        "Type a ticket, such as CP_014, or just its number.",
        "A green dot on someone's picture means they have Streamline open.",
        "In several workspaces? Switch from the name at the top of the sidebar. Your account, profile and departments are shared.",
      ] },
      { title: "Your profile", figures: [
        { shot: "profile", alt: "A profile page with details and figures for open, overdue and done work" },
      ], bullets: [
        "Account menu → Your profile → Edit: name, job title, department, timezone, work hours and photo.",
        "Change password sits under your email. Your other devices are signed out.",
        "Its figures open the lists they count, such as Overdue tasks.",
        "Ask an admin to change your email.",
      ] },
    ],
    related: ["quick-start-stakeholder", "quick-start-admin", "quick-start-manager", "workflow", "my-work"],
  },
  {
    id: "workflow",
    title: "From request to delivery",
    category: "Getting started",
    summary: "The path every request takes, who owns each step, and when it moves on.",
    audience: "Requesters, coordinators, team leads, and contributors",
    sections: [
      { title: "The journey", figures: [
        { shot: "task-journey", alt: "A task's journey: booked, sent back, allocated, in progress, done, with time at each stage", caption: "Each task's journey shows every stage and how long it took." },
      ], table: { headers: ["Stage", "Who", "Moves on when…"], rows: [
        ["Book", "Requester", "Brief, deliverables, department and date are clear."],
        ["Allocate", "Admin or allocator", "It is on the board of the team doing it."],
        ["Plan", "Team lead", "PIC, dates, priority and deliverable owners are set."],
        ["Produce & review", "Contributors, reviewer", "Progress, feedback and final links are on the task."],
        ["Complete", "PIC or lead", "Deliverables are ticked and the status means done."],
      ] }, paragraphs: ["These are stages, not status labels: your board uses its own words."] },
      { title: "1. Book", bullets: [
        "The requester books on the form. Staff can book from Portal and Booking.",
        "The task arrives with its ticket, Brief, deliverables, department and requester.",
        "The service booked decides where it lands. See Booking.",
      ] },
      { title: "2. Allocate or send back", steps: [
        "Admin or allocator: read the request in Task Allocation.",
        "Something missing? Send back; the requester answers on their own form.",
        "Otherwise Allocate to → team → board. Same task, same ticket.",
      ], note: { title: "Allocation is a move", text: "Linking tasks across boards is something else: see Linked tasks." } },
      { title: "3. Plan", steps: [
        "Team lead: set the PIC, priority, and a due date the team can meet.",
        "Give each deliverable an owner and a date.",
        "Check workload, then post the plan as an update.",
      ] },
      { title: "4. Produce and review", bullets: [
        "Work from My Work. Read the updates before changing anything.",
        "Move the status as the work moves. Blocked? Set the stuck status and say why.",
        "Post review links as updates; reviewers reply on the task.",
        "Put final links on the deliverables.",
      ] },
      { title: "5. Close", steps: [
        "Tick off the last deliverables.",
        "Set a status whose meaning is done. A label called Done is not enough on its own.",
        "Post a final update: what was delivered, and where.",
        "Archive it when it should leave the board.",
      ] },
      { title: "6. Review the week", bullets: [
        "Dashboard: overdue, stuck, due soon, waiting for allocation.",
        "Compare with last year using the same measure and period.",
        "Even out workload by changing owners or dates.",
      ] },
      { title: "Example", paragraphs: ["A department books a poster and six social tiles: one task, two deliverable lines, seven units. It arrives as CP_014, goes to the creative team's board, gets a PIC and review dates, and closes when both lines are ticked and the status means done."] },
    ],
    related: ["booking", "assets", "dashboard", "links"],
  },
  {
    id: "boards",
    title: "Teams and boards",
    category: "Managing work",
    summary: "Set up a board and its team, and save layouts as templates.",
    audience: "Contributors, team leads, and administrators",
    sections: [
      { title: "Teams, boards, and groups", figures: [
        { shot: "board-table", alt: "A board in Main Table with coloured groups of tasks" },
      ], bullets: [
        "A team groups people, boards, trackers and docs.",
        "A board holds tasks; groups are its sections.",
        "Seeing a board does not always mean you can edit it. See Roles and access.",
      ] },
      { title: "Create a board", steps: [
        "Create board: a name, a team or Private, and a template: Blank or one saved here.",
        "Every board has the special columns: Status, PIC, Requester, Due date, Timeline, Priority, Department, Size, Assets recap, Brief. Add others as needed.",
        "Name and order the groups. Board settings → Landing group is where tasks from other boards arrive.",
        "Check what each status label means: done, stuck or in progress.",
      ] },
      { title: "Team settings", bullets: [
        "Open from a team's menu in the sidebar, or Settings → Teams. Tabs: General, Access, Members, Bookings.",
        "Access (admins): Who can see and Who can edit, for every board that follows the team.",
        "Bookings: where the team's bookings land.",
        "Archive team hides it. Delete team… can take its boards with it; there is no undo.",
      ] },
      { title: "Templates", bullets: [
        "Save as template… in a board's menu. Pick what comes with it: groups, columns, automations, task names, colour and icon.",
        "A template never copies values, tickets or deliverables.",
        "Saving under a name already taken saves over that template.",
      ] },
      { title: "Day to day", bullets: [
        "Star boards to keep them under Favourites.",
        "Select several tasks to move, duplicate, archive, delete or allocate them. The bar that appears can undo the last change.",
        "View only, in the board menu, locks it against slips. It does not change who may edit.",
        "Removing a special column only takes it off the board. Add its type back and the values return.",
        "Hiding a column is display only, not privacy.",
      ] },
      { title: "Archive and delete", paragraphs: ["Archived work stays recoverable in the board's archive. Deleting a board is permanent: you type its name to confirm. Task Allocation and the Admin team are built in and cannot be archived or deleted."] },
    ],
    related: ["permissions", "tasks", "views", "automations"],
  },
  {
    id: "tasks",
    title: "Tasks, fields, and subitems",
    category: "Managing work",
    summary: "Open a task, fill in its fields, and close it properly.",
    audience: "Board editors and task owners",
    sections: [
      { title: "Open a task", figures: [
        { shot: "task-panel", alt: "A task open in the side panel beside the board" },
        { shot: "task-popup", alt: "A task open in the pop-up: the feed on the left, its columns on the right" },
      ], bullets: [
        "Click a task to open it beside the board, or choose Open in pop-up.",
        "Side panel or Pop-up is a board setting, next to Hide.",
        "The pop-up: updates and history in one feed on the left; description, columns, links and subitems on the right.",
        "The journey button shows the task's story from booking to archive.",
      ] },
      { title: "Create a task", steps: [
        "Add it at the foot of a group, with a name that says what it is.",
        "Set the PIC, priority and due date.",
        "Add subitems for steps, and deliverables for outputs.",
        "Post the next action as an update.",
      ] },
      { title: "Special fields", table: { headers: ["Field", "Means"], rows: [
        ["Status", "Where the work is. Each label means done, stuck or in progress."],
        ["PIC", "Who is in charge. Feeds My Work and Workload."],
        ["Requester", "Who asked. Bookings fill it in."],
        ["Due date / Timeline", "The deadline; the start and end."],
        ["Priority", "Four steps, the same on every board."],
        ["Department", "Who it is for, from Settings → Departments."],
        ["Size", "A T-shirt size, XS to XL. See Views."],
        ["Assets recap", "A summary of the deliverables."],
        ["Brief", "The booking's brief. Download it as Word from its pop-up."],
      ] } },
      { title: "Other fields", table: { headers: ["Field", "Holds"], rows: [
        ["Text / Long text / Rich text", "A line, a note, or a formatted document."],
        ["Dropdown", "One of a list. Style sets its look."],
        ["People", "People with no part in the work, such as a contact."],
        ["Date / Time / Date + Time", "A moment that is not a deadline."],
        ["Countdown", "Time left. Type 45m, 3d 4h or 2mo."],
        ["Last updated", "Who last changed it, and when."],
        ["Button", "A few steps in one press: set a status, assign you, move it, post an update."],
        ["Number / Checkbox / Link / Tags", "A number, a tick, a web address, or labels."],
        ["Dependency", "Tasks on this board it waits for."],
      ] } },
      { title: "When is it finished?", paragraphs: ["When its status label means done. The board's owner sets meanings in Edit labels. Deliverables are ticked separately: check both."] },
      { title: "Tickets", bullets: [
        "A ticket such as CP_014 is the task's quotable code. Add a ticket gives any task the next one.",
        "Click it to copy; double-click to type one.",
        "A ticket gives nobody access.",
      ] },
    ],
    related: ["assets", "collaboration", "views", "sharing"],
  },
  {
    id: "views",
    title: "Views, search, and filters",
    category: "Managing work",
    summary: "Six ways to see a board, saved views, and finding work that seems missing.",
    audience: "Everyone who uses boards",
    sections: [
      { title: "One board, six views", figures: [
        { shot: "board-kanban", alt: "Kanban with lanes by status and cards showing PIC and due date" },
        { shot: "board-timeline", alt: "Gantt with bars, dependencies and baseline lines" },
      ], table: { headers: ["View", "Best for"], rows: [
        ["Main Table", "Editing, groups, subitems, bulk actions."],
        ["Kanban", "Moving cards between lanes."],
        ["Timeline", "Spans of work side by side."],
        ["Calendar", "Due dates by month or week."],
        ["Gantt", "Schedules, dependencies, slip against a baseline."],
        ["Workload", "Who has what, week by week."],
      ] }, paragraphs: ["Every view edits the same tasks."] },
      { title: "Find and focus", bullets: [
        "Search the board by name or ticket. Ctrl+K searches everything.",
        "Sort / Filter is one button: the sort is its first row. Filters combine.",
        "Clear them before deciding a task is missing.",
      ] },
      { title: "Kanban", bullets: [
        "Lanes by picks the lanes. Rows splits each lane by person, priority, group or a dropdown.",
        "Drag a card into any cell to change both.",
        "Double-click a lane's name to rename it; drag its header to reorder.",
        "Days in status: amber from a week, red from two.",
      ] },
      { title: "Gantt baselines", steps: [
        "When the plan is agreed, open Baseline and save one.",
        "Each bar shows the plan as a thin line, and a chip such as +3d when it has slipped.",
        "Replace, hide or clear it from the same menu.",
      ] },
      { title: "Workload and capacity", figures: [
        { shot: "board-workload", alt: "Workload by person and week, hours against capacity" },
      ], bullets: [
        "Measure: Tasks, or Hours vs capacity.",
        "Hours come from deliverables at their output rates, shared between owners.",
        "Capacity is each person's hours a week in Members (38 when empty).",
        "Hover a person or a cell for details.",
      ] },
      { title: "T-shirt sizes", bullets: [
        "Settings → Sizes says what each size means in working time.",
        "A task's size picker shows the size its assets fit. Set to applies it.",
        "Follow assets keeps it in step as assets change.",
      ] },
      { title: "Saved views", steps: [
        "Set up the view, filters, sort and hidden columns.",
        "Views button → Save as new view. Board editors can share it with the board.",
        "A change marks it Edited: Save, Discard changes, or Save as new view.",
        "Default view is what the board shows with nothing else open. Editors can save it for everyone.",
      ], note: { title: "Hidden columns", text: "With a saved view open, hiding a column hides it in that view only." } },
      { title: "If a view looks empty", bullets: [
        "Undated tasks have no place on a timeline or calendar.",
        "Workload and person lanes read the PIC column.",
        "Check the archive, and that you opened the right board.",
      ] },
    ],
    related: ["boards", "tasks", "troubleshooting"],
  },
  {
    id: "assets",
    title: "Deliverables",
    category: "Managing work",
    summary: "Track each output of a task: quantity, owner, date, and done.",
    audience: "Contributors and delivery leads",
    sections: [
      { title: "Task, deliverable, unit", figures: [
        { shot: "task-assets", alt: "A task's Assets tab with deliverable lines, owners, dates and ticks" },
      ], bullets: [
        "A task is the work. A deliverable line is one output; its quantity is the units.",
        "A poster and six social tiles: two lines, seven units.",
        "Deliverables are records, not files: add preview and final links.",
      ] },
      { title: "Keep them current", steps: [
        "Open the task's Assets tab and add a line.",
        "Set its type, quantity, owners, due date, size, and links.",
        "Drag lines into production order.",
        "Tick each one off when delivered.",
      ] },
      { title: "Handy to know", bullets: [
        "To-do shows only the lines that are yours.",
        "An owner on a line is added to the task's PIC. Board settings → Assets changes that.",
        "Linked tasks share one set of deliverables.",
        "Assets recap counts done, total quantity, overdue and owners. A line with no quantity counts as one.",
        "Output rates, in Settings → Asset & Work types, turn quantities into estimated hours. An estimate, not a timesheet.",
      ] },
      { title: "Long lists: use a tracker sheet", paragraphs: ["Choose Tracker, beside Block, then a sheet or New tracker for this task. The sheet's rows count like any other asset. See Trackers."] },
    ],
    related: ["tasks", "trackers", "settings", "dashboard"],
  },
  {
    id: "links",
    title: "Linked tasks across boards",
    category: "Managing work",
    summary: "Connect tasks on different boards and choose what stays in sync.",
    audience: "Board editors and cross-team coordinators",
    sections: [
      { title: "When to link", paragraphs: ["When two boards track the same work. Each task stays on its own board. Allocation is different: it moves the task."] },
      { title: "Link two tasks", steps: [
        "In the task, choose Link item and pick a task on another board.",
        "Choose which side wins where they differ.",
        "Choose what syncs: switch fields on or off, or pair columns by hand.",
      ] },
      { title: "What syncs", table: { headers: ["Content", "Behaviour"], rows: [
        ["Name, description, ticket", "Synced unless switched off."],
        ["Special columns", "Paired by type."],
        ["Other columns", "Paired by name and type, or by hand."],
        ["Status and dropdown labels", "A label the other board lacks is added there."],
        ["Deliverables", "Always shared."],
        ["Updates and replies", "Posted to both, unless switched off."],
      ] } },
      { title: "If linking fails", paragraphs: ["A task cannot link to itself, its subitem, a task on the same board or in another workspace, or Task Allocation."] },
    ],
    related: ["tasks", "assets", "workflow"],
  },
  {
    id: "automations",
    title: "Automations",
    category: "Managing work",
    summary: "Rules that do the routine follow-up, even when nobody has the app open.",
    audience: "Board owners, team leads, and admins",
    sections: [
      { title: "How a rule works", figures: [
        { shot: "automations", alt: "A board's automations, each card with its switch and last run" },
      ], paragraphs: ["When something happens, Only if something is true, Then do something. Rules run on the server, nights and weekends included."], table: { headers: ["Part", "Examples"], rows: [
        ["When", "A task is added, moved or changed; a date arrives; a column sits unchanged; on a schedule."],
        ["Only if", "A column's value, the group, who did it, the time."],
        ["Then", "Notify, post an update, set a value, assign, move, shift a date, create a task, archive, call a webhook."],
      ] } },
      { title: "Start from a recipe", steps: [
        "Open Automations in the sidebar, or the lightning button on a board.",
        "Pick a recipe, such as a reminder two days before a deadline.",
        "Choose the board, check the rule, and save. Its card's switch turns it off.",
      ] },
      { title: "Write your own", steps: [
        "New automation, then the board.",
        "Fill in When, Only if and Then. The whole rule reads out above as you build it.",
        "Chips add the task name, board, ticket, who did it, today, or a column to messages.",
        "Save. A name is optional.",
      ] },
      { title: "Only at certain times", figures: [
        { shot: "automation-time", alt: "The rule builder with Only if → the time → is between Friday 17:00 and Monday 09:00" },
      ], bullets: [
        "Only if → the time: is before, is after, is between, or is not between.",
        "Any day, or in the week: before Sunday 17:00; between Friday 17:00 and Monday 09:00.",
        "Read at the moment of the change, in the workspace's time.",
      ] },
      { title: "Quick runs and buttons", bullets: [
        "A quick run is a saved set of actions you fire by hand, on up to 50 tasks. You need edit rights.",
        "Board managers add toolbar buttons from the arrow beside New item: run a quick run, open a saved view or a link, or act on selected tasks.",
      ] },
      { title: "Is it working?", bullets: [
        "The Automations page says whether the runner is live.",
        "Each card shows its last run. Activity says why a run was skipped.",
        "A rule never notifies the person who caused it: test with a colleague.",
        "Chains stop after three rules in a row.",
      ] },
    ],
    related: ["boards", "collaboration", "quick-start-admin"],
  },
  {
    id: "booking",
    title: "Booking and task allocation",
    category: "Requests and sharing",
    summary: "Book work, see where it lands, allocate or send it back, and shape the form.",
    audience: "Requesters, allocators, and admins",
    sections: [
      { title: "Book a task", figures: [
        { shot: "booking-essentials", alt: "The Essentials step of the booking form" },
        { shot: "booking-confirm", alt: "The Confirm step: the request, brief and assets to check before booking" },
      ], steps: [
        "Open the booking link, Book a task on the Guest portal, or Portal and Booking in the app.",
        "Essentials: name, email, department, title, date, and kind of work. Signed in, your details are filled in.",
        "Brief and Assets: the questions for that work, and each output with type, quantity and size.",
        "Confirm: check, then book.",
      ] },
      { title: "The receipt", figures: [
        { shot: "booking-receipt", alt: "The receipt: ticket, the team's reply, Download PDF, and Follow your request" },
      ], bullets: [
        "It shows the ticket, the team's reply, and Download PDF.",
        "Follow your request links to the task, when the form offers it (see On the ticket).",
        "A known email is that person; a new one is added as a pending member. A booking never renames anyone.",
      ] },
      { title: "Where bookings land", bullets: [
        "Each service's Bookings go to: Task Allocation, a team's board, any board, or Auto-allocation by work type.",
        "On Task Allocation they arrive in Booked by Form. It takes new bookings only: nothing can be moved back into it.",
        "On other boards they arrive in the board's landing group.",
        "Admins are notified of every booking.",
      ] },
      { title: "Allocate", figures: [
        { shot: "allocation-menu", alt: "A booked task's menu: Allocate to and Send back stand out at the top" },
      ], steps: [
        "Open the booked task's menu. Allocate to and Send back sit at the top.",
        "Allocate to → team → board. Several at once from the bulk bar.",
        "It moves with its ticket, brief, deliverables and department.",
      ], paragraphs: ["Task Allocation is for admins and the allocators they add in its Board settings → Members."] },
      { title: "Send back for what's missing", figures: [
        { shot: "send-back-dialog", alt: "The Send back dialog: a note of what's missing and what happens to the task" },
        { shot: "sent-back-row", alt: "A task on the board showing the Sent back chip in place of its status" },
      ], steps: [
        "On a booked task nobody has started: Send back, in its menu or the button in the task.",
        "Say what's missing. Copy the link and send it to the requester; the app sends no email.",
        "The task locks until they answer or you Recall send back. Updates can still be posted.",
        "Its status becomes Waiting, then goes back to the board's first status when they answer.",
      ], bullets: [
        "The link works once, for 14 days.",
        "The requester must change something before Send again works. A reply alone is not enough.",
        "No update is posted for sending back or recalling. The activity shows it with your note; the journey keeps every round.",
        "Reset booking, above Archive in a booked task's menu on Task Allocation, puts it back exactly as booked: name, description, brief, columns and asset lines. Subitems go; updates stay. It asks first and cannot be undone.",
      ] },
      { title: "Shape the form", figures: [
        { shot: "form-editor", alt: "The booking form editor on the Brief step, with services and their questions" },
      ], steps: [
        "Admins: Portal and Booking → Edit form on the Booking form card.",
        "Edit the four steps: Essentials, Brief, Assets, Confirm.",
        "For each service: its work types, its questions, and Bookings go to.",
        "Questions: short, long, link, single or multiple choice, or an Acknowledgement. Reuse them from Saved blocks.",
        "Preview to try it; nothing is sent.",
        "Publish current form. Until then bookers see the live form; Undo changes drops your edits.",
      ] },
      { title: "On the ticket", bullets: [
        "Confirm step → On the ticket: the reply shown after booking, and Also show: Download PDF, Past bookings of this email, Link to the task.",
        "Link to the task opens the task read-only, with no sign-in. One link for the task's life; it still works once allocated or archived.",
        "Switching it off closes every link it gave out.",
        "Past bookings of this email lets anyone who types an email see that person's bookings.",
      ] },
      { title: "Saved forms", figures: [
        { shot: "saved-forms-overwrite", alt: "The Saved forms list, each form with a save icon beside it" },
      ], bullets: [
        "Pick a saved form to load it. Save as a new form keeps what is in the editor.",
        "With no saved form picked, each one in the list has a save icon: it saves the editor over that form, after a warning.",
        "Saving over one never changes the published form or its scheduled days.",
        "Publish or schedule a saved form chooses which form is live, and on which days.",
        "Past forms lists every form published; re-publish any of them.",
      ] },
    ],
    related: ["workflow", "portal", "sharing", "boards"],
  },
  {
    id: "portal",
    title: "The portal",
    category: "Requests and sharing",
    summary: "The Guest portal for departments, and the Internal portal for the team.",
    audience: "Administrators and department coordinators",
    sections: [
      { title: "Portal and Booking", figures: [
        { shot: "portal-booking", alt: "Portal and Booking: the Guest portal and Booking form cards, each with switch, settings, Open and copy" },
      ], bullets: [
        "Two cards, Guest portal and Booking form, each with its switch, settings, Open and copy.",
        "Closing the Guest portal closes the booking form too.",
        "The gear opens each link's settings: name, theme, columns, what it opens on, and the page shown while the form takes no requests.",
        "Save each dialog; Discard drops your changes.",
        "Members can open and copy the links; only admins change them.",
      ] },
      { title: "The Guest portal", figures: [
        { shot: "guest-portal", alt: "The Guest portal: whose work to show, team, period, and the requests" },
      ], bullets: [
        "One link for the whole workspace. No account needed.",
        "Visitors choose whose work to show, a team, and a period, or search for a ticket across every date.",
        "Open a request for its brief, status, deliverables, updates and journey.",
        "Book a task books more.",
      ] },
      { title: "What visitors see", bullets: [
        "Requests with a department, or booked through the form: title, ticket, status, dates, PIC, deliverables, brief, updates, journey.",
        "Never descriptions, contact details, deliverable notes, or links.",
        "Hiding a column tidies the page; it does not control access.",
        "To stop access, close the portal.",
      ] },
      { title: "The Internal portal", figures: [
        { shot: "internal-portal", alt: "The Internal portal: every team's work in one place" },
      ], bullets: [
        "Every team's work in one place, for admins and allocators.",
        "Open it from the Guest portal card, or from Home.",
        "It ignores the Guest portal's settings, and shows Sent back on boards you can edit.",
      ] },
    ],
    related: ["booking", "sharing", "settings"],
  },
  {
    id: "sharing",
    title: "Sharing boards, tasks, and reports",
    category: "Requests and sharing",
    summary: "Pick the right link, check what it shows, and stop it when you are done.",
    audience: "Board owners and administrators",
    sections: [
      { title: "Which link", table: { headers: ["Link", "For"], rows: [
        ["Board or task address", "Getting around; the reader needs access."],
        ["Board share", "A read-only board."],
        ["Task share", "A read-only task."],
        ["Task link", "The requester's link, from the receipt."],
        ["Dashboard share", "A read-only dashboard; admins only."],
        ["Guest portal", "Departments following and booking work."],
        ["Join link", "Joining the workspace; not for sharing work."],
      ] } },
      { title: "Share a board or task", steps: [
        "Share by link… in the board or task menu; switch it on.",
        "Choose who can open it: signed-in members, or anyone with the link.",
        "Add a password or an end date if needed.",
        "Open it to check, then pass it on. A new link stops the old one.",
      ] },
      { title: "The shared task page", figures: [
        { shot: "task-link-page", alt: "A shared task page laid out like the pop-up, with its ⋯ menu open" },
      ], bullets: [
        "A task share and a receipt's task link open the same page, laid out like the pop-up.",
        "⋯ → Copy link.",
        "Open in its board: when you are signed in and can see the board; its archive once archived.",
        "Open in the portal: while the portal is open and shows the task.",
        "Show hidden columns: on that page only.",
        "Nothing done there is saved back.",
      ] },
      { title: "Display is not access", paragraphs: ["Hidden columns, filters and views only change what is shown. A board share carries descriptions, updates and deliverables: check it before sharing outside the team. A dashboard share carries figures and names only."] },
    ],
    related: ["permissions", "portal", "booking", "dashboard"],
  },
  {
    id: "my-work",
    title: "Plan your day with My Work",
    category: "Personal work",
    summary: "Every task you are in charge of, by due date.",
    audience: "Contributors",
    sections: [
      { title: "What it shows", figures: [
        { shot: "my-work", alt: "My Work: tasks under Overdue, Today, This week, Later and No date" },
      ], bullets: [
        "Every task you are PIC on, across boards: overdue, today, this week, later, no date.",
        "Linked copies show once.",
        "Filter by board, status, priority, date or type; search by task, person or board.",
        "Owning a deliverable does not make you PIC.",
      ] },
      { title: "A daily routine", steps: [
        "Inbox first: what needs a reply.",
        "My Work: confirm the next action and date for each priority task.",
        "Update statuses and dates as the day changes.",
        "Before you finish: record progress and tick off deliverables.",
      ] },
      { title: "A task is missing", bullets: [
        "Right account and workspace?",
        "In the PIC column, not just People or Requester?",
        "Check the done and no-date sections, and the archive.",
      ] },
    ],
    related: ["tasks", "collaboration", "views", "mobile"],
  },
  {
    id: "collaboration",
    title: "Updates, Inbox, and Messages",
    category: "Personal work",
    summary: "Keep decisions on the task and choose what interrupts you.",
    audience: "All workspace members",
    sections: [
      { title: "Updates and replies", bullets: [
        "Post updates for decisions, progress and reviews. Type @ to mention someone.",
        "@all tells everyone in the workspace, @task the people on the task, @board the board's members.",
        "A mention in a task's description tells the person too, once.",
        "Reply under an update to keep the thread together.",
        "React with an emoji instead of replying. Hover a reaction to see who.",
        "Edit your own updates. Delete with the bin, then Delete? to confirm.",
        "On linked tasks, updates and replies reach both unless switched off.",
      ] },
      { title: "Activity", figures: [
        { shot: "task-activity", alt: "A task's activity, with asset, column and people names as links" },
      ], bullets: [
        "Activity lists every change to the task.",
        "An asset's name opens the task's Assets tab.",
        "A column's name opens the task with that field in view.",
        "The requester's name opens their profile.",
      ] },
      { title: "The Inbox", figures: [
        { shot: "inbox", alt: "The Inbox with Notifications and Updates tabs" },
      ], steps: [
        "Notifications: what needs you. Updates: quieter news.",
        "Open the task before acting.",
        "Mark all read or Clear to keep it tidy.",
        "Notification settings: how each kind of event reaches you.",
      ] },
      { title: "Follow and star", bullets: [
        "The bell on a board or task follows it. Tick the changes you want to hear about.",
        "The star on a task keeps it in My Work → Starred.",
      ] },
      { title: "Notification choices", table: { headers: ["Choice", "Result"], rows: [
        ["Notify", "A badge, and a browser notification if switched on."],
        ["Update", "A quiet entry in Updates."],
        ["Off", "Nothing."],
        ["Mute a board", "Stops its events; your access is unchanged."],
      ] } },
      { title: "Browser notifications", bullets: [
        "Notification settings → Notifications on this device. Allow it when the browser asks.",
        "Send a test to check.",
        "They need a Streamline tab open.",
      ] },
      { title: "Messages", paragraphs: ["Messages are direct conversations. Hover a face for a card. Put any decision back on the task."] },
    ],
    related: ["my-work", "tasks", "links", "members"],
  },
  {
    id: "dashboard",
    title: "Dashboard and reporting",
    category: "Reporting and records",
    summary: "Output, attention, workload, and requests, against last year.",
    audience: "Team leads and workspace managers",
    sections: [
      { title: "One report", figures: [
        { shot: "dashboard", alt: "The dashboard: headline figures, output by month, work types and attention panels" },
      ], paragraphs: ["Built from the boards you can see: headline figures against last year, output by month, team and type, requests by department, what needs attention, and who carries what."] },
      { title: "Set it up", steps: [
        "Choose the period: year so far, a year, half, quarter, or all time.",
        "Choose the teams.",
        "Choose the measure: tasks, deliverable units, or estimated effort.",
        "The settings menu picks which date places work in time, and hides panels.",
      ] },
      { title: "Panels worth knowing", table: { headers: ["Panel", "Shows"], rows: [
        ["Work types", "Deliverables by kind of work, against last year."],
        ["Aging work", "Open tasks by how long they have sat in their status."],
        ["Departments", "Open, waiting, turnaround, on time and sent back, per department."],
      ] }, paragraphs: ["Each panel's ? explains it. Click a slice or band for its tasks."] },
      { title: "The measures", table: { headers: ["Measure", "Means"], rows: [
        ["Tasks", "Top-level work, linked copies once. Requests in Task Allocation count as requests."],
        ["Deliverable units", "Quantities; a line with none counts as one."],
        ["Effort", "Estimated hours from output rates, not time spent."],
        ["Unavailable", "Nothing to compare with; not zero."],
      ] } },
      { title: "Compare carefully", bullets: [
        "Last year is matched day by day.",
        "Under five, a change shows no percentage.",
        "People with different access see different totals.",
        "Missing dates, types, rates or owners skew the figures.",
      ] },
    ],
    related: ["assets", "settings", "sharing", "workflow"],
  },
  {
    id: "trackers",
    title: "Trackers and spreadsheet files",
    category: "Reporting and records",
    summary: "Spreadsheet-style workbooks, asset sheets for tasks, and Excel files.",
    audience: "Workspace members maintaining structured records and asset lists",
    sections: [
      { title: "When to use a tracker", figures: [
        { shot: "trackers", alt: "A tracker sheet with typed columns, bands and a summary row" },
      ], bullets: [
        "Run sheets, logs and long asset lists.",
        "Boards are for assigned work and conversations.",
        "Members other than guests can edit trackers.",
      ] },
      { title: "Create one", steps: [
        "Trackers → create a workbook, or import an Excel file.",
        "Set each column's type: text, long text, dropdown, date, link, number, checkbox or people.",
        "Add rows, bands to group them, and summaries at the foot.",
        "It saves a moment after you stop. Wait for the indicator before leaving.",
      ] },
      { title: "Editing", bullets: [
        "Double-click a tab, a header, or the name to rename it.",
        "Drag a column's edge to resize; double-click it to fit.",
        "Drag tabs to reorder. Duplicate sheet copies rows; Duplicate layout copies only columns.",
        "Two people can edit at once; changes merge cell by cell.",
      ] },
      { title: "Use a tracker sheet for a task's assets", steps: [
        "In the sheet, choose Use for a task. Or on the task's Assets tab, choose Tracker, then a sheet, New sheet, or New tracker for this task.",
        "Pick the task. One sheet per task, one task per sheet.",
        "In Task assets, match columns to parts: name, type, quantity, PIC, due date, done. Pick columns on the sheet lets you click them.",
        "A value the same for every row can be given once instead of a column.",
        "Check the count, then Use for this task.",
      ], note: { title: "Counted like any other asset", text: "Rows count in the recap, My Work, Workload and the dashboard. Change them on the task or in the sheet. Unlinking leaves the rows in the sheet." } },
      { title: "Rows and columns that don't fit", bullets: [
        "Repeated headers and totals are left out; section labels become bands.",
        "Mark rows decides by hand: Asset, Leave out, or Band.",
        "Dates typed as text, and counts like 3 pcs, are read as you would expect.",
        "A column that doesn't fit its part asks what to do: clear what it can't read, Choose another column, or New column.",
      ] },
      { title: "Moving, editing rights, deleting", bullets: [
        "Move into sheet, beside Added on this task, turns the task's other assets into rows.",
        "While a sheet holds a task's assets, only people who can edit the task can change it.",
        "Deleting the sheet asks whether to keep the assets on the task.",
      ] },
      { title: "Import and export", paragraphs: ["Export a workbook as .xlsx, or a sheet as CSV. Imports keep what trackers support; formulas arrive as their results, so keep the original."] },
    ],
    related: ["assets", "data", "permissions", "troubleshooting"],
  },
  {
    id: "docs",
    title: "Docs",
    category: "Reporting and records",
    summary: "Pages beside a team's boards, from scratch or from Word, Markdown, or PDF.",
    audience: "Workspace members writing guidelines, processes, and meeting outcomes",
    sections: [
      { title: "When to use a doc", figures: [
        { shot: "docs", alt: "A doc with headings, a to-do list and the block menu open" },
      ], bullets: [
        "Writing that belongs to a team: guidelines, processes, meeting notes.",
        "Everyone but guests can write them.",
        "Decisions about one task belong in its updates.",
      ] },
      { title: "Make one", steps: [
        "New doc on the Docs page, or Add new → Doc in a team's menu.",
        "Start blank, or upload a file.",
        "Give it a title. Click the icon above the title for an emoji.",
        "The doc's ⋯ menu moves it, brings in a file, or deletes it.",
      ] },
      { title: "Write", bullets: [
        "Type / for blocks: headings, lists, to-dos, quotes, code, dividers.",
        "Markdown works as you type: #, -, [], >.",
        "Select text to format it.",
        "It saves as you pause. Wait for Unsaved or Saving to clear before leaving.",
      ] },
      { title: "Bring in a file", bullets: [
        "Word (.docx), Markdown, text or HTML becomes an editable page.",
        "A PDF stays as it is: read only, with Download PDF.",
        "Images and complex layouts don't come across.",
      ] },
    ],
    related: ["trackers", "boards", "data"],
  },
  {
    id: "members",
    title: "Members and onboarding",
    category: "Administration",
    summary: "Add people, edit their details, and handle leavers.",
    audience: "Workspace owners and administrators",
    sections: [
      { title: "Add people", figures: [
        { shot: "members", alt: "The Members page with filters, roles, hours and statuses" },
      ], steps: [
        "Members → Add member: email, name, job title, department, role, teams.",
        "Copy their join link and send it yourself.",
        "They show as Pending onboarding until they set a password.",
      ] },
      { title: "One join link for everyone", bullets: [
        "Add member also holds the Join link, for anyone to sign themselves up.",
        "Replacing it stops the old one working.",
        "With Admins approve each sign-up on, press Approve on Members. Decline is in the row's menu.",
      ] },
      { title: "Edit someone", bullets: [
        "Edit info, in the row's ⋯ menu: name, job title, department, timezone, work hours, email.",
        "Hours: hours a week, for Workload (38 when empty).",
        "Only Owners change an Owner. Only the person changes their own photo and password.",
        "From other workspaces lists people you can Add.",
        "Someone new who books is added as pending, so the task can name them.",
      ] },
      { title: "Someone leaving", steps: [
        "Reassign their open tasks and deliverables.",
        "Deactivate here closes this workspace to them. Their name stays on past work.",
        "Also in other workspaces? Remove from workspace takes them out of this one only.",
        "Replace any links they should no longer hold.",
      ] },
      { title: "Remove completely", paragraphs: ["Deletes their account and history: updates, reactions, messages, activity. Their work passes to you. Type their name to confirm; a snapshot is taken first. Owners can remove anyone but an Owner; admins only people in no other workspace."] },
      { title: "View as", paragraphs: ["Admins can preview what someone else sees. Anything you change is still done by you."] },
    ],
    related: ["permissions", "collaboration", "sharing"],
  },
  {
    id: "permissions",
    title: "Roles and access",
    category: "Administration",
    summary: "Workspace roles, board access, and why an edit may be unavailable.",
    audience: "Everyone; especially board owners and administrators",
    sections: [
      { title: "Workspace roles", table: { headers: ["Role", "Can"], rows: [
        ["Owner", "Everything an admin can, in every workspace, plus workspaces, Owners and snapshots."],
        ["Admin", "Members, teams and access, settings, Task Allocation, the portal and form, the danger zone."],
        ["Member", "Create boards and teams, edit trackers, work where they are editors."],
        ["Guest", "Only boards they are invited to."],
      ] } },
      { title: "Board access", paragraphs: ["Board roles are Owner, Editor and Viewer. Everyone else is decided by Who can see and Who can edit: set for all of a team's boards in Team settings → Access, or for one board in Board settings → Access."], table: { headers: ["Setting", "Who"], rows: [
        ["Who can see: Everyone in the workspace", "Every member can view."],
        ["Who can see: Only <team>", "The team and people added. The team is hidden from others."],
        ["Who can see: Only people added", "Its owner, people added, and admins."],
        ["Who can edit", "Only people added, the team's members, or everyone who can see it."],
        ["Workspace admin", "Editor, plus management."],
        ["Deactivated", "None."],
      ] } },
      { title: "Common surprises", bullets: [
        "Task Allocation is for admins and the allocators they add.",
        "The Admin team holds Owners and admins only.",
        "Being in a board's team lets you edit only when Who can edit says so.",
        "Share links and the portal never give edit access.",
        "Running a quick run needs edit rights; changing automations needs the board's owner or an admin.",
        "Hiding a column, archiving a team or muting a board changes nobody's access.",
      ] },
      { title: "Sort out an access problem", steps: [
        "Check the account, the workspace, and that the membership is active.",
        "Ask the board's owner or an admin to check board members, then the Access tab of the board or its team.",
        "For editing, ask for an editor role; a share link will not do it.",
      ] },
    ],
    related: ["members", "boards", "sharing"],
  },
  {
    id: "settings",
    title: "Settings",
    category: "Administration",
    summary: "What each part of Settings does, and who can change it.",
    audience: "Administrators and anyone checking workspace configuration",
    sections: [
      { title: "Settings directory", table: { headers: ["Section", "Purpose"], rows: [
        ["Overview", "Counts, the workspace name, and its shared-link description."],
        ["Tickets", "The ticket prefix."],
        ["Teams", "Create, edit, archive or delete teams."],
        ["Departments", "Who work is for. Shared by every workspace."],
        ["Asset & Work types", "Deliverable types, output rates, and the work types they belong to."],
        ["Sizes", "What each T-shirt size means in working time."],
        ["Roles", "What each workspace role can do."],
        ["Danger zone", "Wipe this workspace's board data. Admins and Owners."],
        ["Workspaces", "Every workspace and its Owners. Owners only."],
        ["Snapshots", "Save and restore every workspace. Owners only."],
        ["Appearance", "Your theme and display choices, on this device."],
        ["Guide / About", "This guide; the version and what's new."],
      ] } },
      { title: "Edit lists", steps: [
        "Open Departments or Asset & Work types as an owner or admin.",
        "Add, rename or recolour. A rename updates the work that uses it.",
        "Removing one asks what happens to its work: move it, or clear it.",
        "Save; until then it is a draft.",
      ] },
      { title: "Rates and work types", bullets: [
        "An output rate is how many of a type the team finishes in an hour, day or week. Types without one add no effort.",
        "Work types group asset types by kind of work, with a colour. A type can be in several.",
        "Work types are also what a booking service offers. Renaming one changes every form that uses it.",
      ] },
      { title: "Tickets", paragraphs: ["Changing the prefix asks whether to rewrite existing tickets. Numbers never change and are never reused."] },
    ],
    related: ["assets", "portal", "data", "members"],
  },
  {
    id: "data",
    title: "Saving, snapshots, and recovery",
    category: "Administration",
    summary: "Know when work is saved, and use snapshots safely.",
    audience: "All users; recovery actions for administrators",
    sections: [
      { title: "When work is saved", bullets: [
        "Board and task edits save straight away; an error shows if one fails.",
        "Trackers and docs save a moment after you stop typing.",
        "Settings and the booking form editor have their own Save or Publish.",
        "If the app warns about unsaved work, stay until it saves.",
      ] },
      { title: "When the connection drops", bullets: [
        "If the app can't reach the server, or you're offline, it covers the page and pauses editing so nothing is lost.",
        "It tries again on its own; Try now checks at once.",
        "Keep the tab open. Reloading won't help until the connection returns.",
      ] },
      { title: "Snapshots", steps: [
        "Owners: Settings → Snapshots → Take snapshot. It holds every workspace.",
        "Download one as a file, or upload one.",
        "Restore, then type RESTORE. The current state is saved first, so a restore can be undone.",
      ], note: { title: "A restore replaces everything", text: "Everything made since the snapshot is removed. Sign-in accounts and uploaded images are not included. Keep snapshot files private." } },
      { title: "The danger zone", paragraphs: ["Wipe all board data removes this workspace's boards, tasks and trackers for a clean start. Docs, settings, teams and people stay. It needs your password and takes a snapshot first."] },
      { title: "The local demo", paragraphs: ["The single-browser demo keeps its data in that browser. Reset demo data, in your account menu, puts the original data back."] },
    ],
    related: ["trackers", "settings", "troubleshooting"],
  },
  {
    id: "mobile",
    title: "Using Streamline on a phone",
    category: "Personal work",
    summary: "Find your way on a small screen.",
    audience: "People working away from their desktop",
    sections: [
      { title: "Find your way around", figures: [
        { shot: "mobile-board", alt: "A board on a phone, tasks as cards, tabs along the bottom", phone: true },
        { shot: "mobile-task", alt: "A task open full screen on a phone", phone: true },
      ], bullets: [
        "Five tabs along the bottom: Home, My Work, Browse, Inbox, More.",
        "Browse: teams, boards, trackers and docs. More: everything else.",
        "Search is in the top bar.",
      ] },
      { title: "Work on a board", steps: [
        "Tasks show as cards; switch to the grid for the table.",
        "Tap a status or date to change it.",
        "New item adds a task; Select acts on several.",
        "Tap a task's name to open it full screen.",
      ] },
      { title: "Add it to your home screen", paragraphs: ["From the browser's menu, add Streamline to your home screen (iPhone: Share → Add to Home Screen). It then opens full screen. On iPhone and iPad, browser notifications need this."] },
    ],
    related: ["my-work", "collaboration", "start"],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting and common questions",
    category: "Reference",
    summary: "Missing work, read-only screens, odd totals, failed saves, and dead links.",
    audience: "Everyone",
    sections: [
      { title: "I can't find a task", steps: [
        "Check the workspace, the board, your account, and whether you are in View as.",
        "Clear search and filters, go back to Main Table, and look in the archive.",
        "Search for its ticket or number.",
        "A booking may have gone straight to a team's board, or been allocated since.",
      ] },
      { title: "I can't edit", bullets: [
        "Who can edit, on the board or its team, may not include you. Ask the board's owner.",
        "A board in View only shows Unlock.",
        "A sent-back task is locked until the requester answers or it is recalled.",
        "Shares and the portal are always read-only.",
      ] },
      { title: "A column disappeared", paragraphs: ["A special column may have been removed: add its type back and its values return. Others may be hidden: check Hide."] },
      { title: "An automation didn't run", bullets: [
        "Is it switched on? Its Activity says why a run was skipped.",
        "It never notifies the person who caused it.",
        "Check the Automations page says the runner is live.",
      ] },
      { title: "The totals look wrong", bullets: [
        "Compare the same period, teams and measure.",
        "Check missing dates, types, quantities, rates and owners.",
        "Different access means different totals.",
      ] },
      { title: "Can't reach the server", bullets: [
        "Can't reach the server: no answer. The server is unavailable: usually maintenance. You're offline: your device.",
        "Check your connection, then wait or press Try now.",
        "When it clears, check your last change arrived before making it twice.",
      ] },
      { title: "A link no longer opens", bullets: [
        "Join links expire and are replaced when renewed.",
        "Share links can end or be replaced; the portal can be closed.",
        "A send-back link works once, for 14 days.",
        "A task link closes while the form's Link to the task is off.",
      ] },
      { title: "Report a bug", paragraphs: ["Report a bug is in your account menu, About, or More on a phone. Say what happened and add up to three screenshots."] },
      { title: "When asking for help", bullets: [
        "The board, the ticket, what you did, and what happened.",
        "Your browser or device, and the version from Settings → About.",
        "Never send passwords or links in a help request.",
      ] },
    ],
    related: ["permissions", "data", "dashboard", "automations"],
  },
  {
    id: "glossary",
    title: "Glossary and working conventions",
    category: "Reference",
    summary: "The words the app uses, and habits that keep it useful.",
    audience: "Everyone",
    sections: [
      { title: "Terms", table: { headers: ["Term", "Meaning"], rows: [
        ["Workspace", "The team's shared space."],
        ["Team", "People and boards with a shared responsibility."],
        ["Board / group", "Where work is kept / a section of it."],
        ["Task / subitem", "A piece of work / a step within it."],
        ["Ticket", "A task's quotable code, such as CP_014."],
        ["Special column", "A field every board has and the workspace reads, such as Status, PIC or Brief."],
        ["PIC", "The person or people in charge."],
        ["Requester", "Who asked for the work."],
        ["Deliverable / unit", "An output of a task / its quantity."],
        ["Task Allocation", "The intake board, for admins and allocators."],
        ["Booked by Form", "Where new bookings arrive on Task Allocation."],
        ["Allocation", "Moving a request to the team doing it."],
        ["Send back", "Asking the requester for what's missing, on their own form."],
        ["Task link", "A read-only link to a booked task, from the receipt."],
        ["Guest portal / Internal portal", "Departments' view of their work / every team's work, for admins and allocators."],
        ["Linked task", "A task on another board that shares fields and deliverables."],
        ["Automation / quick run", "A rule that runs on its own / actions fired by hand."],
        ["Template", "A saved board layout."],
        ["Saved form", "A booking form kept to load, publish or schedule."],
        ["Saved view", "A board's view, filters and columns under a name."],
        ["Baseline", "The Gantt's saved plan."],
        ["Work type", "Asset types grouped by kind of work."],
        ["Journey", "A task's story, with time at each stage."],
        ["Snapshot", "A saved copy of every workspace."],
      ] } },
      { title: "Working conventions", bullets: [
        "Every task has an outcome, a PIC and a date.",
        "Fields for planning, deliverables for outputs, updates for decisions.",
        "Check deliverables and status before closing.",
        "Quote a report with its period, teams and measure.",
      ] },
    ],
    related: ["start", "workflow", "tasks"],
  },
];


export function articleText(article: GuideArticle): string {
  return [article.title, article.category, article.summary, article.audience,
    ...article.sections.flatMap((section) => [section.title, ...(section.figures ?? []).map((figure) => figure.caption ?? figure.alt), ...(section.paragraphs ?? []), ...(section.steps ?? []), ...(section.bullets ?? []), ...(section.table?.headers ?? []), ...(section.table?.rows.flat() ?? []), section.note?.title ?? "", section.note?.text ?? ""]),
  ].join(" ");
}

const SEARCH_INDEX = GUIDE_ARTICLES.map((article) => ({ article, text: articleText(article).toLocaleLowerCase() }));

export function searchGuide(query: string): GuideArticle[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return SEARCH_INDEX.filter(({ text }) => terms.every((term) => text.includes(term))).map(({ article }) => article);
}

export function guideMarkdown(origin = ""): string {
  const lines = ["# Streamline user guide", "", "A practical guide to the workspace, with a detailed request-to-delivery workflow.", "", "## Contents", "", ...GUIDE_ARTICLES.map((article, index) => `${index + 1}. ${article.title}`), ""];
  for (const article of GUIDE_ARTICLES) {
    lines.push(`## ${article.title}`, "", article.summary, "", `For: ${article.audience}`, "");
    for (const section of article.sections) {
      lines.push(`### ${section.title}`, "");
      for (const figure of section.figures ?? []) lines.push(`![${figure.alt}](${origin}${guideShotPath(figure.shot)})`, ...(figure.caption ? [`*${figure.caption}*`] : []), "");
      for (const paragraph of section.paragraphs ?? []) lines.push(paragraph, "");
      if (section.steps) lines.push(...section.steps.map((step, index) => `${index + 1}. ${step}`), "");
      if (section.bullets) lines.push(...section.bullets.map((bullet) => `- ${bullet}`), "");
      if (section.table) {
        const row = (cells: string[]) => `| ${cells.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`;
        lines.push(row(section.table.headers), row(section.table.headers.map(() => "---")), ...section.table.rows.map(row), "");
      }
      if (section.note) lines.push(`> **${section.note.title}:** ${section.note.text}`, "");
    }
  }
  return lines.join("\n");
}
