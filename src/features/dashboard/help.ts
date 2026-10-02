/**
 * What each dashboard panel shows, and what it means for the team — the text
 * behind the small "?" on every panel. Written for a marketing manager reading
 * the page to run the team, not for whoever built it: what the figure is, how
 * it is counted, what a good or worrying reading looks like, and what to do
 * about it. Kept in one place so the page explains itself in one voice, and so
 * a panel cannot ship without saying why it is there.
 *
 * Each line has to stay true to how the figure is worked out (analytics.ts,
 * metrics.ts, flow.ts); change the sum, change the words.
 */
export type HelpTopic =
  | "effort"
  | "tasks"
  | "assets"
  | "byMonth"
  | "byTeam"
  | "byDepartment"
  | "priority"
  | "assetTypes"
  | "workTypes"
  | "operations"
  | "workload"
  | "matrix"
  | "turnaround"
  | "onTime"
  | "sentBack"
  | "inAndOut"
  | "aging"
  | "service";

export interface PanelHelpText {
  /** What the figure is, in a sentence. */
  shows: string;
  /** How it is counted: what is in, what is out, and what it is compared with. */
  counted: string;
  /** What a good reading and a worrying one look like. */
  read: string;
  /** What a manager can do about it. */
  act: string;
}

export const DASHBOARD_HELP: Record<HelpTopic, PanelHelpText> = {
  workTypes: {
    shows: "What kind of work the period's deliverables came to: one spoke per work type, this period as the solid shape and the same stretch last year dashed.",
    counted:
      "Each deliverable counts towards the work types its asset type belongs to (Settings → Asset types), in the measure the page is read in: tasks with work of that type, asset units, or hours by the output rates. An asset type in two work types counts in both, so the shares can add up to more than the total. Asset types with no work type are left out and named under the list. Pick a person to see only the deliverables they are in charge of, against their own last year.",
    read: "A shape that leans one way is a team whose output is mostly one kind of work; a rounder one is a team spread across several. Compare it with the dashed shape: a spoke that grew is demand moving that way. For one person, the shape is where their time went, not what they are good at.",
    act: "When a spoke keeps growing, check the people behind it are not the same two or three, and plan hiring, training or freelance help for it. A spoke that shrank may be work the team stopped being asked for, or work going elsewhere; ask the departments that used to book it.",
  },
  effort: {
    shows: "The hours of work the period's deliverables add up to: the team's output, weighed by how long each kind of asset takes.",
    counted:
      "Every asset line's quantity times the rate set for its type in Settings → Asset types (an 8-hour day, a 5-day week). Types with no rate count as nothing, so the figure is only as complete as the rates. Compared with the same stretch last year.",
    read: "This is the closest thing to capacity on the page. A rise of 20% with the same headcount means each person is doing a fifth more. Tasks flat while hours climb means the jobs are getting bigger, not more numerous.",
    act: "Set it against the hours the team actually has (people × working days × about 6 productive hours). Near or above that line, something has to give: a deadline, the scope, or extra help from an agency or freelancer.",
  },
  tasks: {
    shows: "How many pieces of work landed in the period, against the same stretch last year.",
    counted:
      "Every top-level task on the team's boards, archived ones included; a task mirrored onto two boards counts once, and requests still on Task Allocation are not counted until they are placed. Dated by the toolbar's choice: when it was requested, or when it is due.",
    read: "The volume of asks. A rise here usually shows up as pressure on deadlines a few weeks later. A drop is not always good news: check whether requests are going round the team instead of through it.",
    act: "Use it when agreeing the year's plan with stakeholders: \"we handled 40% more requests than last year with the same team\" is the case for help, or for saying no to some work.",
  },
  assets: {
    shows: "What the team actually produced inside those tasks, counted in units: a request for twelve social tiles counts as twelve.",
    counted: "The quantity on every asset line of every counted task; a line with no quantity counts as one. Dated the same way as the tasks, and compared with the same stretch last year.",
    read: "Tasks can stay flat while units climb: one campaign request now asks for more sizes, formats and languages. That is where the hours go, and it rarely shows in a count of tasks.",
    act: "When units per task keep rising, standardise: templates, master layouts and agreed size sets for campaigns cut the cost of each extra unit.",
  },
  byMonth: {
    shows: "The chosen measure month by month, this year beside last year, with a marker at today.",
    counted:
      "Each month's tasks, units or hours, dated by the toolbar's choice. The months this year has not reached yet show last year's figure as pale bars, as a guide to what is coming; they are never part of the comparison.",
    read: "The shape matters more than any one month. Last year's peaks (Open Day, enrolment, semester starts, campaign launches) tend to come back at the same time, and the pale bars show them before they arrive.",
    act: "Plan for the peaks two months out: book freelancers, agree cut-off dates with requesters, and move routine work out of the busy months. A month running well ahead of last year is an early warning, not a trophy.",
  },
  byTeam: {
    shows: "Which teams carry the most of the period's work, in the chosen measure.",
    counted: "Each task belongs to the team whose board it sits on. The five busiest teams are shown; the filter at the top narrows the whole page to some teams.",
    read: "Some imbalance is natural (a production team makes more units than a strategy team), but a team far ahead of the rest month after month is usually becoming the default for work others could take.",
    act: "Click a team's name to see its board and people. If one team is always on top, move a kind of request elsewhere, or add someone to that team before its turnaround starts to slip.",
  },
  byDepartment: {
    shows: "Which departments, schools or units the period's work is for.",
    counted:
      "Read from the task's department column against the list in Settings → Departments, or failing that from the requester's own department. Work with no department is left out here and counted in the note at the foot of the page.",
    read: "This is who the team really serves. A department with a large share and a fast-growing one both deserve a conversation; a department you expected to see and do not may be commissioning agencies directly.",
    act: "Take the top departments' figures to your stakeholder meetings: agree priorities and lead times with the biggest requesters, and use the numbers to show them the value they get from the team.",
  },
  priority: {
    shows: "How the period's tasks split across the priority levels.",
    counted: "The priority set on each task (Low, Medium, High, Critical, or whatever the board calls them), most urgent first. Tasks with none set show as No priority.",
    read: "A healthy split has most work at Medium. When High and Critical make up most of it, priority has stopped meaning anything and the team is triaging by who shouts loudest. A large No priority share means requesters are skipping the field.",
    act: "Agree with requesters what earns High and Critical (a fixed launch date, a legal or safety need) and hold the line. Fewer urgent jobs protects the time the team spends on the work that matters.",
  },
  assetTypes: {
    shows: "The period's deliverables by type. The bigger the block, the more units, or the more hours when the page is read in effort.",
    counted: "Every asset line's quantity, grouped by its type; lines without a type are shown as Untyped. In effort, each type is weighed by its rate, so a few videos can outweigh hundreds of social tiles.",
    read: "This is what the team spends its time making. Compare the map in units with the map in hours: the types that are small in number but large in hours are where the effort goes.",
    act: "For a type that dominates, build templates or a style kit, or give it an owner. For a type that is large in hours but low in value, question whether every request for it needs to be bespoke.",
  },
  operations: {
    shows: "The state of the work right now, whatever period the page is set to: what is late, due soon, waiting for an owner, or stuck.",
    counted:
      "Open and overdue: not done, with a due date before today. Due within 7 days: not done, due in the next week. Awaiting allocation: requests with no team and nobody assigned. Blocked: work whose status means stuck. A task can be in more than one, so they are not a total.",
    read: "Overdue is the one to watch week to week. A steady number is a backlog the team has learnt to live with; a rising one means work is arriving faster than it leaves. Anything awaiting allocation is a requester who has not heard back.",
    act: "Use it as a Monday checklist: give every waiting request an owner, clear what is blocked (usually a missing approval or asset), and re-agree dates on overdue work rather than letting it sit.",
  },
  workload: {
    shows: "Who is carrying what: each person's open work due in the window, plus anything overdue or undated, split by the state it is in.",
    counted:
      "Tasks where the person is a PIC (owner). A task with two owners counts for both, so the bars add up to more than the real number of tasks. The 2w, 4w and 8w buttons set how far ahead to look; the department filter narrows it to work for one department.",
    read: "Look at the length of each bar and at the red late figure beside it. A long bar that is mostly scheduled is a full diary; a long bar that is mostly overdue is someone who is drowning. A short bar may be someone with room, or someone working off the boards.",
    act: "Rebalance before a person's overdue share grows: move a job, push a date, or pair someone up. Check it before saying yes to a big new request, and before approving leave in a busy month.",
  },
  matrix: {
    shows: "Each person's work, split by the department it is for.",
    counted: "The same work as the bars above, in the chosen measure, with a column per department; the departments with the least work share a final column.",
    read: "It shows who the go-to person is for each department. One name carrying most of a department's work is a risk: when they are away, that department's work stalls.",
    act: "Spread knowledge of the biggest departments across at least two people, and use it to decide who joins which stakeholder meeting.",
  },
  turnaround: {
    shows: "How long work takes, from the task being created to being done, as the middle value for work finished in the period.",
    counted:
      "Days from a task being made to its last move into Done, for tasks finished in the period, compared with the same stretch last year. The middle value (median), so one job that sat for months does not skew it. Break it down by team or by department with the buttons.",
    read: "This is the lead time requesters actually get. A rising figure means work is waiting longer somewhere: in the queue, on approvals, or in rework. A department much slower than the rest often has briefs that arrive incomplete, or approvers who are slow to reply.",
    act: "Publish it as the lead time requesters should plan around (\"allow two weeks\"). When it creeps up, look at what is blocked and what was sent back, and chase the approvals that hold work up.",
  },
  onTime: {
    shows: "How reliable the team's deadlines are: of the work finished in the period that had a due date, the share done on or before it.",
    counted:
      "Tasks finished in the period that carry a due date, done on or before that date. It measures against the due date as it stands today, so a deadline that was moved counts against the new date. Compared with the same stretch last year, and by team or department.",
    read: "Above 80% is a team whose dates can be trusted. Below 60%, deadlines are being set too tight or too much is in flight at once. A low figure for one department often means its requests arrive late, or with dates that were never realistic.",
    act: "Agree realistic lead times per asset type and hold requesters to them. Push back on dates at the brief, not the week of delivery; a date that moves early is kept, a date that slips late is a broken promise.",
  },
  sentBack: {
    shows: "How much work needed another round: of the work finished in the period, the share that went back at least once on its way.",
    counted:
      "A task counts as sent back if it was reopened after being marked Done, or moved from a review or approval status back to work. The subtitle shows how many returns there were in all. Compared with the same stretch last year, and by team or department.",
    read: "Some rework is normal for creative work (a round of amends is part of the job). A high rate, or one rising, costs the time twice. When one department's rate is far above the others, the cause is usually the brief, not the team.",
    act: "For the departments with the highest rates, tighten the brief: required fields in the booking form, a kick-off call for big jobs, and one named approver instead of a committee. For a team with a high rate, look at its internal review step.",
  },
  inAndOut: {
    shows: "Whether the team is keeping up: new tasks against finished tasks, month by month (week by week for a short period).",
    counted:
      "New is tasks created in the month; finished is tasks that moved to Done in it. The figure under each month is what it did to the backlog (+ means more came in than went out), and the finish rate is finished as a share of new over the period.",
    read: "A month or two above the line is normal around a peak. More in than out month after month means the backlog is growing and deadlines will start to slip. A finish rate near 100% is a team keeping pace; well below it is one falling behind.",
    act: "When the backlog grows for three months running, act before it shows up as overdue work: pause low-value requests, bring in help, or agree with stakeholders which work waits.",
  },
  aging: {
    shows: "Where open work is stalling: each status's open tasks, split by how long each has sat in that status.",
    counted:
      "Open tasks only, by the time since their last change of status (since they were made, for tasks that never moved). Bands are under 3 days, 3 to 6, 1 to 2 weeks, and 2 weeks or more; the statuses with most work waiting a week or more come first. Click a band to see its tasks. Kanban cards show the same age.",
    read: "Some work sits for good reason. A status where most work is amber or red is a queue nobody is clearing: approvals waiting on a stakeholder, or work started and then parked. It catches stalls nobody marked Stuck.",
    act: "Go through the red band each week: move it on, mark it Stuck with a reason, or close it. A review status that keeps filling up needs a named approver and a deadline for feedback.",
  },
  service: {
    shows: "How each requesting department is being served: what it has open and waiting, and how quickly and reliably its work comes back.",
    counted:
      "Open, Waiting and Oldest are as of now: work in hand on the boards, requests not yet placed on a board, and the oldest open task's age. Picked up is the median time from a task being made to its first change of status, for work made in the period. Finished, Turnaround, On time and Sent back are for work finished in the period, counted as in the panels above. Work that names no department is left out. Figures past a usual limit show in red.",
    read: "This is the service each stakeholder actually gets. A department with long pick-up times is waiting in the queue; one with a low on-time share or a high sent-back share usually has briefs or dates that need work at the start.",
    act: "Share the row with each department's lead. Agree a pick-up time and a lead time per department, and use the slowest rows to decide where briefs, approvers or capacity need fixing first.",
  },
};
