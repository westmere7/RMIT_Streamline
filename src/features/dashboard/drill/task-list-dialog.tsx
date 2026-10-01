"use client";

import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import * as React from "react";
import { AvatarStack } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { User } from "@/domain";
import type { TaskFact } from "@/features/dashboard/analytics";
import { formatShortDate } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";
import type { DrillRequest } from "./drill";

const NO_TASKS: readonly TaskFact[] = [];

/** As many as the archive shows: a page that reads, not a wall. */
const PAGE_SIZE = 50;

const SORTS = [
  { key: "due", label: "Due date" },
  { key: "created", label: "Created" },
  { key: "finished", label: "Finished" },
  { key: "name", label: "Name" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

const STATES = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "done", label: "Done" },
] as const;
type StateKey = (typeof STATES)[number]["key"];

/** The colour a status's meaning wears, whatever each board calls it. */
const STATUS_DOT: Record<string, string> = { done: "bg-emerald-500", progress: "bg-orange-500", stuck: "bg-red-500", other: "bg-sky-500", none: "bg-muted-foreground/40" };

/**
 * The tasks behind a dashboard figure, as a plain list.
 *
 * Read-only and flat, like the archive: no groups, no editing, a page of fifty
 * at a time. What it can do is narrow itself — a search, open or done, a team —
 * and those filters belong to this list alone; the dashboard underneath is
 * not touched by them. A row opens its task on its board.
 */
