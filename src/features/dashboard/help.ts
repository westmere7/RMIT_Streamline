/**
 * What each dashboard panel shows, and what it means for the team — the text
 * behind the small "?" on every panel. Kept in one place so the page explains
 * itself in one voice, and so a panel cannot ship without saying why it is there.
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
  | "operations"
  | "workload"
  | "matrix"
  | "turnaround"
  | "onTime"
  | "sentBack"
  | "inAndOut";

export const DASHBOARD_HELP: Record<HelpTopic, { shows: string; means: string }> = {
  effort: {
    shows: "The hours of work the period's deliverables add up to, from the output rates in Settings → Asset types.",
    means: "The closest figure to the team's capacity. Set it against the hours people actually have to see whether the load is realistic.",
  },
  tasks: {
    shows: "How many tasks landed in the period, against the same stretch last year.",
    means: "How much work came to the team. More tasks with the same people means everyone is carrying more.",
  },
  assets: {
    shows: "The deliverables inside those tasks, in units: twelve social tiles count as twelve.",
    means: "What the team actually produces. Tasks can stay flat while units climb, and that is where the hours go.",
  },
  byMonth: {
    shows: "The chosen measure month by month, this year beside last year. The pale bars are the rest of last year.",
    means: "Last year's busy months are the best guide to the next ones: line up help, or push back on deadlines, before the peak rather than in it.",
  },
  byTeam: {
    shows: "Which teams hold the most of the period's work.",
    means: "A lopsided split is a cue to rebalance, or to ask why one team has become the default for work others could take.",
  },
  byDepartment: {
    shows: "Which departments the period's work is for.",
    means: "Who the team serves most. Agree priorities with the biggest requesters, and use it to show them the value they get.",
  },
  priority: {
    shows: "How the period's tasks split by priority.",
    means: "If most work is high or critical, priority has stopped meaning anything. Agree with requesters what earns it.",
  },
  assetTypes: {
    shows: "The period's deliverables by type. The bigger the area, the more units, or hours when reading in effort.",
    means: "What the team spends its time making. A type that dominates may be worth a template, or an owner of its own.",
  },
  operations: {
    shows: "Right now: work that is overdue, due within a week, waiting for someone to pick it up, or blocked. A task can be in more than one.",
    means: "A lead's list for today: chase what is late, unblock what is stuck, and give every waiting request an owner.",
  },
  workload: {
    shows: "Each person's work due in the window, plus anything overdue or undated, split by the state it is in.",
    means: "Who is stretched and who has room. Rebalance before somebody's overdue share grows, not after.",
  },
  matrix: {
    shows: "Each person's work, split by the department it is for.",
    means: "Who is the go-to for which department. One name carrying a whole department is a risk when they are away.",
  },
  turnaround: {
    shows: "The median days from a task being made to its last move into Done, for work finished in the period.",
    means: "What to tell requesters to expect. When it rises, work is waiting longer somewhere: look at what is blocked or waiting on approval.",
  },
  onTime: {
    shows: "Of the work finished in the period that had a due date, the share done on or before it.",
    means: "How reliable the team's promises are. A low figure points to deadlines set too tight, or too much in flight at once.",
  },
  sentBack: {
    shows: "Of the work finished in the period, the share that went back at least once: reopened after Done, or returned from review.",
    means: "Rework costs the time twice. A high rate for one department usually means its briefs need more detail up front.",
  },
  inAndOut: {
    shows: "New tasks against finished tasks, month by month, and what each month did to the backlog.",
    means: "More in than out, month after month, means the backlog is growing and deadlines will slip unless something gives.",
  },
};
