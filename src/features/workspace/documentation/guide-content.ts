/** User-facing guidance, kept separate from rendering so the download and search
 * use the same copy. Verify behavior against feature/service code when updating;
 * the repository knowledge base holds the implementation detail. */
export interface GuideSection {
  title: string;
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
    summary: "Submit a clear brief, follow progress, and help the team deliver what you need.",
    audience: "Departments requesting creative or marketing work",
    sections: [
      { title: "Your part in the process", paragraphs: ["You explain the outcome, supply the inputs, and coordinate feedback. The admin routes requests across teams; the team manager agrees the delivery plan and assigns the people doing the work. Your first milestone is a submitted request with a ticket and a clear next contact."] },
      { title: "Before you start", bullets: [
        "Get the current portal or booking link from the team, plus its password if one is required. You do not need a workspace account to book or to follow your requests.",
        "Prepare the objective, audience, deliverables and quantities, the date you need it by, source copy, and reference links. Check that the team can open the linked files.",
        "Nominate the person who will consolidate feedback and confirm the final output on your side.",
      ] },
      { title: "Make your first request", steps: [
        "Open the portal and choose Book a task, or open the booking link the team gave you.",
        "Step 1, Details: your name and email, your department from the list, a title, when you need it, and the kind of work. If the workspace already knows your email, your name is filled in for you.",
        "Step 2, Brief: answer the questions for the kind of work you chose. Follow-up questions appear when an answer needs more detail.",
        "Step 3, Deliverables: list each item with its type, quantity and size or format. You can skip this step and describe them in the brief instead.",
        "Step 4, Confirm: check everything, change anything that is wrong, then book. Keep the receipt and its ticket, such as CP_014. If the response is unclear, ask the team whether it arrived before booking again.",
      ] },
      { title: "Follow progress and review the output", steps: [
        "Return to the portal, choose your department and a period, or search for your ticket or title. Open the request to read its brief, its status, its deliverables, the team's updates and its journey so far.",
        "Send consolidated feedback through the review channel agreed with the manager, quoting the ticket and which version you reviewed.",
        "If scope or timing changes, contact the manager with the change and its impact. Agree the revised plan before treating it as committed.",
        "When the final output arrives, check every requested deliverable and file link, then confirm acceptance or say what is still outstanding.",
      ] },
      { title: "You are ready when…", bullets: [
        "You have a ticket and know how to contact the receiving team.",
        "The manager has confirmed the scope, dates, and review contact.",
        "You know where to follow progress and provide feedback.",
      ], note: { title: "Getting this guide to departments", text: "This chapter lives in internal Settings. Admins can use Download guide and pass the department instructions to external readers; copying this chapter's internal link does not grant them workspace access." } },
    ],
    related: ["booking", "portal", "workflow"],
  },
  {
    id: "quick-start-admin",
    title: "Quick start: admin",
    category: "Quick start guides",
    summary: "Set up the workspace, equip team managers, and route incoming work.",
    audience: "Workspace owners and admins",
    sections: [
      { title: "Your part in the process", paragraphs: ["You establish who manages each team, give managers the access and structure they need, route work to the right team, and resolve priorities or capacity conflicts across teams. Managers own their team's daily assignments and delivery. Your first milestone is a named manager and a usable delivery board for every active team."] },
      { title: "Set up the workspace", steps: [
        "Open Members and add each manager and contributor with the right workspace role. Pass on the join link yourself; the app sends no email. People show as Pending onboarding until they join.",
        "Open Settings → Teams to create the teams, then add each team's people on its page. Agree a named manager and who covers for them.",
        "In Settings → Departments, list the departments you work for. Only these can be chosen on a booking or a task. In Settings → Asset types, list the deliverable types and their output rates.",
        "In Settings → Tickets, check the ticket prefix. Every task's ticket starts with it.",
        "For each team, choose where its bookings land: a receiving board, or Task Allocation for central triage.",
        "In Portal and Booking, shape the booking form in the Form Editor and publish it. Then open the portal, set each link's settings and password, and share the links.",
      ], note: { title: "Manager is a responsibility, not a workspace role", text: "Workspace roles are Owner, Admin, Member, and Guest. Team membership and board roles decide what a manager can do. Grant Admin only when someone needs workspace-wide administration." } },
      { title: "Route work and hand it to a manager", steps: [
        "Review Task Allocation for new requests. Clarify incomplete briefs and agree the receiving team with its manager.",
        "Allocate from the task's Allocation section, the row menu (Allocate to → team → board), or several at once from the bulk bar. The request moves; its ticket, brief, deliverables and department go with it.",
        "Ask the manager to confirm receipt, set the PIC and a feasible due date, and review the deliverables.",
      ] },
      { title: "Keep things running", bullets: [
        "Switch on a few automation recipes, such as a reminder two days before a deadline, from the Automations page.",
        "Save a well-set-up board as a template so new boards start the same way.",
        "Use the Dashboard with each manager: overdue, stuck and unallocated work, then workload by person and department.",
        "Take a snapshot before a large change, in Settings → Snapshots.",
        "When someone leaves, reassign their open work, then deactivate them in Members.",
      ] },
      { title: "You are ready when…", bullets: [
        "Every team has an agreed manager, a receiving board, and a clear intake route.",
        "The booking form is published, the portal is open, and departments know their link.",
        "Managers can edit the boards they run and know which decisions to bring to you.",
      ] },
    ],
    related: ["members", "permissions", "settings", "automations", "quick-start-manager"],
  },
  {
    id: "quick-start-manager",
    title: "Quick start: team manager",
    category: "Quick start guides",
    summary: "Turn accepted requests into assigned, achievable work and keep the admin informed.",
    audience: "Managers and leads responsible for a delivery team",
    sections: [
      { title: "Your part in the process", paragraphs: ["You own the team's delivery plan: clarify briefs, assign contributors, balance workload, coordinate reviews, and keep progress accurate. The admin supports workspace setup, central allocation, and decisions across teams. Your first milestone is one accepted task with a responsible person, agreed dates, and a clear review plan."] },
      { title: "Check your starting point", steps: [
        "Finish your join link and sign in. Open your team and its boards; ask the admin for any access you are missing.",
        "Check you can edit tasks. Board settings, members, automations and templates need board ownership or admin rights.",
        "Agree with the admin which work your team receives, and whether bookings arrive directly or through Task Allocation.",
        "Review the board's groups, status labels and their meanings, and its special columns: PIC, Due date, Department, Brief. Set up the views you plan with.",
      ] },
      { title: "Plan the first incoming task", steps: [
        "Open the request and read its Brief, deliverables, requester and department. Ask the requester if anything is unclear.",
        "Check the team's load in the Workload view or the Dashboard before accepting a date.",
        "Set the PIC, priority and due date, and a status that says where the work is.",
        "Open the deliverables and confirm types, quantities, owners and dates. Add subitems for separate steps.",
        "Post the plan as an update: who makes it, who reviews it, when feedback is due, and what counts as done.",
      ] },
      { title: "Keep delivery moving", bullets: [
        "Daily: review overdue, stuck, undated and unassigned work. Fix missing inputs and change owners or dates when the plan changes.",
        "During production: keep decisions in the task's updates and replies, and tick off deliverables as they are delivered.",
        "At handover: check every deliverable and link, tick the last ones off, and set a status whose meaning is done.",
        "Let automations do the chasing: reminders before deadlines, a nudge when something is stuck.",
        "Weekly: give the admin upcoming commitments, capacity gaps and decisions you need, from the same dashboard view.",
      ] },
      { title: "Escalate with a decision to make", paragraphs: ["When you need the admin's help, include the ticket, the issue, its effect on scope or dates, the option you recommend, and when a decision is needed. Record the outcome as an update on the task. A request still in Task Allocation is the admin's to allocate; ask them to move it to your board."] },
      { title: "You are ready when…", bullets: [
        "Accepted tasks have an owner, an achievable date, and clear deliverables.",
        "Contributors know their next action and the review arrangement.",
        "The admin can see accurate progress and knows which decisions require their help.",
      ] },
    ],
    related: ["workflow", "tasks", "assets", "automations", "dashboard", "quick-start-admin"],
  },
  {
    id: "start",
    title: "Start here",
    category: "Getting started",
    summary: "Understand the workspace, find your work, and get ready for your first task.",
    audience: "Everyone",
    sections: [
      { title: "What Streamline is for", paragraphs: [
        "Streamline brings the team's requests, planning, deliverables, and conversations into one workspace. Departments book work through the portal; the team plans and delivers it on boards; automations do the routine follow-up; the dashboard shows what is being delivered and who is carrying it.",
        "The board is where work is kept. My Work, the board views, the dashboard, and the portal show that same work to different people. Keeping owners, dates, statuses, departments, and deliverables accurate is what makes all of them useful.",
      ] },
      { title: "Your first visit", steps: [
        "Open your join link, set your password, and complete your profile. You cannot sign in until you have. If the link has expired, ask an admin for a new one.",
        "Open My Work to see your tasks, then the Inbox for notifications and updates. Open a task to see its board and everything about it.",
        "Browse your teams and boards in the sidebar, and star the ones you use. On a phone, Browse holds the directory and More holds everything else.",
        "Open your profile to check your details and department, and set how you want to be notified from the Inbox.",
      ] },
      { title: "Where to go", table: { headers: ["Destination", "Use it for"], rows: [
        ["Home", "Recently visited boards, your work, your teams, and what is happening."],
        ["My Work", "Every task you are PIC on, across boards, by due date."],
        ["Inbox / Messages", "Notifications and updates, or a direct conversation."],
        ["Dashboard", "Output, workload, and requests, against last year."],
        ["Automations", "Rules that run on their own, and what they have done."],
        ["Portal and Booking", "Book work; admins also run the portal and edit the booking form."],
        ["Teams / Boards / Trackers", "Plan and deliver work; keep spreadsheet-style records."],
        ["Settings", "Workspace setup, your appearance, snapshots, and this guide."],
      ] } },
      { title: "Find anything", paragraphs: ["Press Ctrl+K or Ctrl+F (⌘K or ⌘F on a Mac) to search tasks, boards, teams, and people. Type a ticket such as CP_014, or just its number, to jump to that task. Hover over anyone's face to see who they are."] },
      { title: "Read this guide by role", bullets: [
        "Departments, admins, and team managers: start with your Quick start guide at the top of this page.",
        "Contributors: read the workflow, tasks, deliverables, and My Work.",
        "Team leads: add boards, views, automations, linked work, and the dashboard.",
        "Admins: read members, roles, the portal and booking, settings, and data and recovery.",
      ] },
    ],
    related: ["quick-start-stakeholder", "quick-start-admin", "quick-start-manager", "workflow"],
  },
  {
    id: "workflow",
    title: "From request to delivery",
    category: "Getting started",
    summary: "A complete operating workflow with owners, handoffs, completion checks, and exceptions.",
    audience: "Requesters, coordinators, team leads, and contributors",
    sections: [
      { title: "The journey", paragraphs: ["Book → allocate → plan → produce → review → complete → report. These are working stages, not required status labels; your board can use its own words. Each task's journey dialog shows how long it spent at each stage."], table: { headers: ["Stage", "Responsible person", "Ready to move on when…"], rows: [
        ["Book", "Requester", "The brief, deliverables, department, and date are clear."],
        ["Allocate", "Admin", "The request is on the board of the team doing it."],
        ["Plan", "Team lead", "A PIC, achievable dates, a priority, and deliverable owners are set."],
        ["Produce & review", "Contributors / reviewer", "Progress, feedback, and final links are recorded on the task."],
        ["Complete & report", "PIC / lead", "Deliverables are ticked off and the status means done."],
      ] } },
      { title: "1. Book the work", steps: [
        "Requester: open the portal and choose Book a task, or use the booking link. Signed-in staff can book from Portal and Booking.",
        "Choose the kind of work, then answer the brief's questions. Describe the purpose, the audience, the channels, and the result you need.",
        "List each deliverable with its type, quantity, and size or format.",
        "Book once, and keep the receipt and its ticket. If the response fails or is unclear, check with the team before booking again.",
      ] },
      { title: "2. Where it lands", paragraphs: ["The kind of work decides where a booking goes: straight to a team's receiving board, or to Task Allocation, the admins' intake board. The task arrives with its ticket, its brief in the Brief column, its deliverables, its department, and the requester as a person. Admins are notified of every booking."] },
      { title: "3. Allocate", steps: [
        "Admin: open Task Allocation and read the request.",
        "Allocate it from the task's Allocation section, the row menu, or several at once from the bulk bar. It shows Moving… until it has left the queue.",
        "The task moves to the first group of the chosen board, keeping its ticket, brief, deliverables, and department. Tell the team lead it has arrived.",
      ], note: { title: "Allocation is a move", text: "The same task continues on the team's board. Linking tasks across boards is a separate feature, described in Linked tasks." } },
      { title: "4. Turn the brief into a plan", steps: [
        "Team lead: set the PIC, the priority, and the due date or timeline the team can meet.",
        "Check the deliverables: type, quantity, owner, and date for each. Add subitems for separate steps.",
        "Check the team's workload before committing. Note approvals or inputs you are waiting for in an update.",
        "Post the plan: scope, milestones, the reviewer, and what counts as done. Set the status that says work can start.",
      ] },
      { title: "5. Produce and keep progress current", steps: [
        "Contributor: start from My Work, and read the task's updates before changing anything.",
        "Move the status as the work moves, and tick deliverables off as each is delivered.",
        "If you are blocked, set the stuck status, explain why in an update, and mention the person who can help.",
        "When dates or scope change, change the fields and say why in a reply.",
      ] },
      { title: "6. Review and hand over", steps: [
        "PIC: post the review link and version in an update, and say what feedback you need.",
        "Reviewer: reply on the task so feedback stays with it. Summarise any decision made elsewhere.",
        "Contributor: make the changes, add the final links to the deliverables, and record the approval.",
        "Check the requester can open the final files and that every deliverable was supplied. They can see progress on the portal.",
      ] },
      { title: "7. Close the work", steps: [
        "Tick off the last deliverables, checking quantities and types.",
        "Set a status whose meaning is done. A label called Done without that meaning does not count as finished.",
        "Post a final update: what was delivered, where it is, and any exclusions.",
        "Archive the task when it should leave the board. You can find and restore it in the board's archive.",
      ] },
      { title: "8. Review the team's week", steps: [
        "Lead: open the Dashboard. Start with what needs attention: overdue, stuck, due soon, and waiting for allocation.",
        "Compare output with the same period last year, in tasks, deliverable units, or estimated effort. Keep the same measure and period when you compare.",
        "Check workload by person and department for the next weeks, and change owners or dates on the boards where it is uneven.",
        "Agree next actions with named owners and dates.",
      ] },
      { title: "Example: a campaign launch", paragraphs: ["A department books one poster and six social assets. The booking lands in Task Allocation with ticket CP_014 and two deliverable lines. The admin allocates it to the creative team's board. The lead sets a PIC and review dates, and gives each deliverable an owner. Contributors post drafts as updates and reply to feedback. At handover both lines are ticked off and the status is set to one whose meaning is done. It is one task with seven deliverable units, not seven tasks."], bullets: [
        "If the deadline changes: change the task and its deliverables, and explain the impact in a reply.",
        "If the board is wrong: ask the admin to allocate or move it rather than re-creating the task.",
        "If another team needs its own task: link the tasks and choose which fields sync.",
        "If feedback is still outstanding: keep a review status rather than marking it done.",
      ] },
    ],
    related: ["booking", "assets", "dashboard", "links"],
  },
  {
    id: "boards",
    title: "Teams and boards",
    category: "Managing work",
    summary: "Set up a useful board, organize groups, use templates, and manage a board's lifecycle.",
    audience: "Contributors, team leads, and administrators",
    sections: [
      { title: "Choose the right structure", paragraphs: ["A workspace contains teams, people, boards, and trackers. A team groups related people and boards. A board holds tasks; groups organize rows within it. Create boards around a delivery responsibility, a campaign, or an ongoing process, and use groups for stages or batches.", "Being able to see a board does not always let you edit it. Workspace-visible boards give members viewing access; the board's owner can make you an editor."] },
      { title: "Set up a board", steps: [
        "Choose Create board, give it a name, pick a team and who can see it, and choose a template: Blank, or one your workspace saved.",
        "Every board starts with the special columns the workspace reads: Status, PIC, Requester, Due date, Timeline, Priority, Department, Size, Assets recap, and Brief. Add any other columns the work needs.",
        "Create or rename groups and put them in order. The first group is where bookings and allocated requests arrive.",
        "Check the status labels and what each one means: done, stuck, or in progress.",
        "Add a sample task and look at it in the views your team will use.",
      ] },
      { title: "Templates", bullets: [
        "Save any board's layout from its menu with Save as template…, or from Create board. Choose what comes with it: groups, column settings, widths and hidden columns, automations, task names, and its colour and icon.",
        "A template never copies what tasks hold: no values, tickets, or deliverables.",
        "Saving with a name that is already taken saves over that template. The person who saved it, or an admin, can delete it.",
      ] },
      { title: "Maintain the board", bullets: [
        "Star boards you use; they appear under Favourites.",
        "Search and filters narrow what you see without changing the tasks.",
        "Hiding a column is presentation only; it is not a way to keep information private.",
        "Removing a special column only takes it off the board. Add its type back from the column picker and its values return.",
        "Select several tasks to move, duplicate, archive, delete, or allocate them together. The last rename, add, move, archive, or duplicate can be undone from the bar that appears.",
        "Duplicate a board to copy its groups, columns, and tasks. Its deliverables, automations, and tickets are not copied.",
      ] },
      { title: "Archive, restore, and delete", paragraphs: ["Archive finished work when it should leave the board but stay recoverable; the board's archive lists it for search and restore. Archive board, in the board menu, archives the whole board. Deletion is permanent: you type the board's name to confirm. Task Allocation and the Admin team are built in and cannot be archived or deleted, whatever they are called."] },
    ],
    related: ["permissions", "tasks", "views", "automations"],
  },
  {
    id: "tasks",
    title: "Tasks, fields, and subitems",
    category: "Managing work",
    summary: "Create and maintain a task, understand field types, and record completion correctly.",
    audience: "Board editors and task owners",
    sections: [
      { title: "Create a task people can act on", steps: [
        "Add a task at the foot of the right group and give it a name that says what it is.",
        "Open it and add the purpose, scope, and output in the description or its fields.",
        "Set the PIC, priority, and due date or timeline.",
        "Add subitems for smaller steps, and deliverables for each output you will hand over.",
        "Post the next action as an update.",
      ] },
      { title: "Special fields", table: { headers: ["Field", "What it means"], rows: [
        ["Status", "Where the work is. Each label can mean done, stuck, or in progress."],
        ["PIC", "The person or people in charge. Feeds My Work and workload."],
        ["Requester", "Who asked for the work. Bookings fill it in."],
        ["Due date / Timeline", "The deadline, and the start and end. Overdue, calendars, and the Gantt read them."],
        ["Priority", "Four steps, the same on every board."],
        ["Department", "Who the work is for, from Settings → Departments."],
        ["Size", "A relative estimate: XS, S, M, L, or XL."],
        ["Assets recap", "A summary of the task's deliverables."],
        ["Brief", "The booking's brief as a formatted document. Download it as a Word file from its pop-up."],
      ] } },
      { title: "Other fields", table: { headers: ["Field", "What it holds"], rows: [
        ["Text / Long text / Rich text", "A line, a note, or a formatted document."],
        ["Dropdown", "One of a list of choices, like a status without meanings."],
        ["People", "People with no part in the work, such as a contact."],
        ["Date / Time / Date + Time", "A day, a time, or both, that is not a deadline. Format sets how they read."],
        ["Countdown", "Time left until a moment. Type 45m, 3d 4h, or 2mo. Format sets its style and when it turns amber."],
        ["Number / Checkbox / Link / Tags", "A number, a tick, a web address, or labels."],
        ["Dependency", "Tasks on this board this one waits for."],
      ] } },
      { title: "The task panel", bullets: [
        "Click a task to open it beside the board, or choose Open in pop-up to open it over the board. Drag the panel's edge to make it narrow, normal, or wide.",
        "The name comes first. Below it: the ticket, who created it, and a summary of its deliverables.",
        "Overview has the description, every column as a row you can reorder or hide from the panel, linked tasks, and subitems.",
        "Updates holds the conversation, Assets the deliverables, Activity every change.",
        "The journey button shows the task's story from booking to archive, with the time spent in each status.",
      ] },
      { title: "What counts as finished", paragraphs: ["A task is complete when its status label has the done meaning. Naming a label Done, Approved, or Delivered does not give it that meaning; the board's owner sets it in Edit labels. Deliverables are ticked off separately, so check both when closing work."] },
      { title: "Tickets", paragraphs: ["A ticket such as CP_014 is a task's quotable code: bookings get one, and any task can take the next one with Add a ticket. Click it to copy it; double-click to type one. A ticket is a label, not a password: it gives nobody access. Search finds a task by its ticket or just its number."] },
    ],
    related: ["assets", "collaboration", "sharing"],
  },
  {
    id: "views",
    title: "Views, search, and filters",
    category: "Managing work",
    summary: "Choose among seven board views and find work that seems to be missing.",
    audience: "Everyone who uses boards",
    sections: [
      { title: "One board, seven views", table: { headers: ["View", "Best used for", "Check first"], rows: [
        ["Main Table", "Detailed editing, groups, subitems, and bulk actions.", "Visible columns, search, filters, and sort."],
        ["Kanban", "Moving cards between lanes.", "What the lanes are: status, priority, person, group, or a dropdown."],
        ["Timeline", "Seeing work spans side by side.", "Tasks without a timeline or due date."],
        ["Calendar", "Due dates by month or week.", "The month shown."],
        ["Gantt", "Schedules, subitems, and dependencies.", "Dates and dependency values."],
        ["Workload", "Who has what, week by week.", "The PIC column."],
        ["Chart", "Counts, sums, and deliverable units.", "What it is split by and what it measures."],
      ] } },
      { title: "Find and focus work", steps: [
        "Choose a view from the view menu. Switching views changes how the same tasks are shown, nothing else.",
        "Use the board's search for a task's name or ticket, or Ctrl+K for the whole workspace.",
        "Filter by person, status, priority, group, tags, or due date. Different filters combine: a task must match all of them.",
        "Sort by any column. Empty cells go last.",
        "Clear search, filters, and sort before deciding a task is missing.",
      ] },
      { title: "If a view looks empty", bullets: [
        "Go back to Main Table and search the task's name. Open its group or parent.",
        "Undated tasks have no place on a timeline or calendar.",
        "Workload and person lanes read the PIC column.",
        "Look in the board's archive, and check you opened the right board.",
        "If someone else sees different work, compare access and filters first.",
      ], note: { title: "Views edit the same task", text: "Changing a card, date, or cell in any view changes the task itself. A view is not a separate copy." } },
    ],
    related: ["boards", "tasks", "troubleshooting"],
  },
  {
    id: "assets",
    title: "Deliverables",
    category: "Managing work",
    summary: "Track outputs: quantities, owners, deadlines, completion, and effort estimates.",
    audience: "Contributors and delivery leads",
    sections: [
      { title: "Task, deliverable, and unit", paragraphs: ["A task is a piece of work. A deliverable line describes one output within it, and its quantity says how many units it is. A campaign with a poster (quantity 1) and social tiles (quantity 6) has two lines and seven units.", "Deliverables are records, not uploaded files: use their preview and final artwork links to point to the files. Subitems are steps of the work, separate from deliverables."] },
      { title: "Keep the deliverables current", steps: [
        "Open the task's Assets tab and add a deliverable.",
        "Open it to set its type, quantity, owners, due date, and size or format, and its preview and final links.",
        "Reorder lines into production order.",
        "Tick each line off when it is delivered, checking the quantity delivered.",
      ] },
      { title: "The recap", paragraphs: ["The Assets recap summarises the deliverables: how many are done, the total quantity, what is overdue, and who owns them. A line without a quantity counts as one. Done lines are left out of overdue and next due. To change the recap, change the deliverables."] },
      { title: "Estimated effort", paragraphs: ["Admins set an output rate for each deliverable type in Settings → Asset types. The dashboard multiplies quantities by those rates to estimate effort. It is an estimate, not a timesheet, and types without a rate add nothing."], note: { title: "Linked tasks share their deliverables", text: "Tasks linked across boards share one set of deliverables: a line added on either shows on both, and ticking it off on one ticks it off everywhere." } },
    ],
    related: ["tasks", "settings", "dashboard"],
  },
  {
    id: "links",
    title: "Linked tasks across boards",
    category: "Managing work",
    summary: "Connect tasks on different boards and know exactly what stays in sync.",
    audience: "Board editors and cross-team coordinators",
    sections: [
      { title: "When to use a link", paragraphs: ["Link tasks when two boards track the same work and should share fields, deliverables, and the conversation. Each task stays on its own board. A link is different from a dependency, a share link, and allocation, which moves a request."] },
      { title: "Set up the link", steps: [
        "Open the task, choose Link item, and pick a task on another board in the workspace.",
        "Choose which side's values win where they differ.",
        "Open Choose what syncs to switch fields on or off, and pair columns by hand where the names differ.",
        "Agree in an update who maintains which fields.",
      ] },
      { title: "What syncs", table: { headers: ["Content", "Behavior"], rows: [
        ["Name, description, ticket", "Synced unless switched off."],
        ["Special columns", "Status, PIC, Requester, Due date, Timeline, Priority, Department, Size, and Brief pair by type."],
        ["Other columns", "Paired by name and a compatible type, or by hand."],
        ["Status and priority", "Matched by label name; a label missing on the other board is skipped."],
        ["People", "A column that takes one person keeps the first."],
        ["Deliverables", "Always shared."],
        ["Updates", "Posting can go to linked tasks too; replies stay on their own task."],
      ] } },
      { title: "If linking fails", paragraphs: ["A task cannot link to itself, its own subitem, a task on the same board, a task in another workspace, or Task Allocation, and a chain of links cannot hold two tasks from one board. For a value that does not arrive, check what syncs, the column pairing, and the label names."] },
    ],
    related: ["tasks", "assets", "workflow"],
  },
  {
    id: "automations",
    title: "Automations",
    category: "Managing work",
    summary: "Let rules do the routine follow-up, even when nobody has the app open.",
    audience: "Board owners, team leads, and admins",
    sections: [
      { title: "How a rule works", paragraphs: ["A rule reads like a sentence: when something happens, only if something is true, then do something. It runs on the server from a queue the database keeps, so it fires at night, at weekends, and when every laptop is shut."], table: { headers: ["Part", "Examples"], rows: [
        ["When", "A task is added, renamed, moved, archived, or restored; a column changes, is set to a value, or is cleared; someone is assigned; a number crosses a line; an update mentions a word; a date arrives; a column sits unchanged; every day, weekday, week, or month at a time."],
        ["Only if", "A column is, is not, is empty, contains, is before or after, is overdue; the task is in a group; who did it; task or subitem."],
        ["Then", "Notify people, post an update, set or clear a value, assign or unassign, move to a group, shift a date, add tags, create a task or subitem, duplicate, archive, restore, or call a webhook."],
      ] } },
      { title: "Start from a recipe", steps: [
        "Open Automations from the sidebar, or the lightning button on a board.",
        "Pick a recipe, such as a reminder two days before a deadline, chasing overdue work, raising anything stuck, or a weekly review task.",
        "Choose the board, check the rule, and save. Switch it off any time from its card.",
      ] },
      { title: "Write your own", steps: [
        "Choose New automation and pick the board.",
        "Choose what it waits for, add conditions if it should not always act, and add up to ten things to do.",
        "Use placeholders in messages and names: {item}, {board}, {group}, {ticket}, {actor}, {today}, and {column:Name}.",
        "Save. The rule is named after what it does unless you give it a name.",
      ] },
      { title: "Quick runs", paragraphs: ["A quick run is a saved set of actions you fire by hand. On a board's Automations, open Quick runs, pick one, choose up to 50 tasks, and run it. You need to be able to edit the board."] },
      { title: "Is it working?", bullets: [
        "The Automations page says whether the runner is live, and warns when nothing has run for twenty minutes.",
        "Each rule's card says when it last ran and how many times. Activity lists every run, with the reason for anything skipped.",
        "A board with a rule running shows a ring on its lightning button.",
        "A rule that notifies people never tells the person who caused it, so test it with a colleague.",
        "Chains of rules stop after three in a row, so two rules cannot undo each other forever.",
      ] },
    ],
    related: ["boards", "collaboration", "quick-start-admin"],
  },
  {
    id: "booking",
    title: "Booking and task allocation",
    category: "Requests and sharing",
    summary: "Book work, understand where it lands, move queued work to a team, and shape the form.",
    audience: "Requesters, coordinators, and administrators",
    sections: [
      { title: "Book a task", steps: [
        "Open the portal and choose Book a task, the booking link, or Portal and Booking inside the app.",
        "Details: your name, email, and department, a title, when you need it, and the kind of work. A known email fills in its name; signed in, your own details are filled in, and Booking for someone else? clears them.",
        "Brief: the questions for the kind of work you chose.",
        "Deliverables: each output with its type, quantity, and size or format.",
        "Confirm: review and book. The receipt shows the ticket.",
      ] },
      { title: "Who the requester is", paragraphs: ["The requester is a person on the task. Booking while signed in, it is you. From a public link, a known email is that person; a new one is added as a pending member, whom an admin can later invite with a join link. A booking never renames anyone already in the member list; the name typed is used only for someone new."] },
      { title: "Where bookings go", paragraphs: ["The kind of work decides: straight to a team's receiving board, or to Task Allocation, the admins' intake board. The task arrives in the board's first group with its ticket, its brief in the Brief column, its deliverables, its department, and the requester. Admins are notified.", "Task Allocation is for owners and admins only. Team members work from their own boards once a request is allocated."] },
      { title: "Allocate a queued task", steps: [
        "Open Task Allocation and read the request.",
        "Allocate it from the task's Allocation section, from the row menu (Allocate to → team → board), or several at once from the bulk bar.",
        "The task shows Moving… until it has left the queue, then arrives on the board with its ticket, brief, deliverables, department, and due date.",
      ] },
      { title: "Shape the booking form", steps: [
        "Admins: open Portal and Booking → Form Editor.",
        "Edit each step: the details asked for, the kinds of work (each with its own questions, sub-services, and the team it goes to), the deliverables step, and the confirmation.",
        "Use Preview to try it; nothing is sent.",
        "Save templates of the form, and reusable question blocks.",
        "Publish when ready, with a name. Until then, bookers see the published form. The editor shows the published form's name, its questions, and how many tasks were booked since.",
      ] },
      { title: "Tickets, errors, and follow-up", bullets: [
        "The ticket is for talking about a request. It is not a password.",
        "If a link stops working, ask the team for the current one.",
        "If a booking seems to fail after sending, ask whether it arrived before booking again.",
        "A booked date is a request, not a reservation. Agree dates with the team.",
      ] },
    ],
    related: ["workflow", "portal", "boards"],
  },
  {
    id: "portal",
    title: "The portal",
    category: "Requests and sharing",
    summary: "Run the shared portal and help departments follow work and book requests.",
    audience: "Administrators and department coordinators",
    sections: [
      { title: "One portal for every department", paragraphs: ["The portal shows departments the work being done for them, and lets them book more, without a workspace account. There is one link for the whole workspace; visitors choose a department and a period. A department filter is a way to browse, not a private link."] },
      { title: "Set up the portal", steps: [
        "Keep the department list current in Settings → Departments, and set each task's Department.",
        "Open Portal and Booking. Switch the portal on, and add a password if it needs one.",
        "Open each link's settings with its gear: for the portal, the team name, the opening view, the default period, the theme, and which columns show; for the booking form, whether it takes requests, its theme, its headline and lead, the sign-in offer, and its size.",
        "Save each dialog; Discard throws its changes away.",
        "Open both links to check what visitors see, then share them. New link replaces both links if they spread too far.",
      ] },
      { title: "Help a department find work", steps: [
        "Open the portal link, with its password if asked.",
        "Choose the department and a period, from the last week to all time, or search for a ticket or title. Search looks across every date.",
        "Switch the view or grouping, and open a request for its brief, status, deliverables, updates, and journey.",
        "Use Book a task to book more. Any department on the list can book, even one with no requests yet.",
      ] },
      { title: "What visitors can and cannot see", bullets: [
        "They see requests that carry a department or were booked through the portal: title, ticket, status, dates, PIC, deliverables, the brief, the team's updates, and the journey.",
        "They never see descriptions, contact details, deliverable notes, or links.",
        "Hiding a column tidies the page; it is not an access control.",
        "Close the portal or issue a new link to stop access.",
      ] },
    ],
    related: ["booking", "sharing", "settings"],
  },
  {
    id: "sharing",
    title: "Sharing boards, tasks, and reports",
    category: "Requests and sharing",
    summary: "Choose the right kind of link, review its audience, and revoke access when needed.",
    audience: "Board owners and administrators",
    sections: [
      { title: "Choose the right link", table: { headers: ["Link", "Purpose"], rows: [
        ["Board or task address", "Moving around the workspace; the reader needs access."],
        ["Board share", "A read-only view of a board."],
        ["Task share", "A read-only view of one task."],
        ["Dashboard share", "A full-screen, read-only dashboard; admins only."],
        ["Portal", "Departments following and booking work."],
        ["Join link", "Onboarding a member; not for sharing work."],
      ] } },
      { title: "Share a board or task", steps: [
        "Choose Share by link from the board or task menu.",
        "Choose who can open it: signed-in members of the workspace, or anyone with the link.",
        "Add a password or an end date if you need one.",
        "Open the link to check what it shows before you pass it on.",
        "Stop sharing when it is no longer needed. A new link stops the old one working.",
      ] },
      { title: "Share the dashboard", paragraphs: ["Admins can share the dashboard as a full-screen, read-only link with an optional password and end date. It carries figures and names, not descriptions, notes, emails, or links, and refreshes every minute."] },
      { title: "Presentation is not access control", paragraphs: ["A hidden column, a filter, or a view is a display choice. A board share carries the board's descriptions, updates, and deliverables, so check a board before sharing it outside the team. A ticket gives nobody access."] },
    ],
    related: ["permissions", "portal", "dashboard"],
  },
  {
    id: "my-work",
    title: "Plan your day with My Work",
    category: "Personal work",
    summary: "Review your tasks, prioritize deadlines, and keep your day connected to the board.",
    audience: "Contributors",
    sections: [
      { title: "A daily routine", steps: [
        "Open the Inbox and read what needs a reply. Open the task to see the whole conversation first.",
        "Open My Work: overdue, today, this week, later, and no date.",
        "Open each priority task, read its updates, and confirm the next action and date.",
        "Update statuses and dates as the day changes. If something cannot meet its date, say so and involve the lead.",
        "Before you finish, record progress, tick off delivered deliverables, and mark finished tasks done.",
      ] },
      { title: "What My Work shows", paragraphs: ["Every task where you are the PIC, across the boards you can open, sorted by due date. Linked copies of the same work show once. Filter by board, status, priority, due date, or type, and search by task, person, or board. Being the owner of a deliverable does not make you the task's PIC."] },
      { title: "If a task is missing", bullets: [
        "Check you are signed in as yourself, in the right workspace.",
        "Check you are in the task's PIC column, not just People or Requester.",
        "Check the completed and no-date sections, and whether it was archived.",
      ] },
    ],
    related: ["tasks", "collaboration", "views"],
  },
  {
    id: "collaboration",
    title: "Updates, Inbox, and Messages",
    category: "Personal work",
    summary: "Keep decisions on the task and choose which events should interrupt you.",
    audience: "All workspace members",
    sections: [
      { title: "Updates and replies", bullets: [
        "Post an update on a task for briefs, decisions, progress, reviews, and handovers. Type @ to mention a colleague; they are notified.",
        "Reply under an update to keep a conversation together. The person who posted the update hears about replies.",
        "Collapse a conversation to one line by clicking its header, or collapse them all. Long threads show the latest replies first.",
        "React with an emoji to acknowledge something without another reply. Hover a reaction to see who reacted.",
        "You can edit your own updates. To delete one, click the bin, then Delete? to confirm.",
        "Posting can go to linked tasks too; replies stay on their own task.",
      ] },
      { title: "Read and act on the Inbox", steps: [
        "Open the Inbox: Notifications for what needs you, Updates for quieter news.",
        "Open the task to see its current state before acting.",
        "Act, reply on the task, and use Mark all read or Clear to keep the Inbox tidy.",
        "Open Notification settings to choose how each kind of event reaches you.",
      ] },
      { title: "Notification choices", table: { headers: ["Choice", "What happens"], rows: [
        ["Notify", "A badge, and a browser notification if you switched those on."],
        ["Update", "A quiet entry in Updates."],
        ["Off", "Nothing."],
        ["Mute a board", "Stops its events reaching you; your access does not change."],
      ] } },
      { title: "Browser notifications", steps: [
        "In Notification settings, switch on Notifications on this device and allow them when the browser asks.",
        "Send a test. If it does not appear, allow notifications for the site in the browser.",
        "Keep a Streamline tab open; closing it stops browser notifications.",
      ] },
      { title: "Messages and profiles", paragraphs: ["Use Messages for a direct conversation with a colleague. Hover over anyone's face or name for their card; open their profile for their open work. When a message changes a task's scope or date, record the outcome on the task."] },
    ],
    related: ["my-work", "tasks", "members"],
  },
  {
    id: "dashboard",
    title: "Dashboard and reporting",
    category: "Reporting and records",
    summary: "Read output, attention, workload, and requests with the right measure and period.",
    audience: "Team leads and workspace managers",
    sections: [
      { title: "One report", paragraphs: ["The dashboard is one page, worked out from the boards you can see: headline figures against the same period last year, output by month, by team, and by deliverable type, requests by department, what needs attention now, and who is carrying what. Names lead to people's profiles and team pages."] },
      { title: "Set it up", steps: [
        "Choose the period: the whole year so far, a year, a half, a quarter, or all time.",
        "Choose the teams, or keep everyone.",
        "Choose the measure: tasks, deliverable units, or estimated effort (effort needs output rates).",
        "From the settings menu, choose which date places work in time, and hide panels you do not need.",
      ] },
      { title: "Understand the measures", table: { headers: ["Measure", "Meaning"], rows: [
        ["Tasks", "Top-level work, with linked copies counted once. Requests still in Task Allocation are counted as requests, not delivery."],
        ["Deliverable units", "Quantities of deliverables; a line with no quantity counts as one."],
        ["Effort", "Estimated hours from quantities and output rates, not time actually spent."],
        ["Unavailable", "Nothing to compare with; not a zero."],
      ] } },
      { title: "Compare responsibly", bullets: [
        "The same period last year is matched day by day.",
        "A change against fewer than five shows the difference but no percentage.",
        "Two people with different access can see different totals.",
        "Check missing dates, types, rates, and owners before treating a change as real.",
        "A panel with nothing in it says so.",
      ] },
    ],
    related: ["assets", "settings", "sharing", "workflow"],
  },
  {
    id: "trackers",
    title: "Trackers and spreadsheet files",
    category: "Reporting and records",
    summary: "Create a workbook, edit typed cells, check autosave, and exchange Excel files.",
    audience: "Workspace members maintaining structured records",
    sections: [
      { title: "When to use a tracker", paragraphs: ["Trackers are spreadsheet-style workbooks for records that do not fit a board, such as run sheets and logs. Use boards for assigned work and conversations. Members other than guests can edit trackers."] },
      { title: "Create and maintain a tracker", steps: [
        "Open Trackers and create a workbook, or import an Excel file.",
        "Name the sheets and set each column's type: text, dropdown, date, number, checkbox, or link.",
        "Add rows, and sections to group them. Add a summary at the foot of a column.",
        "Watch the save indicator: changes save a moment after you stop typing. Wait for it before leaving.",
      ] },
      { title: "Import and export", paragraphs: ["Export a workbook as .xlsx, with its formatting, dropdowns, and summaries, or the current sheet as CSV. An imported workbook keeps what the tracker supports; formulas come in as their saved results. Keep the original file when its formulas matter."] },
    ],
    related: ["data", "permissions", "troubleshooting"],
  },
  {
    id: "members",
    title: "Members and onboarding",
    category: "Administration",
    summary: "Add colleagues, manage roles, and handle pending and departing members.",
    audience: "Workspace owners and administrators",
    sections: [
      { title: "Add a colleague", steps: [
        "Open Members and choose Add member: email, name, job title, role, and teams.",
        "Copy the join link and send it yourself. The app sends no email.",
        "They set a password and complete their profile, and become active. Until then they show as Pending onboarding and cannot sign in.",
        "Check they can open and edit what their role needs.",
      ] },
      { title: "Pending members from bookings", paragraphs: ["A booking from someone new adds them as a pending member, so the task can name them. They see nothing until an admin passes them a join link."] },
      { title: "Invitation problems", bullets: [
        "If a link expires or is lost, renew it and send the new one; the old one stops working.",
        "Check a member's status when they cannot sign in or cannot be assigned.",
        "Read the confirmation before cancelling: it can remove the account as well as the link.",
      ] },
      { title: "Change roles and offboard", steps: [
        "Reassign the person's open tasks and deliverables, and hand over the boards they own.",
        "Change their workspace role and board roles as needed.",
        "Deactivate them in Members. Their name stays on past work; they can no longer sign in or be assigned.",
        "Replace any share or portal links they should no longer hold.",
      ] },
      { title: "View as", paragraphs: ["Admins can preview what another person sees with View as. It does not sign you in as them: anything you change is still done by you."] },
    ],
    related: ["permissions", "collaboration", "sharing"],
  },
  {
    id: "permissions",
    title: "Roles and access",
    category: "Administration",
    summary: "Understand workspace roles, board roles, visibility, and why an edit may be unavailable.",
    audience: "Everyone; especially board owners and administrators",
    sections: [
      { title: "Workspace roles", table: { headers: ["Role", "Can"], rows: [
        ["Owner / Admin", "Everything: members, teams, settings, Task Allocation, the portal and booking form, snapshots, and the danger zone. Owners and admins have the same powers."],
        ["Member", "Create boards and teams, edit trackers, and work on boards where they are editors."],
        ["Guest", "Only boards they are invited to; no creating boards or teams, no trackers."],
      ] } },
      { title: "Board roles and visibility", paragraphs: ["Board roles are Owner, Editor, and Viewer. Owners and editors change tasks; viewers read them. A board's owner, or an admin, manages its settings, members, sharing, and automations."], table: { headers: ["Situation", "Access"], rows: [
        ["Deactivated", "None."],
        ["Board owner", "Owner."],
        ["Invited to the board", "The role you were given; an explicit Viewer stays a viewer."],
        ["Workspace admin", "Editor, plus management."],
        ["Workspace-visible board", "Viewer for members."],
        ["Team-visible board", "Editor for the team's members."],
        ["Private board", "Only its owner, invited people, and admins."],
      ] } },
      { title: "Common surprises", bullets: [
        "Task Allocation is for admins only.",
        "Being in a board's team does not make a workspace-visible board editable.",
        "Share links and the portal never give editing access.",
        "Running a quick run needs edit rights; changing automations needs the board's owner or an admin.",
        "Hiding a column, archiving a team, or muting a board does not change who can see what.",
      ] },
      { title: "Sort out an access problem", steps: [
        "Check the account, the workspace, and that the membership is active.",
        "Ask the board's owner or an admin to check ownership, board members, visibility, and team membership, in that order.",
        "Grant an editor role for editing; a share link will not do it.",
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
        ["Overview", "Teams, boards, people, and tickets issued, each opening what it counts; the workspace name."],
        ["Tickets", "The ticket prefix, and whether changing it rewrites existing tickets."],
        ["Teams", "Create, edit, archive, or restore teams."],
        ["Departments", "Who work is for. Only these can be chosen on bookings and tasks."],
        ["Asset types", "Deliverable types and their output rates."],
        ["Roles", "What each workspace role can do, and a link to Members."],
        ["Appearance", "Your theme and sidebar preferences, on this device."],
        ["Snapshots", "Save, download, upload, and restore everything the workspace holds. Admins, shared workspaces only."],
        ["Danger zone", "Wipe all board data for a clean start. Admins, shared workspaces only."],
        ["Guide / About", "This guide, and the app's version and what is new."],
      ] } },
      { title: "Edit departments and asset types", steps: [
        "Open Settings → Departments or Settings → Asset types as an owner or admin.",
        "Add, rename, or recolour entries. A rename updates the work that uses it.",
        "When removing an entry, choose what happens to the work that has it: move it to another entry, or clear it.",
        "Save; until then it is a draft you can discard.",
      ] },
      { title: "Output rates", paragraphs: ["Each asset type can have a rate: how many the team finishes in an hour, day, or week. The dashboard uses rates to estimate effort. A type with no rate adds nothing to effort."] },
      { title: "Tickets", paragraphs: ["Changing the prefix asks whether to rewrite existing tickets or use the new prefix only for new ones. Numbers never change, and a number is never reused."] },
    ],
    related: ["assets", "portal", "data", "members"],
  },
  {
    id: "data",
    title: "Saving, snapshots, and recovery",
    category: "Administration",
    summary: "Know when work is saved, and use snapshots and the danger zone safely.",
    audience: "All users; recovery actions for administrators",
    sections: [
      { title: "Know when your work is saved", bullets: [
        "Board and task edits save straight away; an error appears if one does not.",
        "Trackers save a moment after you stop typing; wait for the indicator before leaving.",
        "Settings forms and the booking form editor have their own Save or Publish.",
        "If the app warns about unsaved work, stay on the page until it has saved.",
      ] },
      { title: "Snapshots", steps: [
        "Admins: open Settings → Snapshots and choose Take snapshot, with a name if you like.",
        "Download any snapshot as a file, or upload one downloaded before.",
        "To restore, choose Restore and type RESTORE. The current state is saved as a snapshot first, so a restore can itself be undone. Keep the tab open until it finishes.",
      ], note: { title: "A restore replaces everything", text: "Restoring puts back every board, task, update, and setting as it was when the snapshot was taken, and removes anything made since. Sign-in accounts and uploaded images are not part of snapshots. Snapshot files contain the workspace's links and keys: keep them private." } },
      { title: "The danger zone", paragraphs: ["Wipe all board data removes every board, task, tracker, and their history, for a clean start. Settings, departments, asset types, teams, and people stay, and Task Allocation keeps its layout. It needs your password, takes a snapshot first, and can start the ticket numbers again from 001."] },
      { title: "The local demo", paragraphs: ["The demo that runs in a single browser keeps its data in that browser only. Reset demo data, in your account menu, puts back the original demonstration data and loses your changes."] },
    ],
    related: ["trackers", "settings", "troubleshooting"],
  },
  {
    id: "mobile",
    title: "Using Streamline on a phone",
    category: "Personal work",
    summary: "Find your way on a small screen and keep everyday updates quick.",
    audience: "People working away from their desktop",
    sections: [
      { title: "Find your way around", paragraphs: ["On a phone, five tabs sit along the bottom: Home, My Work, Browse, Inbox, and More. Browse lists your teams, boards, and trackers; More holds the dashboard, automations, Portal and Booking, messages, members, settings, your profile, and the theme. Search is in the top bar."] },
      { title: "Work on a board", steps: [
        "Open a board from Browse or My Work. Tasks show as cards; switch to the grid for the table.",
        "Tap a card's status, priority, or date to change it from a sheet. Today and Tomorrow are your own days.",
        "Use New item to add a task, and Select to act on several.",
        "Kanban shows one lane at a time; use Move to to change a card's lane.",
        "Tap a task to open it full screen, with its updates, deliverables, and activity.",
      ] },
      { title: "Appearance and notifications", paragraphs: ["Choose a theme from More. Portal visitors have their own theme switch. Browser notifications depend on the phone's browser and need an open Streamline tab."] },
    ],
    related: ["my-work", "collaboration", "start"],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting and common questions",
    category: "Reference",
    summary: "Resolve missing work, read-only screens, mismatched totals, failed saves, and link problems.",
    audience: "Everyone",
    sections: [
      { title: "I cannot find a task", steps: [
        "Check the workspace, the board, your account, and whether you are in View as.",
        "Clear search and filters, go back to Main Table, open groups and parents, and look in the archive.",
        "Search for its ticket or number.",
        "For a booking, check the receipt: it may have gone straight to a team's board, or been allocated since.",
        "Ask the board's owner to check your access before creating a new one.",
      ] },
      { title: "I can open the board but cannot edit", paragraphs: ["Workspace-visible boards give members viewing access. Ask the board's owner for an editor role. Shared boards and the portal are always read-only."] },
      { title: "A column disappeared", paragraphs: ["Someone may have removed a special column from the board. Add its type back from the column picker and its values return. Other columns may be hidden: check Hide in the toolbar."] },
      { title: "An automation did not run", bullets: [
        "Check the rule is switched on, and read its Activity: skipped runs say why.",
        "A rule that notifies people never tells the person who caused it.",
        "Check the Automations page says the runner is live.",
        "A rule on a board that was deleted or archived may no longer apply.",
      ] },
      { title: "The dashboard totals look wrong", bullets: [
        "Compare the same period, teams, and measure.",
        "Tasks, deliverable units, and effort measure different things.",
        "Check missing dates, types, quantities, rates, and owners.",
        "Linked copies count once, subitems are not tasks, and two people with different access see different totals.",
      ] },
      { title: "A completed task still looks open", paragraphs: ["Ask the board's owner to check that its status label means done. Check its deliverables and subitems separately."] },
      { title: "A value or department was refused", paragraphs: ["A department must be one on the list in Settings → Departments. A ticket must be unique in the workspace, unless the tasks are linked. A Booking time column belongs on Task Allocation only."] },
      { title: "A save or upload failed", steps: [
        "Stay on the page and keep what you typed. Check your connection and the message.",
        "Check you are still signed in and have access, then try again.",
        "For images, check the size and type. For a booking, check whether it arrived before booking again.",
      ] },
      { title: "A link no longer opens", paragraphs: ["Join links expire, and are replaced when renewed; share links can end, stop, or be replaced; the portal can be closed or given a new password. Ask for the current link. A members-only share also needs you to be signed in."] },
      { title: "What to include when asking for help", bullets: [
        "The workspace, board or tracker, the ticket if there is one, and what you did.",
        "What you expected, what happened, the exact message, and roughly when.",
        "Your role, browser or device, and the version from Settings → About.",
        "Never send passwords, join links, portal links, or share links in a help request.",
      ] },
    ],
    related: ["permissions", "data", "dashboard", "automations"],
  },
  {
    id: "glossary",
    title: "Glossary and working conventions",
    category: "Reference",
    summary: "A shared vocabulary for tasks, deliverables, allocation, reporting, and access.",
    audience: "Everyone",
    sections: [
      { title: "Terms you will see", table: { headers: ["Term", "Meaning"], rows: [
        ["Workspace", "The team's shared space: people, boards, trackers, and settings."],
        ["Team", "People and boards with a shared responsibility."],
        ["Board / group", "A board holds work; a group is a section of it."],
        ["Task / subitem", "A piece of work / a step within it."],
        ["Ticket", "A task's quotable code, such as CP_014."],
        ["Special column", "One of the ten fields every board has and the workspace reads: Status, PIC, Requester, Due date, Timeline, Priority, Department, Size, Assets recap, Brief."],
        ["PIC", "The person or people in charge of a task."],
        ["Requester", "Who asked for the work."],
        ["Department", "Who the work is for, from the workspace's list."],
        ["Brief", "What the requester asked for, as one document."],
        ["Deliverable / unit", "An output of a task / its quantity."],
        ["Task Allocation", "The admins' intake board for requests without a direct destination."],
        ["Allocation", "Moving a request to the board of the team doing it."],
        ["Linked task", "A task on another board that shares fields, deliverables, and updates."],
        ["Automation / quick run", "A rule that runs on its own / a set of actions fired by hand."],
        ["Template", "A saved board layout new boards can start from."],
        ["Journey", "A task's story from booking to archive, with time in each status."],
        ["Done / stuck / in progress", "What a status label means, whatever it is called."],
        ["Effort / output rate", "Estimated hours / how many of a type the team finishes in a given time."],
        ["Snapshot", "A saved copy of everything the workspace holds."],
        ["Share / portal", "A read-only link / the departments' view of their work."],
      ] } },
      { title: "Working conventions", bullets: [
        "Give every task a clear outcome, a PIC, and a date.",
        "Keep fields for planning, deliverables for outputs, and updates for decisions.",
        "Use the workspace's departments and asset types so reporting adds up.",
        "Record changes to scope and dates where the next person will find them.",
        "Check deliverables and status before closing work, and archive deliberately.",
        "When quoting a report, say its period, teams, and measure.",
      ] },
    ],
    related: ["start", "workflow", "tasks"],
  },
];

export function articleText(article: GuideArticle): string {
  return [article.title, article.category, article.summary, article.audience,
    ...article.sections.flatMap((section) => [section.title, ...(section.paragraphs ?? []), ...(section.steps ?? []), ...(section.bullets ?? []), ...(section.table?.headers ?? []), ...(section.table?.rows.flat() ?? []), section.note?.title ?? "", section.note?.text ?? ""]),
  ].join(" ");
}

const SEARCH_INDEX = GUIDE_ARTICLES.map((article) => ({ article, text: articleText(article).toLocaleLowerCase() }));

export function searchGuide(query: string): GuideArticle[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return SEARCH_INDEX.filter(({ text }) => terms.every((term) => text.includes(term))).map(({ article }) => article);
}

export function guideMarkdown(): string {
  const lines = ["# Streamline user guide", "", "A practical guide to the workspace, with a detailed request-to-delivery workflow.", "", "## Contents", "", ...GUIDE_ARTICLES.map((article, index) => `${index + 1}. ${article.title}`), ""];
  for (const article of GUIDE_ARTICLES) {
    lines.push(`## ${article.title}`, "", article.summary, "", `For: ${article.audience}`, "");
    for (const section of article.sections) {
      lines.push(`### ${section.title}`, "");
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