export function DashboardTaskListDialog({ request, users, onOpenChange, onOpenTask }: { request: DrillRequest | null; users: Map<string, User>; onOpenChange: (open: boolean) => void; onOpenTask?: (taskId: string, boardId: string) => void }) {
  const [query, setQuery] = React.useState("");
  const [state, setState] = React.useState<StateKey>("all");
  const [team, setTeam] = React.useState<string>("all");
  const [sort, setSort] = React.useState<SortKey>("due");
  const [page, setPage] = React.useState(0);

  // A new figure starts clean: its own filters, its first page.
  const [shownFor, setShownFor] = React.useState<DrillRequest | null>(null);
  if (request !== shownFor) {
    setShownFor(request);
    setQuery("");
    setState("all");
    setTeam("all");
    setSort("due");
    setPage(0);
  }

  const tasks = request?.tasks ?? NO_TASKS;
  const teams = React.useMemo(() => [...new Map(tasks.map((t) => [t.team.id, t.team.name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [tasks]);
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = tasks.filter(
      (t) =>
        (state === "all" || (state === "done" ? t.isDone : !t.isDone)) &&
        (team === "all" || t.team.id === team) &&
        (!q || t.name.toLowerCase().includes(q) || (t.ticket ?? "").toLowerCase().includes(q) || t.boardName.toLowerCase().includes(q)),
    );
    const key = (t: TaskFact): string => (sort === "due" ? (t.dueDate ?? "9999") : sort === "created" ? t.createdAt : sort === "finished" ? (t.flow.finishedAt ?? t.completedAt ?? "") : t.name.toLowerCase());
    // Dates newest first except due dates, which read soonest first; names A to Z.
    const dir = sort === "created" || sort === "finished" ? -1 : 1;
    return [...rows].sort((a, b) => key(a).localeCompare(key(b)) * dir || a.name.localeCompare(b.name));
  }, [tasks, query, state, team, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const rows = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const narrowed = query.trim() !== "" || state !== "all" || team !== "all";

  return (
    <Dialog open={request !== null} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-[1100px]" data-testid="dashboard-task-list">
        <DialogHeader className="border-b border-border/60 px-5 pt-4 pb-3">
          <DialogTitle className="flex items-baseline gap-2 pr-8">
            {request?.title}
            <span className="text-[13px] font-normal text-muted-foreground tabular">{tasks.length.toLocaleString()} {tasks.length === 1 ? "task" : "tasks"}</span>
          </DialogTitle>
          <DialogDescription>{request?.subtitle ?? "The tasks behind this figure."}</DialogDescription>
        </DialogHeader>

        {/* Filters for this list only. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-5 py-2.5">
          <div className="relative w-full max-w-64">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search name, ticket or board"
              aria-label="Search these tasks"
              className="h-8 pl-8 text-[13px]"
              data-testid="dashboard-task-list-search"
            />
          </div>
          <Segmented options={STATES} value={state} onChange={(v) => (setState(v), setPage(0))} label="Open or done" />
          {teams.length > 1 && (
            <select
              value={team}
              onChange={(e) => {
                setTeam(e.target.value);
                setPage(0);
              }}
              aria-label="Team"
              className="h-8 rounded-md border border-border/70 bg-card px-2 text-[13px]"
              data-testid="dashboard-task-list-team"
            >
              <option value="all">All teams</option>
              {teams.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          )}
          <label className="ml-auto flex items-center gap-1.5 text-2xs text-muted-foreground">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-8 rounded-md border border-border/70 bg-card px-2 text-[13px] text-foreground" data-testid="dashboard-task-list-sort">
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {narrowed && (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-2xs" onClick={() => (setQuery(""), setState("all"), setTeam("all"), setPage(0))}>
              <X className="size-3.5" /> Clear
            </Button>
          )}
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
          {rows.length === 0 ? (
            <p className="px-5 py-14 text-center text-[13px] text-muted-foreground">{tasks.length === 0 ? "No tasks behind this figure." : "Nothing matches these filters."}</p>
          ) : (
            <table className="w-full min-w-[760px] border-collapse text-[13px]">
              <thead className="sticky top-0 z-10 bg-card text-2xs font-medium text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="w-24 py-2 pr-2 pl-5 text-left font-medium">Ticket</th>
                  <th className="py-2 pr-3 text-left font-medium">Task</th>
                  <th className="w-36 py-2 pr-3 text-left font-medium">Status</th>
                  <th className="w-24 py-2 pr-3 text-left font-medium">PIC</th>
                  <th className="w-32 py-2 pr-3 text-left font-medium">Department</th>
                  <th className="w-24 py-2 pr-3 text-left font-medium">Due</th>
                  <th className="w-24 py-2 pr-5 text-left font-medium">Finished</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((task) => {
                  const owners = task.owners.map((id) => users.get(id)).filter((u): u is User => !!u);
                  const finished = task.flow.finishedAt?.slice(0, 10) ?? task.completedAt;
                  const late = !task.isDone && task.dueDate !== null && task.dueDate < new Date().toISOString().slice(0, 10);
                  const open = onOpenTask ? () => (onOpenTask(task.id, task.boardId), onOpenChange(false)) : undefined;
                  return (
                    <tr
                      key={task.id}
                      onClick={open}
                      onKeyDown={open ? (e) => (e.key === "Enter" ? open() : undefined) : undefined}
                      tabIndex={open ? 0 : undefined}
                      className={cn("border-b border-border/40", open && "cursor-pointer hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none")}
                      data-testid="dashboard-task-list-row"
                    >
                      <td className="py-2 pr-2 pl-5 font-mono text-2xs text-muted-foreground">{task.ticket ?? "—"}</td>
                      <td className="max-w-0 py-2 pr-3">
                        <p className="truncate font-medium" title={task.name}>
                          {task.name}
                        </p>
                        <p className="truncate text-2xs text-muted-foreground">
                          {task.boardName}
                          {task.team.name ? ` · ${task.team.name}` : ""}
                        </p>
                      </td>
                      <td className="py-2 pr-3">
                        <span className="inline-flex max-w-full items-center gap-1.5">
                          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[task.status] ?? STATUS_DOT.other)} />
                          <span className="truncate">{task.statusLabel ?? "No status"}</span>
                        </span>
                      </td>
                      <td className="py-2 pr-3">{owners.length ? <AvatarStack users={owners} size="xs" max={3} /> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="truncate py-2 pr-3 text-muted-foreground">{task.department?.name ?? "—"}</td>
                      <td className={cn("py-2 pr-3 tabular", late ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>{task.dueDate ? formatShortDate(task.dueDate) : "—"}</td>
                      <td className="py-2 pr-5 text-muted-foreground tabular">{task.isDone && finished ? formatShortDate(finished) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <footer className="flex items-center gap-3 border-t border-border/60 px-5 py-2.5 text-2xs text-muted-foreground">
          <span className="tabular" data-testid="dashboard-task-list-range">
            {filtered.length === 0 ? "0" : `${(current * PAGE_SIZE + 1).toLocaleString()}–${(current * PAGE_SIZE + rows.length).toLocaleString()}`} of {filtered.length.toLocaleString()}
            {narrowed ? ` (filtered from ${tasks.length.toLocaleString()})` : ""}
          </span>
          {pages > 1 && (
            <span className="ml-auto flex items-center gap-1">
              <Button variant="outline" size="icon-sm" className="size-7" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page" data-testid="dashboard-task-list-prev">
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="px-1.5 tabular">
                Page {current + 1} of {pages}
              </span>
              <Button variant="outline" size="icon-sm" className="size-7" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Next page" data-testid="dashboard-task-list-next">
                <ChevronRight className="size-3.5" />
              </Button>
            </span>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function Segmented<K extends string>({ options, value, onChange, label }: { options: ReadonlyArray<{ key: K; label: string }>; value: K; onChange: (value: K) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex items-center rounded-full border border-border/70 p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn("h-7 rounded-full px-2.5 text-2xs font-medium transition-colors", value === o.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
