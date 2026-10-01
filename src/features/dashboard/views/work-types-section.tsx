"use client";

import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from "lucide-react";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatHours, MIN_RADAR_WORK_TYPES, normaliseWorkTypes } from "@/domain";
import { formatCount, niceScale } from "@/features/dashboard/charts/chart-utils";
import { useRevealed } from "@/features/dashboard/charts/motion";
import { ChartEmpty } from "@/features/dashboard/charts/ranked-bars";
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
      <Panel title="Work types" subtitle="Deliverables by the kind of work" className="p-4" testId="dashboard-work-types">
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
      subtitle={`${report.period.label} · ${unit} by work type${report.comparison ? ` · dashed is ${report.period.comparisonLabel}` : ""}${person ? ` · ${facts.users.get(person)?.displayName ?? ""}` : ""}`}
      action={subjectPicker || undefined}
      className="p-4"
      testId="dashboard-work-types"
    >
      {profile.total === 0 && (profile.comparisonTotal ?? 0) === 0 ? (
        <ChartEmpty message={person ? "Nothing in this period was theirs." : "No deliverables in this period."} />
      ) : (
        <div className="grid items-center gap-6 xl:grid-cols-[minmax(0,36rem)_minmax(0,1fr)]">
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
            <ul className="grid gap-1" data-testid="dashboard-work-types-legend">
              {ranked.map((row) => {
                const share = profile.total > 0 ? row.value / profile.total : 0;
                const hex = colorClasses(row.workType.color).hex;
                const change = row.comparison !== null && row.comparison > 0 ? (row.value - row.comparison) / row.comparison : null;
                const done = row.units > 0 ? Math.round((row.doneUnits / row.units) * 100) : null;
                return (
                  <li key={row.workType.id}>
                    <button
                      type="button"
                      onClick={drill ? () => openWorkType(row) : undefined}
                      onMouseEnter={() => setActive(row.workType.id)}
                      onMouseLeave={() => setActive(null)}
                      onFocus={() => setActive(row.workType.id)}
                      onBlur={() => setActive(null)}
                      className={cn("group w-full rounded-lg px-2 py-1.5 text-left transition-colors", active === row.workType.id ? "bg-accent/60" : "hover:bg-accent/40", !drill && "cursor-default")}
                      data-testid="dashboard-work-type-row"
                    >
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
                );
              })}
            </ul>
            {profile.unassignedUnits > 0 && (
              <p className="mt-2 px-2 text-2xs text-muted-foreground" data-testid="dashboard-work-types-unassigned">
                {formatCount(profile.unassignedUnits)} units in types with no workType ({profile.unassignedTypes.slice(0, 3).join(", ")}
                {profile.unassignedTypes.length > 3 ? "…" : ""}) are not drawn — Settings → Asset types.
              </p>
            )}
          </div>
        </div>
      )}
    </Panel>
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

const SIZE = 560;
const C = SIZE / 2;
const R = 188;

