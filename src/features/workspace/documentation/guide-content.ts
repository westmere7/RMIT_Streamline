/** User-facing guidance, kept separate from rendering so the download and search
 * use the same copy. Verify behavior against feature/service code when updating;
 * the repository knowledge base also contains historical implementation notes. */
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
    title: "Quick start: stakeholder",
    category: "Quick start guides",
    summary: "Submit a clear brief, follow progress, and help the team deliver what you need.",
    audience: "Stakeholders requesting creative or marketing work",
    sections: [
      { title: "Your part in the process", paragraphs: ["You explain the outcome, supply the inputs, and coordinate feedback. The admin routes requests across teams; the team manager agrees the delivery plan and assigns the people doing the work. Your first milestone is a submitted request with a reference and a clear next contact."] },
      { title: "Before you start", bullets: [
        "Get the current portal or booking link from the team, plus its password if one is required. The external portal does not need a normal workspace account.",
        "Prepare the objective, audience, deliverables and quantities, requested deadline, source copy, and reference links. Check that the team can open the linked files.",
        "Nominate the person who will consolidate feedback and confirm the final output on your side.",
      ] },
      { title: "Make your first request", steps: [
        "Open the portal and choose Book a task. If booking is unavailable there, use the current booking link supplied by the team. Signed-in members can also use the booking tab in Stakeholder Portal.",
        "Follow the published form's service choices and required questions. Give the request a distinctive title and describe the outcome you need.",
        "Specify the deliverables, formats, quantities, source material, contact information, and requested date wherever the form asks for them. Call out an immovable event date and explain why it matters.",
        "Review the brief and submit once. Keep the confirmation and task reference. If the response is unclear, ask the team whether it received the request before submitting again.",
        "Respond to clarification questions and agree the scope and achievable dates with the team manager. The date entered on a form is a request, not a confirmed capacity reservation.",
      ] },
      { title: "Follow progress and review the output", steps: [
        "Return to the portal, choose the relevant stakeholder and date filters, and search for your task. Open it to read the details available to you.",
        "Send consolidated feedback through the review channel agreed with the manager, including the task reference and which version you reviewed. Ask the team to keep the decision on the task.",
        "If scope or timing changes, contact the manager with the change and its impact. Agree the revised plan before treating it as committed.",
        "When the final output arrives, check every requested deliverable and file link, then confirm acceptance or identify what remains outstanding.",
      ] },
      { title: "You are ready when…", bullets: [
        "You have a request reference and know how to contact the receiving team.",
        "The manager has confirmed the scope, dates, and review contact.",
        "You know where to follow progress and provide feedback.",
      ], note: { title: "Getting this guide to external stakeholders", text: "This chapter lives in internal Settings. Admins can use Download guide and pass the stakeholder instructions to external readers; copying this chapter's internal link does not grant them workspace access." } },
    ],
    related: ["booking", "portal", "workflow"],
  },
  {
    id: "quick-start-admin",
    title: "Quick start: admin",
    category: "Quick start guides",
    summary: "Equip team managers, coordinate incoming work, and oversee delivery across teams.",
    audience: "Workspace owners and admins who manage team managers",
    sections: [
      { title: "Your part in the process", paragraphs: ["You establish who manages each team, give managers the access and structure they need, route work to the right team, and resolve priorities or capacity conflicts across teams. Managers own their team's daily assignments and delivery. Your first milestone is a named manager and a usable delivery board for every active team."] },
      { title: "Set up the managers and their teams", steps: [
        "Open Members and invite each manager with the appropriate workspace role. Send the generated invitation link yourself and confirm onboarding is complete; the app does not automatically email it.",
        "Open Settings → Teams to create or review the teams. Agree a named manager, the work each team owns, and who provides cover when its manager is absent. Record those responsibilities in team or board descriptions where useful.",
        "Open each team and add its manager and contributors to the team membership. Review the team's boards and grant the manager the board access needed to run them; board ownership or workspace administration is needed for board management controls.",
        "With each manager, check the receiving board's groups, People field, dates, priorities, stakeholder classification, and status meanings. Keep compatible fields for information that must survive allocation.",
        "In the team's settings, review its booking destination. Choose a valid receiving board for direct intake when appropriate, or use Task Allocation for central triage. Ensure the receiving board has a group.",
        "Maintain shared stakeholder names, asset types, and output rates in Settings → Lists. Preview the stakeholder portal and review its audience before enabling or distributing its link.",
      ], note: { title: "Manager is a responsibility, not a workspace role", text: "Streamline's workspace roles are Owner, Admin, Member, and Guest. Team membership and board roles determine a manager's access. Grant Admin when the person needs workspace-wide administration; managing a team alone does not require that role." } },
      { title: "Route work and hand it to a manager", steps: [
        "Review Task Allocation for requests needing a team. Clarify incomplete briefs and agree the receiving team with its manager, considering existing workload and deadlines.",
        "Check destination fields and preserve essential unmatched information in the description. Use the task's Allocation section to move the request onto the agreed board.",
        "Ask the manager to confirm receipt, assign a task owner, set feasible dates, and maintain the deliverables. Allocation moves the task to a board; it does not itself establish the individual delivery owner.",
      ] },
      { title: "Run a short weekly manager review", bullets: [
        "Use Dashboard → Overview to review overdue, blocked, upcoming, and unallocated work with each manager.",
        "Use Resourcing to identify gaps or competing demands. Agree any reassignment or cross-team support and have the responsible manager update the task records.",
        "Compare Demand & Delivery using the same period, team scope, measure, and Requested/Scheduled basis. Check missing data before drawing conclusions.",
        "Resolve escalated priority conflicts, record the decision with an owner and date, and check it at the next review.",
        "When a manager changes, transfer open responsibilities and review team membership, board access, and ownership before deactivating the departing person.",
      ] },
      { title: "You are ready when…", bullets: [
        "Every team has an agreed manager, a receiving board, and a clear intake route.",
        "Managers can access the boards and controls they need, and contributors can edit their assigned work.",
        "Managers know which decisions they own and when to escalate cross-team conflicts to you.",
      ] },
    ],
    related: ["members", "permissions", "settings", "dashboard", "quick-start-manager"],
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
        "Complete your invitation and sign in. Open your team and its boards; ask the admin to resolve missing access before planning work there.",
        "Confirm you can edit tasks. If you need to configure board membership or other management controls, confirm the appropriate ownership or administration access with the admin. A manager title alone does not grant those controls.",
        "Agree with the admin which work your team receives, which board it belongs on, and whether bookings arrive directly or are allocated centrally.",
        "Review the board's groups, status meanings, People field, dates, and stakeholder field. Set up the views you use for planning and check your Inbox notification preferences.",
      ] },
      { title: "Plan the first incoming task", steps: [
        "Open the request on your team's board and read the full brief, reference links, requested date, and asset list. Check with the requester if the outcome or inputs are unclear.",
        "Review existing commitments in Workload or Dashboard → Resourcing before accepting a deadline. Confirm feasible scope and dates with the requester; escalate competing team priorities to the admin.",
        "Assign a responsible person in People, set the priority and delivery date or timeline, and record the next action. Use a status that accurately reflects the task's stage.",
        "Open Assets and confirm deliverable types, quantities, assignees, due dates, and specifications. Add subitems for separate work steps where useful.",
        "Record the agreed plan in Updates: who produces the work, who reviews it, when feedback is due, and what counts as complete. Tell contributors the task is ready to start.",
      ] },
      { title: "Keep delivery moving", bullets: [
        "Daily: review overdue, blocked, undated, and unassigned work on your team's boards. Resolve missing inputs and update assignments or dates when the plan changes.",
        "During production: keep decisions and progress in Updates, with clear mentions and next actions. Ask contributors to maintain asset-level progress as well as task status.",
        "At review: send the output link and version to the agreed reviewer, consolidate feedback, and record the resulting decisions on the task.",
        "At handover: verify all deliverables and links, mark delivered asset lines complete, and set the task to a done-role status. Record final delivery and any agreed exclusions.",
        "Weekly: give the admin a concise account of upcoming commitments, capacity gaps, blocked decisions, and requests for support, using the same dashboard scope for comparisons.",
      ] },
      { title: "Escalate with a decision to make", paragraphs: ["When you need the admin's help, include the task reference, the issue, its effect on scope or dates, the options you recommend, and when a decision is needed. Contact the admin through the agreed channel and record the outcome in Updates. For a request still in the administrator-only Task Allocation queue, ask the admin to allocate it to your board; an ordinary manager may not be able to open that queue."] },
      { title: "You are ready when…", bullets: [
        "Accepted tasks have an owner, an achievable date, and clear deliverables.",
        "Contributors know their next action and the review arrangement.",
        "The admin can see accurate progress and knows which decisions require their help.",
      ] },
    ],
    related: ["workflow", "tasks", "assets", "dashboard", "quick-start-admin"],
  },
  {
    id: "start",
    title: "Start here",
    category: "Getting started",
    summary: "Understand the workspace, find your work, and get ready for your first task.",
    audience: "Everyone",
    sections: [
      { title: "What Streamline is for", paragraphs: [
        "Streamline brings the RMIT creative and marketing team's requests, planning, deliverables, and conversations into one workspace. Stakeholders submit briefs; the team reviews and assigns the work; contributors record progress on boards; managers use the dashboard to understand demand, output, and resourcing.",
        "The board is where work is maintained. My Work, board views, the dashboard, and shared pages present that work for different audiences. Keeping owners, dates, statuses, stakeholders, and asset quantities accurate makes those views useful.",
      ] },
      { title: "Your first visit", steps: [
        "If you received an invitation, open its link, set your password, and complete your profile before trying normal sign-in. If the link has expired, ask your workspace administrator for a replacement.",
        "Sign in and open your workspace. Check that the workspace name and your profile are correct, especially if you belong to more than one workspace.",
        "Open My Work to see assignments, then Inbox to read notifications and updates. Open a task to see the board it belongs to and its full details.",
        "Browse the teams and boards available to you. On a phone, use Browse for the directory and More for Settings, Members, Dashboard, and your profile.",
        "Open your profile to complete useful contact and role details. Configure notification delivery from Inbox so the events you need are visible.",
      ] },
      { title: "Where to go", table: { headers: ["Destination", "Use it for"], rows: [
        ["Home", "Return to your workspace and recently visited work."],
        ["My Work", "Review assignments across accessible boards and plan your day."],
        ["Inbox / Messages", "Read task events and Updates, or have a direct conversation."],
        ["Teams / Boards", "Organize, assign, schedule, and deliver tasks."],
        ["Stakeholder Portal", "Book work inside the app; administrators also manage the external portal."],
        ["Dashboard", "Review output, demand, delivery, and resourcing."],
        ["Trackers", "Maintain spreadsheet-style records and import or export workbooks."],
        ["Members / Settings", "Manage people and workspace configuration; read this guide."],
      ] } },
      { title: "Read this guide by role", bullets: [
        "Stakeholders, admins overseeing managers, and team managers: choose your Quick start guide at the top of this page for your first steps, responsibilities, and handoffs.",
        "Contributors: start with the end-to-end workflow, tasks, assets, and My Work.",
        "Team leads: add boards, views, allocation, linked work, and reporting.",
        "Administrators: read permissions, members, the portal, sharing, lists, and data management.",
        "People submitting requests: use the booking and portal chapters. The external portal does not require access to these internal Settings pages.",
      ], note: { title: "About booking form configuration", text: "The booking form editor is being updated. This guide covers submitting and handling requests; editor controls and template-authoring instructions will need a separate review once that work is finished. Follow the questions and validation shown on the published form." } },
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
      { title: "The journey", paragraphs: ["Brief → review → allocate → plan → produce → review deliverables → complete → report. These are recommended working stages, not a fixed automation or a mandatory set of status labels. Your board can use its own vocabulary."], table: { headers: ["Stage", "Responsible person", "Ready to move on when…"], rows: [
        ["Request", "Requester", "The brief, deliverables, contact details, and requested date are clear."],
        ["Review & allocate", "Coordinator / administrator", "The request is on the right board and missing information has been identified."],
        ["Plan", "Team lead", "An owner, achievable dates, priority, and deliverable responsibilities are recorded."],
        ["Produce & review", "Contributors / reviewer", "Progress, feedback, revisions, and final output links are recorded on the task."],
        ["Complete & report", "Task owner / lead", "Assets and task status reflect delivery; reporting data has been checked."],
      ] } },
      { title: "1. Prepare and submit the brief", steps: [
        "Requester: open the current booking link, or use Book a task from the Stakeholder Portal area. Describe the purpose, audience, intended channels, and the result you need.",
        "List the deliverables clearly. Distinguish asset types, versions, formats, quantities, dimensions, and any copy or source material the team must use. Supply accessible reference links.",
        "Enter the requested deadline and contact information, then complete the required questions shown by the form. A requested date is a planning input; agree feasibility with the delivery team.",
        "Review the submission and submit once. Keep the receipt and reference for follow-up. If the response fails or is unclear, check with the team for an existing request before sending another copy.",
      ] },
      { title: "2. Triage the incoming request", steps: [
        "Coordinator: inspect the request on its receiving board. A request can arrive directly on a configured team board; requests without a valid team destination go to the administrator-only Task Allocation board.",
        "Open the task and read the brief, requested date, stakeholder, references, and assets. Resolve unclear scope, missing files, or conflicting deadlines with the requester. Record the decision in Updates.",
        "Check whether the request duplicates existing work. Agree which task will be maintained before proceeding; use its reference in subsequent discussion.",
        "Decide which team board should own delivery. If the task is already there, proceed to planning. If it is queued in Task Allocation, use the Allocation section in the item panel.",
      ] },
      { title: "3. Allocate the request", steps: [
        "Administrator: confirm the destination board is active and has a receiving group. Check that its columns can represent the information you need to keep, especially stakeholder, dates, status, and priority.",
        "In the queued task's Allocation section, choose the team board and select Allocate. The existing task moves to the destination's first group and leaves the allocation queue.",
        "Open the destination board and verify the task, its brief, assets, and mapped field values. Compatible columns are translated; a source field without a matching destination is not carried as a structured value. Preserve essential unmatched details in the description before allocation.",
        "Tell the receiving lead that the task is ready to plan. Allocation chooses the board; confirm the person responsible separately in the task's People field.",
      ], note: { title: "Allocation is a move", text: "The same request continues on the team board. The allocation action does not create a second linked task. Linking work across boards is a separate feature described in Linked tasks." } },
      { title: "4. Turn the brief into a plan", steps: [
        "Team lead: assign the task owner in a People column and agree the priority. Set a date or timeline based on the team's delivery commitment.",
        "Open Assets and confirm each deliverable's type, quantity, assignees, due date, and notes. Use subitems for separate pieces of task work where useful; subitems and asset lines are different records.",
        "Check workload and any dependencies before committing. Split large work into manageable steps and note external approvals or inputs in Updates.",
        "Record the agreed scope, milestone dates, review owner, and definition of completion in the description or an Update. Set the status that represents work ready to start or in progress on your board.",
      ] },
      { title: "5. Produce and keep progress current", steps: [
        "Contributor: use My Work for your assignments, then open the task for context. Read recent Updates before making changes.",
        "Update the task status as work progresses, and maintain deliverable-level assignees and dates in Assets. Use reference links for working files so colleagues can find the latest version.",
        "If work is blocked, choose the board's stuck status where configured, explain the blocker in Updates, mention the person who can help, and state the decision or input needed.",
        "When dates or scope change, update the relevant fields and record why. Check any linked copies and their field exclusions before assuming a change appears everywhere.",
      ] },
      { title: "6. Review and hand over", steps: [
        "Task owner: post the review-ready output link with version, context, and the feedback needed. Use the board's review status if it has one.",
        "Reviewer: put actionable feedback in Updates so it stays with the task. If feedback arrives through Messages or another channel, summarize the decision on the task.",
        "Contributor: complete revisions, replace or clearly identify the final links, and document approval. Streamline records the discussion; a status label alone is not a formal approval process.",
        "Confirm that the requester can open the final files and that each requested deliverable has been supplied. For external visibility, use the intended portal or sharing controls and review what the audience can see.",
      ] },
      { title: "7. Close the work accurately", steps: [
        "Mark completed asset lines in Assets. Verify delivered quantities and types rather than leaving planning placeholders.",
        "Set the task to a status label configured with the done role. Merely naming a label Done does not define its completion behavior.",
        "Post a final Update identifying what was delivered, where it is, any exclusions, and the handover date. Confirm that nothing outstanding is hidden in a subitem or asset line.",
        "Keep completed work on the board while it is useful. Archive it when it should leave the active board; use the archive to find or restore it later. Deletion is a separate decision.",
      ] },
      { title: "8. Review the team's week", steps: [
        "Lead: open Dashboard → Overview. Review overdue, blocked, unallocated, and upcoming work, then open the tasks that need decisions.",
        "Use Demand & Delivery to compare the same reporting period, team scope, measure, and date basis. Check missing data before drawing conclusions from a change in totals.",
        "Use Resourcing to check the next planning window and identify unassigned or overloaded work. Make the resulting assignment and date changes on the boards.",
        "Agree next actions with named owners and dates. Repeat the review regularly; the dashboard becomes more useful as the underlying board records improve.",
      ] },
      { title: "Example: a campaign launch", paragraphs: ["A stakeholder requests one poster and six social assets. The coordinator confirms the copy and deadline, then allocates the request to the creative team's board. The lead assigns a task owner and creates asset lines with quantities 1 and 6, separate assignees, and review dates. Contributors post drafts in Updates, record feedback, and link the final versions. After handover, both asset lines are marked complete and the task receives a done-role status. The request is one task with seven asset units; it is not seven tasks."], bullets: [
        "If the deadline changes: update the task and affected assets, then explain the impact in Updates.",
        "If the receiving board is wrong: involve the board owner or administrator and verify destination fields before moving work.",
        "If another team needs its own task: use an explicit linked-task workflow and decide which fields should synchronize.",
        "If feedback is still outstanding: retain an appropriate review or waiting status instead of marking the task complete.",
      ] },
    ],
    related: ["booking", "assets", "dashboard", "links"],
  },
  {
    id: "boards",
    title: "Teams and boards",
    category: "Managing work",
    summary: "Set up a useful board, organize groups, and manage access and the board lifecycle.",
    audience: "Contributors, team leads, and administrators",
    sections: [
      { title: "Choose the right structure", paragraphs: ["A workspace contains teams, people, boards, and trackers. A team groups related people and boards. A board holds tasks; groups organize rows within that board. Create boards around a delivery responsibility, campaign, or ongoing process. Use groups for stages, batches, or another shared convention that the team understands.", "Being able to see a board does not necessarily let you edit it. Workspace-visible boards give ordinary members viewing access by default. Ask the board owner to grant editor access when you need to change work."] },
      { title: "Set up a board", steps: [
        "Create a board from an available template or starting structure. Give it a descriptive name, assign its team where appropriate, and add a description explaining what belongs there.",
        "Review visibility and board members. Choose workspace, team, or private visibility for the intended audience, then assign explicit board roles where needed.",
        "Create or rename groups and put them in a sensible order. The first group matters when this board receives bookings or allocated requests.",
        "Configure the columns needed for the work. A useful starting point is People, Status, Date or Timeline, Priority, and Stakeholder; add Assets recap if the team tracks deliverables.",
        "Check status label meanings, add a sample task, and inspect the views your team will use. Confirm that an ordinary editor and viewer have the access you intend.",
      ] },
      { title: "Maintain the board", bullets: [
        "Use favourites for boards you revisit. Search and filters help you focus without changing the underlying task records.",
        "Use column menus to configure supported settings. Hiding a column changes presentation; it is not a way to make that information confidential.",
        "A sort changes the displayed order. Clear it before interpreting manual item positions or reorganizing rows.",
        "Select rows for supported bulk actions. Review the selection before applying a change to several tasks.",
        "Duplicate a board when a reusable structure is needed, then inspect the new board's contents and access rather than assuming it is an empty template.",
      ] },
      { title: "Archive, restore, and delete", paragraphs: ["Archive finished work when it should leave the active view but remain recoverable. The board archive is a separate destination for archived items. Board and team archive controls handle those larger containers; archived teams are hidden from the normal sidebar.", "Deletion is different from archiving. Read the confirmation and check whether the work is still needed before deleting. Built-in system entities, including Task Allocation, have additional protections. Their function remains the same even if someone renames them."] },
    ],
    related: ["permissions", "tasks", "views"],
  },
  {
    id: "tasks",
    title: "Tasks, fields, and subitems",
    category: "Managing work",
    summary: "Create and maintain a task, understand field types, and record completion correctly.",
    audience: "Board editors and task owners",
    sections: [
      { title: "Create a task people can act on", steps: [
        "Open the board and add an item in the right group. Give it an action-oriented name that distinguishes it from similar work.",
        "Open the item panel and add the purpose, scope, expected output, and relevant reference links in the description or fields.",
        "Assign the responsible people, set a priority, and add the due date or timeline. Confirm any multiple-assignee expectations with the team.",
        "Add subitems for smaller units of task work. Add asset lines separately when you need deliverable quantities, types, or individual delivery dates.",
        "Post context or the next action in Updates. Use Activity when you need to inspect recorded changes.",
      ] },
      { title: "Field reference", table: { headers: ["Field", "Meaning and use"], rows: [
        ["Text / Long text", "Short labels or longer notes and briefs."],
        ["People", "One or more people, according to the column's assignment setting."],
        ["Status", "A configurable label; done, stuck, and progress meanings are configured separately."],
        ["Priority", "A shared priority scale for ordering attention."],
        ["Date / Timeline", "A date, or a start and end span. Views use their selected date settings."],
        ["Number / Checkbox", "A numeric value with display settings, or a checked/unchecked value."],
        ["Link", "A URL with optional display text. Check the file or site is accessible to its intended readers."],
        ["Tags / Stakeholder", "Classification tags, or a stakeholder selected from the workspace list."],
        ["Size", "A relative estimate using XS, S, M, L, or XL."],
        ["Assets recap", "A calculated summary of the task's asset lines; edit Assets to change it."],
        ["Dependency", "References to other items on the same board."],
      ] } },
      { title: "Use the item panel", bullets: [
        "Overview holds the task context and fields, including linked work and allocation controls when applicable.",
        "Updates holds the conversation, mentions, feedback, and decisions.",
        "Assets holds structured deliverables with quantities, assignees, dates, notes, and completion.",
        "Activity shows recorded task events. It complements the conversation rather than replacing an explanation of a decision.",
      ] },
      { title: "What counts as finished", paragraphs: ["A status is complete when its label has the done role configured on that board. Renaming a label to Done, Approved, or Delivered does not by itself give it that role. If My Work or reporting treats a finished-looking task as open, ask the board manager to check label configuration.", "Task completion and asset completion are separate. Review both when closing work. Likewise, a parent task, its subitems, and an asset list should be checked individually; do not infer that every underlying record is complete from a single visible label."] },
      { title: "References and task links", paragraphs: ["A short ID/reference is a convenient label for follow-up. Ordinary tasks may have no reference; bookings receive one. It is not a password or proof of access. An internal task link opens its board and item panel for people with permission. Use the sharing controls when you intend to create a separately authorized viewing link."] },
    ],
    related: ["assets", "collaboration", "sharing"],
  },
  {
    id: "views",
    title: "Views, search, and filters",
    category: "Managing work",
    summary: "Choose among seven board views and diagnose work that seems to be missing.",
    audience: "Everyone who uses boards",
    sections: [
      { title: "One board, seven perspectives", table: { headers: ["View", "Best used for", "Check first"], rows: [
        ["Main Table", "Detailed editing, groups, subitems, and bulk actions.", "Visible columns, search, active filters, and sort."],
        ["Kanban", "Reviewing work in lanes and moving cards through the process.", "Which field defines the lanes; editing permissions."],
        ["Timeline", "Seeing work spans alongside one another.", "Selected dates and work without a usable span."],
        ["Calendar", "Reviewing scheduled work by day, week, or month.", "Selected date field and calendar period."],
        ["Gantt", "Planning hierarchy, date spans, milestones, and dependencies.", "Dates, dependency values, and view settings."],
        ["Workload", "Reviewing assignments across people and time.", "People, date range, and workload configuration."],
        ["Chart", "Summarizing task counts, numbers, or asset units.", "Grouping, selected measure, and missing values."],
      ] } },
      { title: "Find and focus work", steps: [
        "Choose a view from the board's view switcher. Switching views changes how the same tasks are presented.",
        "Use board search for a task name. Use the app's search command for broader navigation across boards, tasks, teams, and people you can access.",
        "Apply person, status, priority, group, tag, or date filters as available. Different filter categories combine, so a task must satisfy the active conditions together.",
        "Sort by the supported field when you need a particular reading order. Empty values and configured label order can explain an apparent sorting surprise.",
        "Clear search, filters, and sorting to return to an unrestricted view before deciding that a task is missing.",
      ] },
      { title: "If a view looks empty", bullets: [
        "Return to Main Table and search the task name. Expand its group or parent if needed.",
        "Check the current time window and selected date field; undated tasks cannot occupy a dated slot.",
        "Check the People field if work is absent from Workload, and the selected status/grouping field if it appears in an unexpected Kanban lane.",
        "Look in the board archive and verify you opened the correct workspace and board.",
        "If another person sees different work, compare access and filters before assuming data has disappeared.",
      ], note: { title: "Views can edit the same task", text: "Where editing is supported and permitted, changing a card, date, or cell updates the board's task data. A view is not a separate planning copy." } },
    ],
    related: ["boards", "tasks", "troubleshooting"],
  },
  {
    id: "assets",
    title: "Assets and deliverables",
    category: "Managing work",
    summary: "Track output quantities, ownership, deadlines, completion, and effort estimates.",
    audience: "Contributors and delivery leads",
    sections: [
      { title: "Task, asset line, and asset unit", paragraphs: ["A task is a piece of work. An asset line describes a deliverable within it. Quantity says how many units that line represents. One task can contain several lines and many units. For example, a campaign with a poster line of quantity 1 and a social line of quantity 6 has two asset lines and seven units.", "Asset lines are structured delivery records, not uploaded files. Use appropriate links and notes to point to working or final files. Subitems provide task hierarchy and are separate from asset lines."] },
      { title: "Maintain the Assets tab", steps: [
        "Open the task, select Assets, and add a clearly named deliverable line.",
        "Choose its asset type and quantity. Use the workspace's standard types so reporting can group the work consistently.",
        "Assign the people responsible for that deliverable and set its due date. Include format, size, version, handover instructions, or file references in notes as needed.",
        "Repeat for deliverables with different types, owners, deadlines, or specifications. Reorder the lines into a useful production sequence.",
        "Update the line as scope changes and mark it complete when delivered. Check that final quantities match what was actually supplied.",
      ] },
      { title: "Read the recap", paragraphs: ["Assets recap is derived from the asset list. It can summarize quantities, people, types, and date-related information. A missing quantity counts as one unit. Completed lines are excluded from overdue and next-due calculations; the next due date represents outstanding work on or after today.", "If the recap is unexpected, open Assets and inspect the individual lines. Editing a separate Number or Tags column does not necessarily change the deliverable list that the recap measures."] },
      { title: "Estimated effort", paragraphs: ["Administrators maintain output rates with asset types in Settings → Lists. The dashboard uses those configured rates and recorded quantities for its Effort measure. These are estimates based on standard output assumptions, not timesheets or hours actually worked. Missing types or rates reduce what can be estimated, so review coverage before comparing teams."], note: { title: "Linked items have their own asset lists", text: "Generic linked-task synchronization does not synchronize asset lines or their derived recap values. Decide where deliverables are maintained and verify each item's list when several teams use linked work." } },
    ],
    related: ["tasks", "settings", "dashboard"],
  },
  {
    id: "links",
    title: "Linked tasks across boards",
    category: "Managing work",
    summary: "Coordinate separate tasks across boards and understand exactly what stays in sync.",
    audience: "Board editors and cross-team coordinators",
    sections: [
      { title: "When to use a link", paragraphs: ["Link tasks when separate boards need to represent connected work and share supported fields or the conversation. Each item still belongs to its own board. A link is different from a dependency, an internal URL, a public share link, and the allocation action that moves a queued request."] },
      { title: "Set up the relationship", steps: [
        "Open the task's linked-items controls and choose an eligible item on another board in the same workspace.",
        "Review the field mapping and synchronization choices. Decide which board-specific fields should be excluded instead of letting one team overwrite another team's independent planning.",
        "Confirm the link, then open both tasks and check the mapped fields and Updates conversation.",
        "Explain the working agreement in Updates: where deliverables are tracked, which dates are shared, and who maintains each independent field.",
      ] },
      { title: "Synchronization boundaries", table: { headers: ["Content", "Behavior"], rows: [
        ["Name, description, reference", "Supported by synchronization unless excluded."],
        ["Compatible column values", "Mapped by compatible types and normalized names, with limited fallback matching."],
        ["Status / priority labels", "Translated by label name; a missing counterpart can prevent a value from translating."],
        ["People", "A single-person destination retains only the first person from a multiple assignment."],
        ["Updates", "A shared conversation across connected links unless excluded."],
        ["Assets / Assets recap", "Remain specific to each item; generic linking does not sync them."],
        ["Dependencies / subitems", "Do not assume these are synchronized by a parent-task link."],
      ] } },
      { title: "If linking or synchronization fails", paragraphs: ["The app rejects a self-link, same-board links, cross-workspace links, existing direct links, and link networks that would contain two different items from one board. Choose a distinct eligible item and confirm you can access the relevant boards.", "For a value that does not appear on the other item, inspect exclusions, destination type, column names, and label definitions. Some unmapped or incompatible values cannot transfer. Do not use linking as a backup or as a guarantee that every detail is identical."] },
    ],
    related: ["tasks", "assets", "workflow"],
  },
  {
    id: "booking",
    title: "Booking and task allocation",
    category: "Requests and sharing",
    summary: "Submit a useful request, understand where it lands, and move queued work to a team.",
    audience: "Requesters, coordinators, and administrators",
    sections: [
      { title: "Submit a request", steps: [
        "Use the current public booking link, the portal's Book a task control when enabled, or the in-app booking page. Administrators can reach the form from the booking tab in Stakeholder Portal.",
        "Select the relevant service or request options offered by the published form, then complete its brief and required information. Questions and available choices depend on the current form.",
        "Provide enough detail to estimate and deliver the work: objective, audience, copy, channels, deliverables, quantities, specifications, references, contact, and deadline where requested.",
        "Resolve validation messages and review the information before submitting. Keep the confirmation reference and use it when asking the team about progress.",
      ] },
      { title: "Where bookings go", paragraphs: ["If a requested team has a valid active receiving board configured, a booking can go directly to that board. Otherwise it goes to the built-in Task Allocation board. The receiving board's first group is the initial destination. Requesters should use the receipt and team communication to confirm where their work was accepted.", "Task Allocation is restricted to workspace owners and administrators. If a regular team member cannot see that queue, this is expected. They should work from their team's board once the request has been allocated."] },
      { title: "Allocate a queued task", steps: [
        "Open Task Allocation as an administrator and review the request before moving it.",
        "Check that the destination is an active board in this workspace with a receiving group. Preserve essential information from source fields that have no destination equivalent in the description.",
        "Open the task's Allocation section, choose the team board, and select Allocate.",
        "The task leaves the queue. Open the receiving board to verify the brief, mapped fields, assets, and responsibility for next steps.",
      ] },
      { title: "References, errors, and follow-up", bullets: [
        "The task reference helps people discuss a request. It does not grant access and is not the booking link's credential.",
        "If a link is no longer valid, obtain the current one from the team rather than changing its address manually.",
        "If submission appears to fail after sending, ask the coordinator to check for the request before retrying, to avoid duplicate work.",
        "If information cannot map into a receiving column during submission, it may be retained in the task description. Read the full brief when triaging.",
        "Confirm feasible dates with the delivery team. Submitting a requested date does not reserve capacity or guarantee delivery.",
      ], note: { title: "Editor work is in progress", text: "This chapter intentionally documents the request and allocation workflow. Detailed booking form editor and template instructions are pending completion of that feature." } },
    ],
    related: ["workflow", "portal", "boards"],
  },
  {
    id: "portal",
    title: "The stakeholder portal",
    category: "Requests and sharing",
    summary: "Manage the shared portal and help external stakeholders follow work and book requests.",
    audience: "Administrators and stakeholder coordinators",
    sections: [
      { title: "One portal with stakeholder filters", paragraphs: ["The portal provides an external view of stakeholder work without requiring a normal workspace account. Administrators manage one portal link and its presentation from Stakeholder Portal. Visitors can use stakeholder and date filters, search, grouping, and the available board views to find work.", "A stakeholder filter is a browsing control within that portal. It is not a separate private link for each department. Review the overall audience and visible work before distributing the shared link."] },
      { title: "Prepare the portal", steps: [
        "Maintain stakeholder names in Settings → Lists. Use the Stakeholder column on tasks to classify work consistently.",
        "Open Stakeholder Portal as a workspace administrator. Set the creative team name and description used in the portal header.",
        "Choose the initial view, visible columns, default theme, whether figures are shown, and whether the link takes new requests.",
        "Set or update the portal password when needed. Open or preview the portal and inspect its tasks, details, and stakeholder filters from the intended visitor's perspective.",
        "Enable the portal and distribute the current link to its intended audience. Recheck the visible work after changing stakeholder labels or presentation settings.",
      ] },
      { title: "Help a stakeholder find work", steps: [
        "Open the current portal link and enter its password if requested.",
        "Choose the relevant stakeholder and date range, or search for the task. Portal search can widen the read across years, so wait for its refreshed results.",
        "Switch view or grouping to inspect the work in a useful format, then open the task for the details available through the portal.",
        "Use Book a task for another request if the administrator has enabled it. If the action is absent, ask the team for its preferred request channel.",
      ] },
      { title: "Visibility and maintenance", bullets: [
        "Stakeholder labeling affects which work is associated with a department. Check the Stakeholder field when a task is missing or appears under the wrong group.",
        "Archived tasks and subitems are not presented as ordinary top-level portal requests. Linked copies can be collapsed to avoid repeated rows.",
        "Hiding columns tidies the page; the portal management screen explicitly does not treat that control as an access restriction.",
        "Close the portal to stop access, or regenerate its link when the old credential should stop working. Give visitors the new link after regeneration.",
        "If the portal reports stale data, check the connection and refresh before making decisions from the figures.",
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
        ["Internal board or task URL", "Navigate within the workspace; the reader needs the normal permissions."],
        ["Board share", "Give read-only access to the selected board and its supported content."],
        ["Task share", "Give read-only access to a particular task through its sharing controls."],
        ["Dashboard share", "Share a read-only reporting screen; managed by workspace administrators."],
        ["Stakeholder portal", "Provide the configured external request overview and optional booking entry point."],
        ["Invitation", "Onboard a member; this is separate from sharing work for viewing."],
      ] } },
      { title: "Share a board or task", steps: [
        "Open the board or task's Share controls with the required management access and create or enable its link.",
        "Choose who can open it. Workspace is for signed-in members and does not require a separate seat on that board or task. Anyone can open the link without an account.",
        "Configure an optional password and expiry where offered. Review the content the link exposes, including descriptions, Updates, asset details, and activity as applicable.",
        "Copy and open the link to inspect the read-only experience. Confirm the audience setting before passing the link to its readers.",
        "When access is no longer needed, stop sharing. Regenerating a link invalidates the previous address; distribute the replacement if access should continue.",
      ] },
      { title: "Share the dashboard", paragraphs: ["Workspace administrators can use the dashboard's Share control to create a read-only report link and manage its access settings. The public report carries reporting data rather than the board's complete descriptions, asset notes, emails, and links. Check the report itself and its audience before distributing it. Shared reports refresh periodically, so allow time for a recent board change to appear."] },
      { title: "Presentation is not access control", paragraphs: ["A hidden column, a selected filter, or a particular view is a display choice. Do not rely on it to remove information from a share payload. If a board contains content that the intended audience should not see, review the sharing scope or use an appropriately scoped alternative before sharing.", "A public link is an access credential. Send the intended link, keep any password distribution appropriate to its audience, and replace or stop it if the audience changes. A short task reference does not provide the same access."] },
    ],
    related: ["permissions", "portal", "dashboard"],
  },
  {
    id: "my-work",
    title: "Plan your day with My Work",
    category: "Personal work",
    summary: "Review assignments, prioritize deadlines, and keep your daily actions connected to the board.",
    audience: "Contributors",
    sections: [
      { title: "A daily routine", steps: [
        "Open Inbox and read the events and mentions that need a response. Open the affected task to see the full context before acting.",
        "Open My Work and review overdue work, current deadlines, upcoming work, and assignments without dates.",
        "Open each priority task, read Updates, and confirm the next action, date, and owner. Use the source board when you need more context.",
        "Update statuses and dates as the day changes. If a task is blocked or cannot meet its date, record the issue and involve the responsible lead.",
        "Before finishing, record progress and handoffs, complete delivered assets, and mark finished tasks using a done-role status.",
      ] },
      { title: "What this view represents", paragraphs: ["My Work collects your task assignments across accessible boards. Linked copies are collapsed so the same connected work is less likely to appear repeatedly. It is a planning view over existing board records; opening an assignment takes you back to that work.", "Deliverable-level assignment in Assets is separate from the task's People field. If you own an asset but not its parent task, also review the task's Assets tab and your team's delivery plan."] },
      { title: "If an assignment is missing", bullets: [
        "Check that you are signed in as the intended person and in the correct workspace.",
        "Confirm the task is assigned to you in a People column, and that you can access its board.",
        "Inspect completed, undated, and other date buckets, and check whether the item was archived.",
        "Check if a linked copy is already representing the work before creating another assignment.",
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
      { title: "Keep task context in Updates", paragraphs: ["Use Updates for briefs, decisions, progress notes, reviews, and final handovers. Rich text and mentions help make the message readable and draw the right person's attention. Include the action required and relevant date when asking for a response.", "The comment author can edit their own comment. The author or a workspace administrator can delete it, subject to access. Linked tasks may share an Updates conversation; check link exclusions if a discussion is not visible from another board."] },
      { title: "Read and act on Inbox", steps: [
        "Open Inbox and choose the notification or update you need to review.",
        "Open its source task or board and read the surrounding context. A notification is a pointer to the work, not necessarily its latest state.",
        "Take the action in the task, record any decision in Updates, and use the available read controls to keep the inbox manageable.",
        "Open Notification settings to adjust delivery by event type and board subscription.",
      ] },
      { title: "Notification delivery choices", table: { headers: ["Choice", "What happens"], rows: [
        ["Notify", "An attention badge and an operating-system notification if browser delivery is enabled and permitted."],
        ["Update", "A quiet inbox update with no operating-system interruption."],
        ["Off", "That event is not written to your inbox."],
        ["Unsubscribe from a board", "Stops its events reaching your inbox while retaining your board access."],
      ] } },
      { title: "Enable browser notifications", steps: [
        "In Notification settings, enable Notifications on this device and allow the site's browser permission when asked.",
        "Use Send a test to verify delivery. If blocked, change the site's notification permission in the browser and try again.",
        "Keep a Streamline tab open. Browser notifications in this app need an open tab; closing the app stops this delivery.",
      ] },
      { title: "Direct messages and profiles", paragraphs: ["Use Messages for a direct conversation with an active colleague. Use profiles for contact and role context. When a direct conversation changes a task's scope, deadline, or approval, summarize the outcome in that task's Updates so the working record remains understandable to the rest of the team."] },
    ],
    related: ["my-work", "tasks", "members"],
  },
  {
    id: "dashboard",
    title: "Dashboard and reporting",
    category: "Reporting and records",
    summary: "Read Overview, Demand & Delivery, and Resourcing with the right measures and date basis.",
    audience: "Team leads and workspace managers",
    sections: [
      { title: "Three reporting views", table: { headers: ["View", "Questions it helps answer"], rows: [
        ["Overview", "What is the output so far, how is it distributed, and what needs attention today?"],
        ["Demand & Delivery", "How do incoming requests and volume compare across periods, teams, departments, and asset types?"],
        ["Resourcing", "Who is carrying upcoming work, and what is overdue, undated, or unassigned?"],
      ] } },
      { title: "Set a consistent reporting scope", steps: [
        "Choose a period: year to date, year, quarter, month, or a custom range. Select the reporting year and comparison year where appropriate.",
        "Choose the team scope. Check whether you are reviewing the whole accessible workspace or only selected teams.",
        "Choose Tasks, Asset units, or Effort. Keep the same measure when comparing charts or discussing a figure with a colleague.",
        "In Filters, choose how work is counted in time. Requested uses when work arrived or was created; Scheduled uses its due date. Read the coverage information for records that cannot be placed in the selected period.",
        "Inspect the report labels and missing-data indicators before comparing numbers. Use Reset to defaults if previous filters make the report difficult to interpret.",
      ] },
      { title: "Understand the measures", table: { headers: ["Measure", "Interpretation"], rows: [
        ["Tasks", "Top-level delivery work, with linked copies deduplicated. The allocation queue is treated separately from normal delivery tasks."],
        ["Asset units", "Deliverable quantities, counting a line with no quantity as one. One task can represent many units."],
        ["Effort", "Estimated hours derived from asset quantities and configured output rates. This is not recorded time spent."],
        ["Unavailable / coverage gaps", "Missing information or unavailable comparison history; do not read it as a confirmed zero."],
      ] } },
      { title: "Run an operational review", steps: [
        "Start with Overview's overdue, upcoming, awaiting-allocation, and blocked work. These operational figures describe the current situation rather than simply reusing the historical reporting period.",
        "Open the underlying task or board from an available drill-down and verify the owner, date, status meaning, and outstanding assets.",
        "In Resourcing, select the planning window and stakeholder scope where needed. Review missing owners and dates alongside assigned work.",
        "Make assignment, status, quantity, and date corrections on the source tasks. Return to the dashboard after the data refreshes.",
      ] },
      { title: "Compare responsibly", paragraphs: ["Year-to-date comparisons align elapsed dates. A full-year figure and a partial year answer different questions, so read the displayed ranges before interpreting a percentage. A zero baseline and unavailable history are also different cases.", "The dashboard reflects the boards available to the signed-in user. Two people with different board access can see different totals. Task counts, asset units, estimated effort, board row counts, and active-work counts measure different things; they should not be expected to match.", "For a repeatable reporting routine, record the period, team scope, measure, and Requested/Scheduled basis alongside the findings. Review missing dates, types, rates, and assignees before treating a change in totals as a change in performance."] },
    ],
    related: ["assets", "settings", "sharing", "workflow"],
  },
  {
    id: "trackers",
    title: "Trackers and spreadsheet files",
    category: "Reporting and records",
    summary: "Create a workbook, edit typed cells, verify autosave, and exchange Excel or CSV files.",
    audience: "Workspace members maintaining structured records",
    sections: [
      { title: "When to use a tracker", paragraphs: ["Trackers provide spreadsheet-style workbooks for structured records that do not fit a task board. A tracker contains sheets with columns, rows, sections, and supported summaries. Use boards for assigned work and task conversations; use trackers when tabular records are the main object being maintained.", "Active workspace members other than guests can edit trackers. Trackers are workspace-wide rather than private Excel files stored only on your computer."] },
      { title: "Create and maintain a tracker", steps: [
        "Open Trackers and create a workbook from the available starting options, or import an existing workbook.",
        "Name the workbook and sheets clearly. Configure column types and dropdown values to match the data people should enter.",
        "Add rows and organize them with sections and subsections where useful. Enter a small sample and inspect totals or summary rows before expanding the record set.",
        "Edit the cells and use the available undo controls for recent changes in the current editing session. Do not treat undo as a replacement for a saved backup.",
        "Watch the save indicator and wait for a successful save before navigating away, switching context, or closing the tab. Resolve save errors while the draft is still available.",
      ] },
      { title: "Import and export", paragraphs: ["The workbook export produces an .xlsx file with supported formatting, dropdowns, and summary formulas. The export menu also offers CSV for the current sheet. CSV is useful for plain tabular interchange but does not preserve workbook presentation or multiple sheets.", "When importing Excel, inspect the result rather than assuming every feature has transferred. The tracker supports a smaller model than Excel. Imported formulas use cached results, and unsupported workbook features may not round-trip. Keep the source workbook when its original formulas, layout, or advanced behavior matter."], steps: [
        "Retain the source file and import a copy into Trackers.",
        "Check sheet names, headers, data types, dropdowns, representative rows, and totals against the original.",
        "Wait for the imported or edited sheet to save, then export when a handover or offline copy is needed.",
        "Open the exported file and verify the sheets and figures required by the recipient.",
      ] },
    ],
    related: ["data", "permissions", "troubleshooting"],
  },
  {
    id: "members",
    title: "Members and onboarding",
    category: "Administration",
    summary: "Invite colleagues, manage roles, and handle pending or departing members.",
    audience: "Workspace owners and administrators",
    sections: [
      { title: "Invite a colleague", steps: [
        "Open Members and add or invite the person using their correct details and intended workspace role.",
        "Copy the generated invitation link and send it to that person through your normal communication channel. The app does not automatically email the invitation.",
        "The recipient opens the link, sets a password, and completes their profile. Membership becomes active after onboarding; pending members cannot use normal sign-in first.",
        "Add the active person to the appropriate teams and board roles. Confirm that they can open and edit the work required for their role.",
      ] },
      { title: "Handle invitation problems", bullets: [
        "If a pending invitation expires or is lost, regenerate it and send the new link. The old credential stops working.",
        "For an already-onboarded person, use the appropriate existing-member onboarding or account workflow rather than assuming a pending invitation still applies.",
        "Check the member's status when they cannot sign in or do not appear in assignment, mention, or messaging choices.",
        "Read the confirmation before cancelling an invitation or membership. Cancellation can have account and membership consequences beyond hiding a link.",
      ] },
      { title: "Change roles and offboard", steps: [
        "Review the person's tasks, assets, board ownership, and team responsibilities before removing access. Reassign open work and document handovers.",
        "Set the intended workspace role and explicit board roles. A workspace role and a board role answer different access questions.",
        "Deactivate departing members through Members. Their historical identity can remain available in records while active assignment and collaboration choices exclude them.",
        "Review separately distributed public links and portal credentials if the departure changes who should hold those links.",
      ] },
      { title: "Use View as carefully", paragraphs: ["Administrators can preview another person's visible workspace with View as. This helps understand navigation and apparent access, but it does not sign you in as that colleague. Writes retain the administrator's actual identity. Exit the preview before continuing normal administration, and use the member's own sign-in when verifying their actual account experience."] },
    ],
    related: ["permissions", "collaboration", "sharing"],
  },
  {
    id: "permissions",
    title: "Roles and access",
    category: "Administration",
    summary: "Understand workspace roles, board roles, visibility, and the reasons an edit may be unavailable.",
    audience: "Everyone; especially board owners and administrators",
    sections: [
      { title: "Workspace roles", table: { headers: ["Role", "Typical scope"], rows: [
        ["Owner / Admin", "Manage the workspace and members, access system entities, and manage dashboard sharing. Board-specific checks still matter."],
        ["Member", "Create boards and teams, edit trackers, and work on boards where editing access is granted."],
        ["Guest", "Limited access; ordinary boards require ownership or explicit membership. No general board/team creation or tracker editing."],
      ] } },
      { title: "Board roles and visibility", paragraphs: ["Board roles are Owner, Editor, and Viewer. Owners and editors can edit task data; viewers can read it. Board management has additional ownership or workspace administration checks. Board visibility determines inherited access and does not replace explicit board membership."], table: { headers: ["Situation", "Effective ordinary-board access"], rows: [
        ["Inactive workspace membership", "No ordinary-board access from the current permission resolver."],
        ["Literal board owner", "Owner, while membership is active."],
        ["Explicit board membership", "Its assigned role; an explicit Viewer can take precedence over inherited editing."],
        ["Workspace administrator without an earlier board role", "Editor for ordinary board access; separate management permissions also apply."],
        ["Workspace-visible board", "Viewer for an active non-guest member."],
        ["Team-visible board", "Editor for a member of that team when no earlier rule applies."],
        ["Private board", "No extra inherited access; ownership, explicit membership, or administration is needed."],
      ] } },
      { title: "Common access surprises", bullets: [
        "Task Allocation and other built-in system entities have an administrator-only gate before normal board rules.",
        "Belonging to a board's team does not automatically make a workspace-visible board editable; explicit editing access may still be needed.",
        "An explicit Viewer membership can explain why someone expected to inherit editing still sees read-only content.",
        "Public and workspace share links have their own configured access behavior. Sharing does not assign the reader an editing role.",
        "Hiding a column, archiving a team, muting notifications, and filtering a view are not substitutes for changing access.",
      ] },
      { title: "Resolve an access issue", steps: [
        "Confirm the correct signed-in account, workspace, and active membership.",
        "Ask the board owner or administrator to inspect ownership, explicit board membership, visibility, and team membership in that order.",
        "If the intended access is editing, grant the appropriate role rather than merely sharing a viewing link.",
        "Retry with the actual user's session. If the interface and saved permissions disagree, record the affected board, action, and error for the administrator to investigate.",
      ] },
    ],
    related: ["members", "boards", "sharing"],
  },
  {
    id: "settings",
    title: "Settings, lists, and output rates",
    category: "Administration",
    summary: "Maintain shared vocabulary, estimate output effort, and distinguish personal preferences.",
    audience: "Administrators and anyone checking workspace configuration",
    sections: [
      { title: "Settings directory", table: { headers: ["Section", "Purpose"], rows: [
        ["General", "Workspace name and identity; authorized administrators can save changes."],
        ["Teams", "Create, edit, archive, or restore teams and inspect their people and boards."],
        ["Permissions", "A quick overview of workspace and board role concepts."],
        ["Lists", "Shared asset types, stakeholder vocabulary, and output rates."],
        ["View", "Personal display preferences, including team item counts, stored on this device."],
        ["Data", "Storage information and, in local mode, JSON export, import, and demo reset."],
        ["Documentation", "This searchable user guide and the complete request-to-delivery workflow."],
        ["About", "Application version and environment information in a dialog."],
      ] } },
      { title: "Edit shared lists", steps: [
        "Open Settings → Lists as a workspace owner or administrator and select the list you want to maintain.",
        "Add or rename options and choose their colors. Prefer a consistent vocabulary that everyone can understand and use in booking, boards, assets, and reports.",
        "When removing an option, review its existing usage and the offered replacement or keep behavior. Decide what should happen to work already carrying that value.",
        "Review the full draft, then Save. Changes remain a draft until saved; use Discard to abandon them.",
        "Check affected task values, asset types, and stakeholder classifications after a rename or removal. Stakeholder identity and portal visibility make those changes operationally significant.",
      ] },
      { title: "Configure output rates", paragraphs: ["Output rates belong to asset-type rows in Lists. Set the rate and its unit using the controls on the row, then save the draft. A rename moves the associated rate with that asset type; removing a type also requires reviewing its rate and existing use.", "These rates translate recorded deliverable quantities into estimated effort for reporting. Agree a realistic standard with the team and review it when production expectations change. A missing rate means incomplete estimation coverage, not free work or zero time spent."] },
      { title: "Personal preferences and other controls", paragraphs: ["View settings stay on the current device and affect your own display. Theme choices are available through the app's appearance controls, including More on phones. Notification settings live in Inbox, board-specific controls live with the board, and portal management lives in Stakeholder Portal.", "Use General to change the workspace name; the displayed workspace URL identifies the workspace separately. Use About when an administrator needs the app version to investigate a problem."] },
    ],
    related: ["assets", "portal", "data", "members"],
  },
  {
    id: "data",
    title: "Saving, local data, and recovery",
    category: "Administration",
    summary: "Understand shared versus browser-local storage and use export, import, and reset correctly.",
    audience: "All users; recovery actions for administrators",
    sections: [
      { title: "Two storage modes", table: { headers: ["Mode", "Where the work lives", "What to expect"], rows: [
        ["Shared workspace", "The configured Supabase backend.", "Authorized people access shared records across devices. Connection and permissions affect saves."],
        ["Local demo", "This browser profile at this site's origin.", "Refresh preserves completed writes, but a different browser, device, hostname, or port has a separate store."],
      ] }, paragraphs: ["Settings → Data explains the active storage mode. Switching environments or storage modes does not move records between them. A local demo link does not create a shared backend for another person's browser."] },
      { title: "Know when your work is saved", bullets: [
        "Board edits use the app's data actions; watch for errors and verify the value after an uncertain save.",
        "Tracker edits autosave after a short delay. Wait for a successful save indicator before leaving.",
        "Settings forms such as General and Lists have explicit Save actions. A visible draft is not the same as a committed change.",
        "If the app warns about unsaved work, remain on the page and resolve the save or intentionally discard the draft.",
        "Avoid clearing browser storage while trying to recover local work; it may contain the only copy.",
      ] },
      { title: "Export and restore a local demo", steps: [
        "Open Settings → Data in local mode and choose Export data. Keep the resulting Streamline JSON file in a location you can find again.",
        "Before importing, export the current local data if you might need it. Import replaces the browser's existing local dataset rather than merging records.",
        "As an authorized owner or administrator, choose Import data and select a previously exported Streamline JSON file.",
        "Read the filename, record counts, and replacement confirmation. Proceed only when this is the dataset you intend to restore.",
        "After the reload, verify the expected account, workspace, boards, and tasks. You may be signed out if the restored file does not contain your current account.",
      ], note: { title: "Import and reset replace local work", text: "Reset demo data restores the original demonstration dataset and loses local changes. Export first when those changes matter. A tracker .xlsx export is a different file and cannot serve as a whole-workspace JSON restore." } },
      { title: "Shared workspace recovery", paragraphs: ["The Supabase Data screen does not offer the local provider's full export/import/reset workflow. Shared database backups and restoration are handled by the workspace's technical administrator. Report the time, affected records, and last known correct state when requesting recovery; do not reset demo data or import an unrelated local file expecting it to repair the shared workspace."] },
    ],
    related: ["trackers", "settings", "troubleshooting"],
  },
  {
    id: "mobile",
    title: "Using Streamline on a phone",
    category: "Personal work",
    summary: "Find the mobile navigation and keep everyday task updates manageable on a small screen.",
    audience: "People working away from their desktop",
    sections: [
      { title: "Find your way around", paragraphs: ["The phone layout uses a bottom navigation bar instead of the desktop sidebar. Browse provides the workspace directory. More collects destinations used less often, including Dashboard, Stakeholder Portal, Messages, Members, Settings, profile, and appearance controls.", "Settings sections appear as a horizontal row on smaller screens; scroll the row to reach Documentation. Within this guide, use Browse chapters or search to move between topics."] },
      { title: "A quick mobile update", steps: [
        "Open My Work or Browse and choose the task's board.",
        "Use the board's mobile search, filters, and view controls to find the task, then open its details.",
        "Read the recent conversation and update the relevant status, owner, or date where editing is permitted. Post a concise Update for the next person.",
        "Check the save or error feedback before leaving. For dense planning or workbook review, use a larger screen when that makes the records easier to inspect.",
      ] },
      { title: "Appearance and notifications", paragraphs: ["Choose a theme from More to suit your environment. Portal visitors have their own portal theme choice, separate from the internal workspace preference. Browser notification support depends on the browser; use its permission controls and the app's test action, and remember that this notification delivery requires an open Streamline tab."] },
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
        "Check the workspace, board, account, and whether you are in a View as preview.",
        "Clear search and filters, return to Main Table, expand relevant groups or parents, and inspect the archive.",
        "For bookings, check the receipt: the task may have arrived directly on a team board or moved out of Task Allocation.",
        "For My Work, check task-level assignment and linked copies. For the portal, check stakeholder labels and date filters.",
        "Ask the board owner to verify access before creating a replacement task.",
      ] },
      { title: "I can open the board but cannot edit", paragraphs: ["Workspace visibility commonly grants Viewer access. Check your explicit board role and team visibility with the owner. An explicit Viewer seat can override inherited editing. Shared boards and portal boards are read-only viewing experiences; use the internal workspace and an appropriate editing role to make changes."] },
      { title: "The dashboard totals look wrong", bullets: [
        "Compare the same workspace, accessible boards, teams, period, comparison range, measure, and Requested/Scheduled basis.",
        "Check whether you are comparing tasks with asset units or estimated hours. Those are different measures.",
        "Check missing dates, types, quantities, output rates, and assignments. Read coverage and unavailable indicators.",
        "Remember that linked copies may be deduplicated, subitems are not top-level tasks, and current operational counts differ from a historical report.",
        "Open representative records and fix source data before interpreting a discrepancy as a reporting failure.",
      ] },
      { title: "A completed task still looks open", paragraphs: ["Ask the board manager to check that the selected status label carries the done role. Check asset completion separately and inspect remaining subitems. A renamed label, a checked box, or a finished asset does not automatically establish the completion state of every related record."] },
      { title: "A save or upload failed", steps: [
        "Keep the page open and preserve the current text or draft. Check the connection and read the specific error message.",
        "Confirm you still have permission and that the account session is valid. Retry only after addressing the reported issue.",
        "For an image upload, check the accepted image type and size shown by the control. Shared workspaces also depend on configured media storage.",
        "For a booking with an uncertain response, check for an existing request before resubmitting. For a tracker, wait for the save indicator to recover before leaving.",
      ] },
      { title: "A link or invitation no longer opens", paragraphs: ["Check that the full current link was copied. An invitation can expire, be accepted, or be replaced; a share can expire, be stopped, or be regenerated; a portal can be closed or require a changed password. Ask the administrator or link owner for the current access. A Workspace share also requires a signed-in member account."] },
      { title: "Notifications are missing", paragraphs: ["Check the event's Notify / Update / Off setting, the board subscription, browser notification permission, and whether a Streamline tab remains open. Quiet Updates intentionally avoid operating-system notifications. Use Send a test after changing the browser permission."] },
      { title: "What to include when asking for help", bullets: [
        "Workspace and board or tracker name, task reference if available, and the action you attempted.",
        "Expected result, actual result, the exact visible error, and approximate time.",
        "Your role, browser/device, whether the issue persists after a safe refresh, and the app version from Settings → About.",
        "A screenshot of the relevant state if useful. Avoid including passwords or publicly forwarding invitation, portal, or share credentials.",
      ] },
    ],
    related: ["permissions", "data", "dashboard", "booking"],
  },
  {
    id: "glossary",
    title: "Glossary and working conventions",
    category: "Reference",
    summary: "A shared vocabulary for tasks, assets, allocation, reporting, and access.",
    audience: "Everyone",
    sections: [
      { title: "Terms you will see", table: { headers: ["Term", "Meaning"], rows: [
        ["Workspace", "The shared container for the team's people, boards, trackers, and configuration."],
        ["Team", "A group of people and boards with related responsibilities."],
        ["Board / group", "A board holds work; a group organizes items inside it."],
        ["Item / task", "A record of work with its own identity, fields, description, and discussion."],
        ["Subitem", "A child task underneath a parent task."],
        ["Asset line / asset unit", "A deliverable record / its quantity. A missing quantity counts as one unit."],
        ["PIC / assignee", "The person or people responsible for a task or deliverable."],
        ["Stakeholder", "The group the work is for, selected from shared workspace vocabulary."],
        ["Booking / brief", "An incoming request / the context and requirements supplied for it."],
        ["Task Allocation", "The administrator-only incoming queue for requests without a valid direct destination."],
        ["Allocation", "Moving a queued request onto the board responsible for delivery."],
        ["Linked task", "A separate item on another board with supported synchronization and optional shared Updates."],
        ["Dependency", "A relationship to other items on the same board used in planning."],
        ["Done / stuck / progress role", "The configured meaning of a status label, separate from its visible name."],
        ["Requested / Scheduled", "Reporting by arrival/creation date / due date."],
        ["Effort / output rate", "Estimated production hours / the configured rate used to estimate them from asset quantities."],
        ["Archive", "Remove work from active views while retaining the ability to find or restore it."],
        ["Share / portal", "A separately authorized viewing link / the external stakeholder work overview."],
      ] } },
      { title: "Recommended team conventions", bullets: [
        "Give each task a clear outcome, an agreed responsible person, and a useful date.",
        "Maintain task fields for planning, Assets for deliverables, and Updates for decisions.",
        "Use standard stakeholder and asset-type vocabulary so filters and reporting remain coherent.",
        "Record scope and deadline changes where the next contributor can find them.",
        "Check deliverables and task status before closing work, and archive deliberately after handover.",
        "When quoting a report, include its date range, team scope, measure, and reporting basis.",
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
  const lines = ["# Streamline user guide", "", "A practical guide to the workspace, with a detailed request-to-delivery workflow.", "", "Booking form editor instructions are pending completion of the editor update.", "", "## Contents", "", ...GUIDE_ARTICLES.map((article, index) => `${index + 1}. ${article.title}`), ""];
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
