"use client";

import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from "lucide-react";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatHours, MIN_RADAR_WORK_TYPES, normaliseWorkTypes } from "@/domain";
import { formatCount, niceScale, usePrefersReducedMotion } from "@/features/dashboard/charts/chart-utils";
import { useRevealed, useSprings } from "@/features/dashboard/charts/motion";
import { ChartEmpty } from "@/features/dashboard/charts/ranked-bars";
import type { DashboardFacts } from "@/features/dashboard/analytics";
import { useDrill } from "@/features/dashboard/drill/drill";
import { Panel } from "@/features/dashboard/panels";
import { workTypeContributors, workTypeProfile, type WorkTypeRow } from "@/features/dashboard/work-types";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";
import type { DashboardViewProps } from "./types";

const TEAM = "__team__";
const UNIT_WORDS = { tasks: "tasks", assets: "units", effort: "hours" } as const;

/**
 * Work types: how much of each kind of work the period's deliverables came to, as a radar.
 *
 * One spoke per work type, the filled shape this period and the dashed one the
 * same stretch last year, so a team that turned from print to video shows it
 * as a shape that leaned. Pick a person and it is their profile — the lines
 * they were in charge of — against their own last year. Beside it, each work type
 * in figures: how much, what share, how it moved, what it was made of. A work type
 * opens the tasks behind it.
 */