/**
 * The radar itself, flat: rings at a nice scale with their values, a degree
 * scale round the rim, a spoke per work type, last year as a dashed outline
 * with hollow points, this period as a solid shape with a value marker on each
 * point, and each work type named at the rim with its share and how it moved.
 * It grows from the centre when the dashboard reveals. Hovering a work type —
 * here or in the legend — lights its slice and opens a card with the detail.
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
  const point = (i: number, value: number) => at(i, (Math.max(0, value) / top) * R);
  const shape = (pick: (row: WorkTypeRow) => number) => rows.map((row, i) => point(i, pick(row)).join(",")).join(" ");
  const activeIndex = rows.findIndex((r) => r.workType.id === active);
  const activeRow = activeIndex >= 0 ? rows[activeIndex]! : null;

  return (
    <div className="relative mx-auto w-full max-w-[36rem]" data-testid="dashboard-work-types-radar">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full overflow-visible" role="img" aria-label={`Work types: ${rows.map((r) => `${r.workType.name} ${format(r.value)}`).join(", ")}`}>
        {/* The plate: one flat disc under everything, so the web reads as an object. */}
        <circle cx={C} cy={C} r={R + 14} className="fill-surface/60 stroke-border/70" strokeWidth={1} />

        {/* Degree scale round the rim, a tick every 5°, longer every 45°. */}
        {Array.from({ length: 72 }, (_, k) => {
          const a = (k * 5 * Math.PI) / 180;
          const long = k % 9 === 0;
          const r0 = R + 14;
          const r1 = r0 + (long ? 7 : 3.5);
          return <line key={`deg-${k}`} x1={C + r0 * Math.cos(a)} y1={C + r0 * Math.sin(a)} x2={C + r1 * Math.cos(a)} y2={C + r1 * Math.sin(a)} className="stroke-border" strokeWidth={long ? 1.25 : 0.75} />;
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
            <circle key={`band-${t}`} cx={C} cy={C} r={(t / top) * R} className={k % 2 === 0 ? "fill-card/40" : "fill-transparent"} />
          ))}
        {ticks
          .filter((t) => t > 0)
          .map((t) => (
            <g key={`ring-${t}`}>
              <circle cx={C} cy={C} r={(t / top) * R} fill="none" className="stroke-border" strokeWidth={t === top ? 1.25 : 1} strokeDasharray={t === top ? undefined : "1 5"} strokeLinecap="round" />
              <rect x={C + 5} y={C - (t / top) * R - 8} width={format(t).length * 6.4 + 8} height={14} rx={7} className="fill-card" />
              <text x={C + 9} y={C - (t / top) * R + 2.5} className="fill-muted-foreground text-[10px] tabular-nums">
                {format(t)}
              </text>
            </g>
          ))}
        {rows.map((row, i) => {
          const [x, y] = at(i, R);
          return <line key={`spoke-${row.workType.id}`} x1={C} y1={C} x2={x} y2={y} className={active === row.workType.id ? "stroke-foreground/50" : "stroke-border"} strokeWidth={active === row.workType.id ? 1.5 : 1} />;
        })}

        <g style={{ transform: `scale(${revealed ? 1 : 0})`, transformOrigin: `${C}px ${C}px`, transition: "transform 900ms cubic-bezier(0.22, 1, 0.36, 1)" }}>
          {hasComparison && (
            <>
              <polygon points={shape((r) => r.comparison ?? 0)} className="fill-muted-foreground/5 stroke-muted-foreground/70" strokeWidth={1.5} strokeDasharray="6 5" strokeLinejoin="round" />
              {rows.map((row, i) => {
                const [x, y] = point(i, row.comparison ?? 0);
                return <circle key={`was-${row.workType.id}`} cx={x} cy={y} r={3.5} className="fill-card stroke-muted-foreground/80" strokeWidth={1.5} />;
              })}
            </>
          )}
          <polygon points={shape((r) => r.value)} fill="var(--color-primary)" fillOpacity={0.16} stroke="var(--color-primary)" strokeWidth={2.5} strokeLinejoin="round" />
          {rows.map((row, i) => {
            const [x, y] = point(i, row.value);
            const lit = active === row.workType.id;
            const hex = colorClasses(row.workType.color).hex;
            return (
              <g key={`dot-${row.workType.id}`}>
                {lit && <circle cx={x} cy={y} r={12} fill={hex} opacity={0.18} />}
                <circle cx={x} cy={y} r={lit ? 7 : 5.5} fill={hex} className="stroke-card transition-[r] duration-200" strokeWidth={2.5} />
              </g>
            );
          })}
        </g>

        {/* The names round the rim: name, value and share, and how it moved. */}
        {rows.map((row, i) => {
          const a = angle(i);
          const [lx, ly] = at(i, R + 44);
          const anchor = Math.abs(Math.cos(a)) < 0.3 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
          const lit = active === row.workType.id;
          const hex = colorClasses(row.workType.color).hex;
          const change = row.comparison !== null && row.comparison > 0 ? (row.value - row.comparison) / row.comparison : null;
          const above = Math.sin(a) < -0.5;
          const y0 = above ? ly - 24 : ly - 6;
          return (
            <g
              key={`label-${row.workType.id}`}
              className={cn(onOpen && "cursor-pointer")}
              onMouseEnter={() => onActive(row.workType.id)}
              onMouseLeave={() => onActive(null)}
              onClick={onOpen ? () => onOpen(row) : undefined}
              data-testid="dashboard-work-type-label"
            >
              <circle cx={lx} cy={y0 + 12} r={34} fill="transparent" />
              <text x={lx} y={y0} textAnchor={anchor} className={cn("text-[13px] font-semibold", lit ? "fill-foreground" : "fill-foreground/90")}>
                <tspan fill={hex}>● </tspan>
                {row.workType.name}
              </text>
              <text x={lx} y={y0 + 16} textAnchor={anchor} className="text-[12px] tabular-nums">
                <tspan className="fill-foreground font-semibold">{format(row.value)}</tspan>
                <tspan className="fill-muted-foreground">{total > 0 ? `  ${Math.round((row.value / total) * 100)}%` : ""}</tspan>
                {change !== null && (
                  <tspan className={Math.abs(change) < 0.005 ? "fill-muted-foreground" : change > 0 ? "fill-emerald-600 dark:fill-emerald-400" : "fill-red-600 dark:fill-red-400"}>
                    {`  ${change > 0 ? "▲" : change < 0 ? "▼" : "•"} ${Math.abs(Math.round(change * 100))}%`}
                  </tspan>
                )}
              </text>
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

      {/* The detail card for the work type in focus, in the top corner away from its name. */}
      {activeRow && (
        <div
          className={cn("pointer-events-none absolute top-1 w-52 rounded-xl border border-border/70 bg-popover/95 p-3 text-xs shadow-lg backdrop-blur", Math.cos(angle(activeIndex)) > 0.3 ? "left-0" : "right-0")}
          data-testid="dashboard-work-type-card"
        >
          <p className="flex items-center gap-1.5 font-semibold">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: colorClasses(activeRow.workType.color).hex }} />
            {activeRow.workType.name}
          </p>
          <p className="mt-1 text-[20px] leading-tight font-semibold tabular-nums">
            {format(activeRow.value)} <span className="text-2xs font-normal text-muted-foreground">{unit}</span>
          </p>
          <div className="mt-1.5 grid grid-cols-3 gap-1 text-center">
            <Stat label="Share" value={total > 0 ? `${Math.round((activeRow.value / total) * 100)}%` : "—"} />
            <Stat label="Before" value={activeRow.comparison !== null ? format(activeRow.comparison) : "—"} />
            <Stat label="Delivered" value={activeRow.units > 0 ? `${Math.round((activeRow.doneUnits / activeRow.units) * 100)}%` : "—"} />
          </div>
          <p className="mt-1.5 truncate text-2xs text-muted-foreground">
            {formatCount(activeRow.units)} units · {formatCount(activeRow.taskIds.size)} tasks
            {activeRow.topTypes[0] ? ` · mostly ${activeRow.topTypes[0].type}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-strong/50 px-1 py-1">
      <p className="text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-[12px] font-semibold tabular-nums">{value}</p>
    </div>
  );
}
