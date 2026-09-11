import { Tooltip as RadixTooltip } from "radix-ui";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import type { DashboardFacts, TaskFact, TeamRef } from "@/features/dashboard/analytics";
import { WorkloadSection } from "@/features/dashboard/views/workload-section";
import type { DashboardViewProps } from "@/features/dashboard/views/types";

const TODAY = "2026-09-10";
const ALPHA: TeamRef = { id: "t-alpha", name: "Melbourne", color: "blue" };

const user = (id: string, displayName: string) => ({
  id,
  email: `${id}@rmit.local`,
  firstName: displayName,
  lastName: "",
  displayName,
  avatarUrl: null,
  jobTitle: "Designer",
  department: null,
  timezone: "Australia/Melbourne",
  deactivatedAt: null,
  createdAt: TODAY,
  updatedAt: TODAY,
});

const task = (id: string, owners: string[], dueDate: string | null, status: TaskFact["status"] = "progress", department: TaskFact["department"] = null): TaskFact =>
  ({
    id,
    name: id,
    boardId: "b1",
    team: ALPHA,
    owners,
    status,
    isDone: status === "done",
    priority: null,
    dueDate,
    createdAt: "2026-08-01",
    completedAt: null,
    assetUnits: 2,
    isIntake: false,
    request: null,
    department,
    linkedTo: null,
  }) as unknown as TaskFact;

/** Two people carrying work of different shapes, and one task nobody owns. */
const facts: DashboardFacts = {
  // Danh: one in progress soon, one already late. Emily: one, on time.
  tasks: [task("late", ["u-danh"], "2026-08-01"), task("soon", ["u-danh"], "2026-09-14"), task("emily-one", ["u-emily"], "2026-09-20"), task("orphan", [], "2026-09-15")],
  requests: [],
  assets: [],
  teams: [ALPHA],
  users: new Map([
    ["u-danh", user("u-danh", "Danh Nguyen")],
    ["u-emily", user("u-emily", "Emily Carter")],
  ]) as DashboardFacts["users"],
  boards: new Map(),
  years: [2026],
  earliest: "2024-01-01",
};

/**
 * The avatars use a Radix tooltip, whose provider the app supplies far above
 * this component. Rendering the section on its own has to stand it in.
 */
const inProvider = (node: React.ReactElement) => render(<RadixTooltip.Provider>{node}</RadixTooltip.Provider>);

const props = {
  facts,
  prefs: { weeks: 4, teamIds: null, measure: "tasks", stakeholderGroup: null },
  // Read in tasks, which is what the bars count whatever the toolbar says.
  measure: "tasks",
  valueOf: () => 1,
  set: vi.fn(),
  today: TODAY,
} as unknown as DashboardViewProps;

const COMM = { id: "d-comm", name: "Comm.", inferred: false };
const EVENTS = { id: "d-events", name: "Events", inferred: false };

/** The same two people, with their work spread over two stakeholder groups. */
const grouped: DashboardFacts = {
  ...facts,
  tasks: [
    task("comm-late", ["u-danh"], "2026-08-01", "progress", COMM),
    task("comm-soon", ["u-danh"], "2026-09-14", "progress", COMM),
    task("events-one", ["u-danh"], "2026-09-16", "progress", EVENTS),
    task("comm-emily", ["u-emily"], "2026-09-20", "progress", COMM),
  ],
};

const groupedProps = (stakeholderGroup: string | null = null) =>
  ({ ...props, facts: grouped, prefs: { ...(props.prefs as object), stakeholderGroup } }) as unknown as DashboardViewProps;

/**
 * Who is carrying what.
 *
 * This replaced a seven-column table of counts, so what matters is that the
 * shape says what the numbers said: a bar each, split by the state the work is
 * in, longest for whoever is carrying most — and the exact counts still
 * reachable, because a manager reporting upwards needs those.
 */