export function WorkTypeProfilePanel({ facts, report, rates, measure, workTypes: rawWorkTypes }: Pick<DashboardViewProps, "facts" | "report" | "rates" | "measure"> & { workTypes: unknown }) {
  const workTypes = React.useMemo(() => normaliseWorkTypes(rawWorkTypes), [rawWorkTypes]);
  const drill = useDrill();
  const [subject, setSubject] = React.useState<string>(TEAM);
  const personId = subject === TEAM ? null : subject;
  const current = report.current.assets;
  const previous = report.comparison?.assets ?? null;
  const contributors = React.useMemo(() => workTypeContributors(current, workTypes), [current, workTypes]);
  // A person who drops out of the period reads as the whole team again.
  const person = personId && contributors.some((c) => c.userId === personId) ? personId : null;
  const profile = React.useMemo(() => workTypeProfile(current, previous, workTypes, measure, rates, person), [current, previous, workTypes, measure, rates, person]);
  const format = measure === "effort" ? formatHours : formatCount;
  const unit = UNIT_WORDS[measure];
  const [active, setActive] = React.useState<string | null>(null);

  const openWorkType = (row: WorkTypeRow) =>
    drill?.({
      title: row.workType.name,
      subtitle: `${report.period.label} · ${row.topTypes.map((t) => t.type).slice(0, 3).join(", ") || "no deliverables"}${person ? ` · ${facts.users.get(person)?.displayName ?? ""}` : ""}`,
      tasks: facts.tasks.filter((t) => row.taskIds.has(t.id)),
    });

  const subjectPicker = contributors.length > 0 && (
    <Select value={person ?? TEAM} onValueChange={setSubject}>
      <SelectTrigger className="h-8 w-48 text-[13px]" aria-label="Whose profile" data-testid="dashboard-work-types-subject">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TEAM}>Whole team</SelectItem>
        {contributors.slice(0, 40).map((c) => {
          const user = facts.users.get(c.userId);
          return (
            <SelectItem key={c.userId} value={c.userId}>
              <span className="flex items-center gap-2">
                {user && <UserAvatar user={user} size="xs" tooltip={false} />}
                {user?.displayName ?? "Someone who has left"}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );

  if (workTypes.workTypes.length < MIN_RADAR_WORK_TYPES) {
    return (
      <Panel title="Work types" subtitle="Deliverables by the kind of work" help="workTypes" className="p-4" testId="dashboard-work-types">
        <ChartEmpty message={workTypes.workTypes.length === 0 ? "Group the asset types into work types in Settings → Asset types to see this." : `The radar needs at least ${MIN_RADAR_WORK_TYPES} work types — Settings → Asset types.`} />
      </Panel>
    );
  }

  const ranked = [...profile.rows].sort((a, b) => b.value - a.value);
  const leader = ranked[0] && ranked[0].value > 0 ? ranked[0] : null;
  const growth = profile.rows
    .filter((r) => r.comparison !== null && r.comparison > 0)
    .map((r) => ({ row: r, change: (r.value - r.comparison!) / r.comparison! }))
    .sort((a, b) => b.change - a.change);
  const riser = growth[0] && growth[0].change > 0 ? growth[0] : null;
  const quietest = ranked.length > 1 ? ranked[ranked.length - 1] : null;
  const balance = profile.total > 0 ? 1 - (leader?.value ?? 0) / profile.total : 0;

  return (
    <Panel
      title="Work types"
      help="workTypes"
      subtitle={`${report.period.label} · ${unit} by work type${report.comparison ? ` · dashed is ${report.period.comparisonLabel}` : ""}${person ? ` · ${facts.users.get(person)?.displayName ?? ""}` : ""}`}
      action={subjectPicker || undefined}
      className="p-4"
      testId="dashboard-work-types"
    >
      {profile.total === 0 && (profile.comparisonTotal ?? 0) === 0 ? (
        <ChartEmpty message={person ? "Nothing in this period was theirs." : "No deliverables in this period."} />
      ) : (
        <div className="grid items-center gap-6 xl:grid-cols-[minmax(0,40rem)_minmax(0,1fr)]" onMouseLeave={() => setActive(null)}>
          <Radar rows={profile.rows} total={profile.total} format={format} unit={unit} active={active} onActive={setActive} onOpen={drill ? openWorkType : undefined} hasComparison={profile.comparisonTotal !== null} currentLabel={report.period.label} comparisonLabel={report.period.comparisonLabel} />

          <div className="min-w-0">
            {/* Three things worth saying out loud, read off the shape. */}
            <div className="mb-3 grid gap-2 sm:grid-cols-3" data-testid="dashboard-work-types-insights">
              <Insight label="Largest" value={leader ? leader.workType.name : "—"} detail={leader ? `${Math.round((leader.value / profile.total) * 100)}% of the ${unit}` : "Nothing yet"} color={leader ? colorClasses(leader.workType.color).hex : undefined} />
              <Insight label="Rising" value={riser ? riser.row.workType.name : "—"} detail={riser ? `+${Math.round(riser.change * 100)}% on ${report.period.comparisonLabel}` : report.comparison ? "Nothing grew" : "No earlier period"} color={riser ? colorClasses(riser.row.workType.color).hex : undefined} />
              <Insight label="Spread" value={balance >= 0.6 ? "Balanced" : balance >= 0.4 ? "Leaning" : "Concentrated"} detail={quietest ? `Least: ${quietest.workType.name}` : ""} />
            </div>

            <p className="mb-1 flex items-baseline gap-1.5 px-2 text-2xs text-muted-foreground">
              <span className="text-[15px] font-semibold text-foreground tabular">{format(profile.total)}</span> {unit}
              {profile.comparisonTotal !== null && <span>· {format(profile.comparisonTotal)} in {report.period.comparisonLabel}</span>}
            </p>
            {/*
              The list and every work type's card share one cell, so the cell is
              as tall as the tallest of them and never changes: in focus, one
              card shows in place of the list rather than the panel growing.
            */}
            <div className="grid">
              <ul className={cn("col-start-1 row-start-1 grid content-start gap-1 transition-[opacity,visibility] duration-200", active !== null && "invisible opacity-0")} data-testid="dashboard-work-types-legend">
                {ranked.map((row) => (
                  <li key={row.workType.id}>
                    <button
                      type="button"
                      onClick={drill ? () => openWorkType(row) : undefined}
                      onMouseEnter={() => setActive(row.workType.id)}
                      onFocus={() => setActive(row.workType.id)}
                      className={cn("w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent/40", !drill && "cursor-default")}
                      data-testid="dashboard-work-type-row"
                    >
                      <LegendHead row={row} total={profile.total} format={format} />
                      {row.topTypes.length > 0 && (
                        <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
                          {row.topTypes
                            .slice(0, 3)
                            .map((t) => `${t.type} ×${formatCount(t.units)}`)
                            .join(" · ")}
                          {row.topTypes.length > 3 ? ` · +${row.topTypes.length - 3} more` : ""}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              {ranked.map((row) => {
                const on = active === row.workType.id;
                const hex = colorClasses(row.workType.color).hex;
                return (
                  <button
                    key={row.workType.id}
                    type="button"
                    tabIndex={on ? 0 : -1}
                    aria-hidden={!on}
                    onClick={drill ? () => openWorkType(row) : undefined}
                    className={cn("col-start-1 row-start-1 self-start rounded-lg border bg-card px-3 py-2.5 text-left transition-[opacity,visibility] duration-200", on ? "visible opacity-100" : "invisible opacity-0", !drill && "cursor-default")}
                    style={{ borderColor: `color-mix(in oklab, ${hex} 40%, transparent)` }}
                    data-testid={on ? "dashboard-work-type-card" : undefined}
                  >
                    <LegendHead row={row} total={profile.total} format={format} />
                    <WorkTypeDetail row={row} total={profile.total} format={format} unit={unit} comparisonLabel={report.period.comparisonLabel} users={facts.users} hex={hex} canOpen={!!drill} />
                  </button>
                );
              })}
            </div>
            {profile.unassignedUnits > 0 && (
              <p className="mt-2 px-2 text-2xs text-muted-foreground" data-testid="dashboard-work-types-unassigned">
                {formatCount(profile.unassignedUnits)} {profile.unassignedUnits === 1 ? "unit" : "units"} in types with no work type ({profile.unassignedTypes.slice(0, 3).join(", ")}
                {profile.unassignedTypes.length > 3 ? "…" : ""}) are not drawn — Settings → Asset types.
              </p>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

/** A work type's line: its colour and name, its figure and share, how it moved, and its bar. */
function LegendHead({ row, total, format }: { row: WorkTypeRow; total: number; format: (value: number) => string }) {
  const share = total > 0 ? row.value / total : 0;
  const hex = colorClasses(row.workType.color).hex;
  const change = row.comparison !== null && row.comparison > 0 ? (row.value - row.comparison) / row.comparison : null;
  const done = row.units > 0 ? Math.round((row.doneUnits / row.units) * 100) : null;
  return (
    <>
      <span className="flex items-center gap-2 text-xs">
        <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: hex }} />
        <span className="min-w-0 flex-1 truncate font-medium">{row.workType.name}</span>
        <span className="font-semibold tabular">{format(row.value)}</span>
        <span className="w-10 text-right text-2xs text-muted-foreground tabular">{Math.round(share * 100)}%</span>
        <Change value={change} />
      </span>
      <span className="mt-1 flex items-center gap-2">
        <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-strong/70">
          <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${share * 100}%`, background: hex }} />
        </span>
        {done !== null && <span className="shrink-0 text-2xs text-muted-foreground tabular">{done}% delivered</span>}
      </span>
    </>
  );
}

/** The detail a segment opens into: the figures against last year, what it is made of, and who is doing it. */
function WorkTypeDetail({ row, total, format, unit, comparisonLabel, users, hex, canOpen }: { row: WorkTypeRow; total: number; format: (value: number) => string; unit: string; comparisonLabel: string; users: DashboardFacts["users"]; hex: string; canOpen: boolean }) {
  const change = row.comparison !== null && row.comparison > 0 ? (row.value - row.comparison) / row.comparison : null;
  const delivered = row.units > 0 ? row.doneUnits / row.units : 0;
  const typePeak = Math.max(1, ...row.topTypes.map((t) => t.units));
  return (
    <span className="mt-2.5 block border-t border-border/60 pt-2.5" data-testid="dashboard-work-type-detail">
      <span className="grid grid-cols-3 gap-1.5">
        <DetailStat label="This period" value={format(row.value)} />
        <DetailStat label={comparisonLabel} value={row.comparison !== null ? format(row.comparison) : "—"} />
        <DetailStat label="Change" value={change === null ? "—" : `${change > 0 ? "+" : ""}${Math.round(change * 100)}%`} tone={change === null ? undefined : change >= 0 ? "up" : "down"} />
        <DetailStat label="Share" value={total > 0 ? `${Math.round((row.value / total) * 100)}%` : "—"} />
        <DetailStat label="Tasks" value={formatCount(row.taskIds.size)} />
        <DetailStat label="Overdue" value={formatCount(row.overdueLines)} tone={row.overdueLines > 0 ? "down" : undefined} />
      </span>

      <span className="mt-2.5 flex items-center gap-2 text-2xs">
        <span className="w-16 shrink-0 text-muted-foreground">Delivered</span>
        <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-strong/70">
          <span className="block h-full rounded-full" style={{ width: `${delivered * 100}%`, background: hex }} />
        </span>
        <span className="shrink-0 tabular">
          {formatCount(row.doneUnits)} of {formatCount(row.units)} units
        </span>
      </span>

      <span className="mt-2.5 grid gap-3 sm:grid-cols-2">
        <span className="block min-w-0">
          <span className="mb-1 block text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Made of</span>
          {row.topTypes.slice(0, 6).map((t) => (
            <span key={t.type} className="mb-1 flex items-center gap-2 text-2xs">
              <span className="w-28 shrink-0 truncate" title={t.type}>
                {t.type}
              </span>
              <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-strong/70">
                <span className="block h-full rounded-full opacity-80" style={{ width: `${(t.units / typePeak) * 100}%`, background: hex }} />
              </span>
              <span className="w-10 shrink-0 text-right tabular">×{formatCount(t.units)}</span>
            </span>
          ))}
          {row.topTypes.length === 0 && <span className="text-2xs text-muted-foreground">No deliverables.</span>}
        </span>
        <span className="block min-w-0">
          <span className="mb-1 block text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Who is doing it</span>
          {row.people.slice(0, 5).map((p) => {
            const user = users.get(p.userId);
            return (
              <span key={p.userId} className="mb-1 flex items-center gap-2 text-2xs">
                {user && <UserAvatar user={user} size="xs" tooltip={false} />}
                <span className="min-w-0 flex-1 truncate">{user?.displayName ?? "Someone who has left"}</span>
                <span className="shrink-0 text-muted-foreground tabular">{formatCount(p.units)} units</span>
              </span>
            );
          })}
          {row.people.length > 5 && <span className="text-2xs text-muted-foreground">and {row.people.length - 5} more</span>}
          {row.people.length === 0 && <span className="text-2xs text-muted-foreground">Nobody in charge yet.</span>}
        </span>
      </span>
      {canOpen && <span className="mt-1.5 block text-2xs text-muted-foreground">Click for the {formatCount(row.taskIds.size)} tasks · in {unit}</span>}
    </span>
  );
}

function DetailStat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <span className="block rounded-md bg-surface-strong/50 px-1.5 py-1">
      <span className="block truncate text-[9px] font-semibold tracking-wide text-muted-foreground uppercase" title={label}>
        {label}
      </span>
      <span className={cn("block text-[12px] font-semibold tabular", tone === "up" && "text-emerald-600 dark:text-emerald-400", tone === "down" && "text-red-600 dark:text-red-400")}>{value}</span>
    </span>
  );
}

function Insight({ label, value, detail, color }: { label: string; value: string; detail: string; color?: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-surface/50 px-3 py-2">
      {color && <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />}
      <p className="flex items-center gap-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label === "Largest" && <Sparkles className="size-3" />}
        {label}
      </p>
      <p className="truncate text-[13px] font-semibold">{value}</p>
      <p className="truncate text-2xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="w-12" />;
  const flat = Math.abs(value) < 0.005;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex w-12 items-center justify-end gap-0.5 text-2xs tabular", flat ? "text-muted-foreground" : value > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
      <Icon className="size-3" />
      {flat ? "0%" : `${Math.abs(Math.round(value * 100))}%`}
    </span>
  );
}

// Room round the rim for each label's three short lines, so nothing spills
// out of the box into the legend beside it.
const SIZE = 720;
const C = SIZE / 2;
const R = 210;

/**
 * The radar itself, flat: rings at a nice scale with their values, a degree
 * scale round the rim, a spoke per work type, last year as a dashed outline
 * with hollow points, this period as a solid shape with a value marker on each
 * point, and each work type named at the rim with its share and how it moved.
 * It grows from the centre when the dashboard reveals. Hovering a work type —
 * here or in the legend — lights its slice and opens its row in the legend into the detail.
 */
function Radar({
  rows,
  total,
  format,
  unit,
  active,
  onActive,
  onOpen,
  hasComparison,
  currentLabel,
  comparisonLabel,
}: {
  rows: WorkTypeRow[];
  total: number;
  format: (value: number) => string;
  unit: string;
  active: string | null;
  onActive: (id: string | null) => void;
  onOpen?: (row: WorkTypeRow) => void;
  hasComparison: boolean;
  currentLabel: string;
  comparisonLabel: string;
}) {
  const revealed = useRevealed();
  const peak = Math.max(1, ...rows.map((r) => Math.max(r.value, r.comparison ?? 0)));
  const { top, ticks } = niceScale(peak, 4, unit !== "hours");
  const n = rows.length;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const at = (i: number, radius: number) => [C + radius * Math.cos(angle(i)), C + radius * Math.sin(angle(i))] as const;
  // Every point rides a spring as a share of the scale: the shapes grow out of
  // the centre when the dashboard reveals, and on a new period, person or
  // measure they morph from the old values to the new rather than jumping.
  const reach = useSprings(Object.fromEntries(rows.flatMap((r) => [[`${r.workType.id}:now`, Math.max(0, r.value) / top], [`${r.workType.id}:was`, Math.max(0, r.comparison ?? 0) / top]])), "gentle");
  const pointAt = (i: number, key: "now" | "was") => at(i, (reach[`${rows[i]!.workType.id}:${key}`] ?? 0) * R);
  const shape = (key: "now" | "was") => rows.map((_, i) => pointAt(i, key).join(",")).join(" ");
  // The lines draw themselves in once, as the page reveals: the rim, then the spokes, then the outline.
  const still = usePrefersReducedMotion();
  const draw = (delay: number, duration = 900): React.CSSProperties => (still ? {} : { strokeDasharray: 1, strokeDashoffset: revealed ? 0 : 1, transition: `stroke-dashoffset ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms` });
  const fade = (delay: number, duration = 500): React.CSSProperties => (still ? {} : { opacity: revealed ? 1 : 0, transition: `opacity ${duration}ms ease-out ${delay}ms` });

  return (
    <div className="relative mx-auto w-full max-w-[40rem]" data-testid="dashboard-work-types-radar">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full overflow-visible" role="img" aria-label={`Work types: ${rows.map((r) => `${r.workType.name} ${format(r.value)}`).join(", ")}`}>
        {/* The plate: one flat disc under everything, so the web reads as an object. */}
        <circle cx={C} cy={C} r={R + 14} className="fill-surface/60" />
        <circle cx={C} cy={C} r={R + 14} fill="none" className="stroke-border/70" strokeWidth={1} pathLength={1} transform={`rotate(-90 ${C} ${C})`} style={draw(0, 1100)} />

        {/* Degree scale round the rim, a tick every 5°, longer every 45°. */}
        {Array.from({ length: 72 }, (_, k) => {
          const a = (k * 5 * Math.PI) / 180;
          const long = k % 9 === 0;
          const r0 = R + 14;
          const r1 = r0 + (long ? 7 : 3.5);
          // They arrive round the dial from the top, a sweep behind the rim.
          const order = (k + 18) % 72;
          return <line key={`deg-${k}`} x1={C + r0 * Math.cos(a)} y1={C + r0 * Math.sin(a)} x2={C + r1 * Math.cos(a)} y2={C + r1 * Math.sin(a)} className="stroke-border" strokeWidth={long ? 1.25 : 0.75} style={fade(order * 14, 250)} />;
        })}

        {/* Each work type's slice: faintly tinted always, lit while in focus. */}
        {rows.map((row, i) => {
          const a0 = angle(i) - Math.PI / n;
          const a1 = angle(i) + Math.PI / n;
          const lit = active === row.workType.id;
          return (
            <path
              key={`wedge-${row.workType.id}`}
              d={`M ${C} ${C} L ${C + R * Math.cos(a0)} ${C + R * Math.sin(a0)} A ${R} ${R} 0 0 1 ${C + R * Math.cos(a1)} ${C + R * Math.sin(a1)} Z`}
              fill={colorClasses(row.workType.color).hex}
              opacity={lit ? 0.16 : 0.035}
              className="transition-opacity duration-200"
            />
          );
        })}

        {/* Rings, alternating bands, and their values up the first spoke. */}
        {[...ticks]
          .filter((t) => t > 0)
          .reverse()
          .map((t, k) => (
            <circle key={`band-${t}`} cx={C} cy={C} r={(t / top) * R} className={k % 2 === 0 ? "fill-card/40" : "fill-transparent"} style={fade(150 + k * 80)} />
          ))}
        {ticks
          .filter((t) => t > 0)
          .map((t, k) => (
            <g key={`ring-${t}`} style={fade(200 + k * 120)}>
              {t === top ? (
                <circle cx={C} cy={C} r={R} fill="none" className="stroke-border" strokeWidth={1.25} pathLength={1} transform={`rotate(-90 ${C} ${C})`} style={draw(150, 1000)} />
              ) : (
                <circle cx={C} cy={C} r={(t / top) * R} fill="none" className="stroke-border" strokeWidth={1} strokeDasharray="1 5" strokeLinecap="round" />
              )}
              <rect x={C + 5} y={C - (t / top) * R - 8} width={format(t).length * 6.4 + 8} height={14} rx={7} className="fill-card" />
              <text x={C + 9} y={C - (t / top) * R + 2.5} className="fill-muted-foreground text-[10px] tabular-nums">
                {format(t)}
              </text>
            </g>
          ))}
        {rows.map((row, i) => {
          const [x, y] = at(i, R);
          return (
            <line
              key={`spoke-${row.workType.id}`}
              x1={C}
              y1={C}
              x2={x}
              y2={y}
              pathLength={1}
              className={cn("transition-[stroke,stroke-width] duration-200", active === row.workType.id ? "stroke-foreground/50" : "stroke-border")}
              strokeWidth={active === row.workType.id ? 1.5 : 1}
              style={draw(300 + i * 90, 600)}
            />
          );
        })}

        <g>
          {hasComparison && (
            <g style={fade(700, 600)}>
              <polygon points={shape("was")} className="fill-muted-foreground/5 stroke-muted-foreground/70" strokeWidth={1.5} strokeDasharray="6 5" strokeLinejoin="round" />
              {rows.map((row, i) => {
                const [x, y] = pointAt(i, "was");
                return <circle key={`was-${row.workType.id}`} cx={x} cy={y} r={3.5} className="fill-card stroke-muted-foreground/80" strokeWidth={1.5} />;
              })}
            </g>
          )}
          {/* The fill grows with the springs; its outline traces itself round on top. */}
          <polygon points={shape("now")} fill="var(--color-primary)" fillOpacity={0.16} />
          <polygon points={shape("now")} fill="none" stroke="var(--color-primary)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" pathLength={1} style={draw(450, 1300)} />
          {rows.map((row, i) => {
            const [x, y] = pointAt(i, "now");
            const lit = active === row.workType.id;
            const hex = colorClasses(row.workType.color).hex;
            return (
              <g key={`dot-${row.workType.id}`} style={fade(900 + i * 70, 300)}>
                {lit && <circle cx={x} cy={y} r={12} fill={hex} opacity={0.18} />}
                <circle cx={x} cy={y} r={lit ? 7 : 5.5} fill={hex} className="stroke-card transition-[r] duration-200" strokeWidth={2.5} />
              </g>
            );
          })}
        </g>

        {/* Over everything, one invisible slice per work type: hover a slice and it is in focus, click it for its tasks. */}
        {rows.map((row, i) => {
          const a0 = angle(i) - Math.PI / n;
          const a1 = angle(i) + Math.PI / n;
          const r = R + 14;
          return (
            <path
              key={`hit-${row.workType.id}`}
              d={`M ${C} ${C} L ${C + r * Math.cos(a0)} ${C + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${C + r * Math.cos(a1)} ${C + r * Math.sin(a1)} Z`}
              fill="transparent"
              className={cn(onOpen && "cursor-pointer")}
              onMouseEnter={() => onActive(row.workType.id)}
              onClick={onOpen ? () => onOpen(row) : undefined}
              data-testid="dashboard-work-type-slice"
            />
          );
        })}

        {/* The names round the rim: name, value and share, and how it moved. */}
        {rows.map((row, i) => {
          const a = angle(i);
          const [lx, ly] = at(i, R + 34);
          const anchor = Math.abs(Math.cos(a)) < 0.3 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
          const lit = active === row.workType.id;
          const hex = colorClasses(row.workType.color).hex;
          const change = row.comparison !== null && row.comparison > 0 ? (row.value - row.comparison) / row.comparison : null;
          // Three lines: above the rim they grow upwards, below it downwards, beside it centred.
          const y0 = Math.sin(a) < -0.5 ? ly - 34 : Math.sin(a) > 0.5 ? ly + 6 : ly - 10;
          return (
            <g
              key={`label-${row.workType.id}`}
              className={cn(onOpen && "cursor-pointer")}
              onMouseEnter={() => onActive(row.workType.id)}
              onClick={onOpen ? () => onOpen(row) : undefined}
              data-testid="dashboard-work-type-label"
            >
              <circle cx={lx} cy={y0 + 12} r={36} fill="transparent" />
              <text x={lx} y={y0} textAnchor={anchor} className={cn("text-[13px] font-semibold", lit ? "fill-foreground" : "fill-foreground/90")}>
                <tspan fill={hex}>● </tspan>
                {row.workType.name}
              </text>
              <text x={lx} y={y0 + 16} textAnchor={anchor} className="text-[12px] tabular-nums">
                <tspan className="fill-foreground font-semibold">{format(row.value)}</tspan>
                <tspan className="fill-muted-foreground">{total > 0 ? ` · ${Math.round((row.value / total) * 100)}%` : ""}</tspan>
              </text>
              {change !== null && (
                <text x={lx} y={y0 + 30} textAnchor={anchor} className={cn("text-[11px] tabular-nums", Math.abs(change) < 0.005 ? "fill-muted-foreground" : change > 0 ? "fill-emerald-600 dark:fill-emerald-400" : "fill-red-600 dark:fill-red-400")}>
                  {`${change > 0 ? "▲" : change < 0 ? "▼" : "•"} ${Math.abs(Math.round(change * 100))}%`}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* What the two shapes are. */}
      <div className="mt-1 flex items-center justify-center gap-4 text-2xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-4 rounded-sm border-2 border-primary bg-primary/15" /> {currentLabel}
        </span>
        {hasComparison && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-4 rounded-sm border-2 border-dashed border-muted-foreground/70" /> {comparisonLabel}
          </span>
        )}
      </div>
    </div>
  );
}