describe("the workload section", () => {
  it("gives every person a row, and keeps work nobody owns out of them", () => {
    const { container } = inProvider(<WorkloadSection {...props} />);
    const names = [...container.querySelectorAll('[data-testid="dashboard-workload-row"]')].map((row) => row.textContent ?? "");
    expect(names.some((t) => t.includes("Danh Nguyen"))).toBe(true);
    expect(names.some((t) => t.includes("Emily Carter"))).toBe(true);
    // Unowned work is nobody's workload, so it is a line in the note rather
    // than a row among the people — and it is still not quietly dropped.
    expect(names.some((t) => t.includes("Nobody assigned"))).toBe(false);
    expect(screen.getByText(/have no owner at all/)).toBeInTheDocument();
  });

  it("draws the longest bar for whoever is carrying most", () => {
    const { container } = inProvider(<WorkloadSection {...props} />);
    const rows = [...container.querySelectorAll('[data-testid="dashboard-workload-row"]')];
    // The fill inside the track, as a percentage of the busiest load.
    const widthOf = (row: Element) => parseFloat((row.querySelector("span.absolute") as HTMLElement | null)?.style.width ?? "0");
    const danh = rows.find((r) => r.textContent?.includes("Danh"))!;
    const emily = rows.find((r) => r.textContent?.includes("Emily"))!;
    // Two tasks against one, so Danh's bar is the full width and Emily's half.
    expect(widthOf(danh)).toBeGreaterThan(widthOf(emily));
    expect(widthOf(danh)).toBe(100);
  });

  it("puts the whole of a person's load at the cursor, since the row only has room for the shape", async () => {
    const u = userEvent.setup();
    const { container } = inProvider(<WorkloadSection {...groupedProps()} />);
    const row = [...container.querySelectorAll('[data-testid="dashboard-workload-row"]')].find((r) => r.textContent?.includes("Danh"))!;
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await u.hover(row);
    const tip = screen.getByRole("tooltip");
    // The total, the states behind the bar, and who the work is for — the
    // three things the row itself cannot say.
    expect(tip).toHaveTextContent("Danh Nguyen");
    expect(tip).toHaveTextContent("3");
    expect(tip).toHaveTextContent("In progress");
    expect(tip).toHaveTextContent("Comm. 2");
  });

  it("says how much of somebody's load is already late", () => {
    inProvider(<WorkloadSection {...props} />);
    // Called out beside the total, because it is the number that needs acting on.
    expect(screen.getByText("1 late")).toBeInTheDocument();
  });

  it("gives the exact counts a panel of their own, on the page rather than behind a click", () => {
    inProvider(<WorkloadSection {...props} />);
    // A manager reporting upwards needs the exact figures, and a disclosure at
    // the foot of the bars is where they went unread.
    const figures = screen.getByTestId("dashboard-workload-figures");
    expect(figures).toHaveTextContent("Per-person figures");
    expect(within(figures).getByRole("table")).toBeInTheDocument();
    // Work nobody has picked up is not a person: it stays a bar above and a
    // line in the note, and is not a row in a table of people.
    expect(figures).not.toHaveTextContent("Nobody assigned");
  });

  it("says these are association counts, because a task with two owners is counted twice", () => {
    inProvider(<WorkloadSection {...props} />);
    expect(screen.getByText(/association counts/)).toBeInTheDocument();
  });
});

/**
 * How much a person is doing for one stakeholder group.
 *
 * The question a manager arrives with is "how much of Danh's week is for
 * Communications", and the answer has to be the same number the unfiltered
 * panel is made of — so the filter narrows what is already counted rather than
 * counting again.
 */
describe("the stakeholder group filter", () => {
  it("offers every group with work in the window, and how much each has", async () => {
    inProvider(<WorkloadSection {...groupedProps()} />);
    await userEvent.click(screen.getByTestId("dashboard-stakeholder-filter"));
    expect(screen.getByTestId("dashboard-stakeholder-comm.")).toHaveTextContent("Comm.");
    expect(screen.getByTestId("dashboard-stakeholder-comm.")).toHaveTextContent("3");
    expect(screen.getByTestId("dashboard-stakeholder-events")).toHaveTextContent("Events");
  });

  it("remembers the choice as a preference rather than as component state", async () => {
    const set = vi.fn();
    inProvider(<WorkloadSection {...groupedProps()} set={set} />);
    await userEvent.click(screen.getByTestId("dashboard-stakeholder-filter"));
    await userEvent.click(screen.getByTestId("dashboard-stakeholder-comm."));
    expect(set).toHaveBeenCalledWith({ stakeholderGroup: "comm." });
  });

  it("counts only that group's work once one is chosen", () => {
    const { container } = inProvider(<WorkloadSection {...groupedProps("events")} />);
    const rows = [...container.querySelectorAll('[data-testid="dashboard-workload-row"]')].map((r) => r.textContent ?? "");
    // Emily has nothing for Events, so she is not a row of noughts.
    expect(rows.some((t) => t.includes("Danh"))).toBe(true);
    expect(rows.some((t) => t.includes("Emily"))).toBe(false);
    expect(screen.getByText(/Work for Events/)).toBeInTheDocument();
  });

  it("says which group is showing, and offers the way back", () => {
    inProvider(<WorkloadSection {...groupedProps("comm.")} />);
    expect(screen.getByText("Show every stakeholder group")).toBeInTheDocument();
  });

  it("gives the whole grid when no group is chosen, so one click is not needed per group", () => {
    inProvider(<WorkloadSection {...groupedProps()} />);
    const table = screen.getByTestId("dashboard-workload-matrix").querySelector("table")!;
    expect(table.textContent).toContain("Comm.");
    expect(table.textContent).toContain("Events");
    const danh = [...table.querySelectorAll("tbody tr")].find((r) => r.textContent?.includes("Danh"))!;
    // Two for Communications, one for Events, three in all.
    expect([...danh.querySelectorAll("td")].map((c) => c.textContent)).toEqual(["2", "1", "3"]);
  });
});
