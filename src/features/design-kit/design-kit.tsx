"use client";

import { ArrowUpDown, Bell, CalendarDays, Check, ChevronDown, EyeOff, Filter, Hash, Inbox, Kanban, LayoutGrid, MessageSquare, Play, Plus, Search, Settings2, Star, Table2, Trash2, UserRound, Users, Zap } from "lucide-react";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { ColorPicker } from "@/components/shared/color-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { ColorDot, LabelPill } from "@/components/shared/label-pill";
import { PriorityPill, PrioritySignal } from "@/components/shared/priority-signal";
import { AvatarStack, UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, UnderlineTabsList, UnderlineTabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { BUTTON_PRESETS, BUTTON_STYLES, COLOR_TOKENS, DEFAULT_PRIORITY_LABELS, DEFAULT_STATUS_LABELS, T_SHIRT_SIZES, type ColorToken } from "@/domain";
import { ButtonFace } from "@/features/boards/components/cells/activity-cells";
import { SizePill } from "@/features/boards/components/pickers/size-picker";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";

/**
 * The design kit: the app's own components and tokens laid out on one page,
 * so a capture tool (html.to.design) can bring them into Figma as layers. Each
 * section is a frame; nothing here is a copy of a component, only sample data.
 */

const PEOPLE = [
  { id: "u1", firstName: "Hil", lastName: "Pham", displayName: "Hil Pham", avatarUrl: null },
  { id: "u2", firstName: "Tom", lastName: "Hartley", displayName: "Tom Hartley", avatarUrl: null },
  { id: "u3", firstName: "Grace", lastName: "Kim", displayName: "Grace Kim", avatarUrl: null },
  { id: "u4", firstName: "Jun", lastName: "Tanaka", displayName: "Jun Tanaka", avatarUrl: null },
  { id: "u5", firstName: "Linh", lastName: "Vo", displayName: "Linh Vo", avatarUrl: null },
];

const SEMANTIC = [
  ["canvas", "Canvas"],
  ["background", "Background"],
  ["surface", "Surface"],
  ["surface-strong", "Surface strong"],
  ["card", "Card"],
  ["popover", "Popover"],
  ["foreground", "Foreground"],
  ["muted-foreground", "Muted text"],
  ["primary", "Primary"],
  ["secondary", "Secondary"],
  ["accent", "Accent"],
  ["accent-soft", "Accent soft"],
  ["accent-soft-foreground", "Accent soft text"],
  ["ring", "Ring"],
  ["border", "Border"],
  ["input", "Input"],
  ["destructive", "Destructive"],
  ["navy", "Navy"],
  ["sidebar", "Sidebar"],
  ["sidebar-accent", "Sidebar accent"],
] as const;

const TYPE_SCALE: Array<{ name: string; className: string; sample: string }> = [
  { name: "Page title · 24 semibold", className: "text-2xl font-semibold tracking-tight", sample: "Website Redesign" },
  { name: "Panel title · 20 semibold", className: "text-xl font-semibold tracking-tight", sample: "Footer refresh" },
  { name: "Figure · 22 semibold", className: "text-[22px] font-semibold tabular", sample: "615" },
  { name: "Group title · 15 semibold", className: "text-[15px] font-semibold tracking-tight", sample: "This Sprint" },
  { name: "Body · 14 regular", className: "text-sm", sample: "Course pages, navigation and landing templates for the 2027 intake." },
  { name: "Cell · 13 regular", className: "text-[13px]", sample: "Compare courses side by side" },
  { name: "Cell strong · 13 medium", className: "text-[13px] font-medium", sample: "New Item" },
  { name: "Small · 12 regular", className: "text-xs text-muted-foreground", sample: "Created 3 days ago" },
  { name: "Caption · 11 medium", className: "text-2xs font-medium text-muted-foreground", sample: "93 items" },
];

const THEMES = ["light", "dark", "dim"] as const;

export function DesignKit() {
  const params = useSearchParams();
  const theme = (THEMES as readonly string[]).includes(params.get("theme") ?? "") ? (params.get("theme") as (typeof THEMES)[number]) : "light";
  const [color, setColor] = React.useState<ColorToken>("blue");
  const [on, setOn] = React.useState(true);

  return (
    <div className={cn(theme === "light" ? "light" : "dark", theme === "dim" && "dim", "min-h-screen bg-canvas text-foreground")} data-testid="design-kit">
      <div className="mx-auto max-w-[1280px] space-y-8 px-10 py-10">
        <header className="flex items-end justify-between gap-4">
          <div>
            <p className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">Streamline design kit</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Components and tokens · {theme[0]!.toUpperCase() + theme.slice(1)}</h1>
          </div>
          <div className="flex gap-1.5">
            {THEMES.map((t) => (
              <a key={t} href={`?theme=${t}`} className={cn("rounded-full px-3 py-1 text-xs font-medium", t === theme ? "state-on" : "text-muted-foreground hover:bg-accent")}>
                {t}
              </a>
            ))}
          </div>
        </header>

        <Frame title="Colour · semantic" note="globals.css custom properties; the theme decides the value.">
          <div className="grid grid-cols-5 gap-3">
            {SEMANTIC.map(([token, name]) => (
              <div key={token} className="overflow-hidden rounded-xl border border-border">
                <div className="h-14" style={{ background: `var(--${token})` }} />
                <div className="bg-card px-2.5 py-1.5">
                  <p className="text-xs font-medium">{name}</p>
                  <p className="text-2xs text-muted-foreground">--{token}</p>
                </div>
              </div>
            ))}
          </div>
        </Frame>

        <Frame title="Colour · labels" note="The 17 colours a status, tag, group or button can be: filled, soft, dot and text.">
          <div className="grid grid-cols-6 gap-3">
            {COLOR_TOKENS.map((token) => {
              const c = colorClasses(token);
              return (
                <div key={token} className="space-y-1.5 rounded-xl border border-border bg-card p-2.5">
                  <p className="flex items-center gap-1.5 text-xs font-medium">
                    <span className={cn("size-2.5 rounded-full", c.dot)} /> {token}
                  </p>
                  <span className={cn("flex h-6 items-center rounded-md px-2 text-2xs font-medium", c.solid)}>Filled</span>
                  <span className={cn("flex h-6 items-center rounded-md px-2 text-2xs font-medium", c.soft)}>Soft</span>
                  <span className={cn("block text-2xs font-medium", c.text)}>Text</span>
                </div>
              );
            })}
          </div>
        </Frame>

        <div className="grid grid-cols-2 gap-8">
          <Frame title="Type" note="Inter throughout; 13px is the working size of the board.">
            <div className="space-y-3">
              {TYPE_SCALE.map((t) => (
                <div key={t.name} className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2 last:border-0">
                  <span className={cn("truncate", t.className)}>{t.sample}</span>
                  <span className="shrink-0 text-2xs text-muted-foreground">{t.name}</span>
                </div>
              ))}
            </div>
          </Frame>
          <Frame title="Radii and elevation" note="Separation comes from elevation first, lines second.">
            <div className="grid grid-cols-3 gap-4">
              {[
                ["rounded-md", "md · 8"],
                ["rounded-lg", "lg · 10"],
                ["rounded-xl", "xl · 14"],
                ["rounded-2xl", "2xl · 20"],
                ["rounded-full", "full"],
              ].map(([cls, name]) => (
                <div key={name} className="flex flex-col items-center gap-1.5">
                  <div className={cn("size-16 border border-border bg-surface-strong", cls)} />
                  <span className="text-2xs text-muted-foreground">{name}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-3 gap-4">
              {["shadow-xs", "shadow-sm", "shadow-md", "shadow-lg", "shadow-xl", "shadow-2xl"].map((cls) => (
                <div key={cls} className={cn("flex h-16 items-center justify-center rounded-xl bg-card text-2xs text-muted-foreground", cls)}>
                  {cls.replace("shadow-", "elev-")}
                </div>
              ))}
            </div>
          </Frame>
        </div>

        <Frame title="Buttons" note="Variants down, sizes across. Red is kept for the one primary action on a screen.">
          <div className="space-y-3">
            {(["default", "secondary", "outline", "ghost", "subtle", "destructive", "link"] as const).map((variant) => (
              <div key={variant} className="flex items-center gap-3">
                <span className="w-24 text-2xs text-muted-foreground">{variant}</span>
                <Button variant={variant} size="lg">
                  <Plus /> Large
                </Button>
                <Button variant={variant}>Default</Button>
                <Button variant={variant} size="sm">
                  Small
                </Button>
                <Button variant={variant} size="icon" aria-label="Icon">
                  <Settings2 />
                </Button>
                <Button variant={variant} size="icon-sm" aria-label="Icon small">
                  <Star />
                </Button>
                <Button variant={variant} size="icon-xs" aria-label="Icon extra small">
                  <Bell />
                </Button>
                <Button variant={variant} disabled>
                  Disabled
                </Button>
              </div>
            ))}
          </div>
        </Frame>

        <div className="grid grid-cols-2 gap-8">
          <Frame title="Board toolbar" note="Pill buttons; an active filter turns indigo and carries its count.">
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-background p-2">
              <Button variant="ghost" className="rounded-full pl-3 pr-2.5 font-semibold">
                <Table2 /> Main Table <ChevronDown className="text-muted-foreground" />
              </Button>
              <span className="flex">
                <Button size="sm" className="rounded-r-none">
                  <Plus /> New Item
                </Button>
                <Button size="sm" className="rounded-l-none border-l border-white/20 px-1.5" aria-label="Change this button">
                  <ChevronDown />
                </Button>
              </span>
              <div className="relative w-44">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search items" className="h-9 rounded-full border-transparent bg-surface pl-9" />
              </div>
              <Button variant="ghost" size="sm" className="rounded-full state-on">
                <UserRound /> Person <span className="rounded-full bg-ring px-1.5 text-2xs font-semibold text-white tabular">2</span>
              </Button>
              <Button variant="ghost" size="sm" className="rounded-full">
                <Hash /> Tags
              </Button>
              <Button variant="ghost" size="sm" className="rounded-full">
                <Filter /> Filter
              </Button>
              <Button variant="ghost" size="sm" className="rounded-full">
                <ArrowUpDown /> Sort
              </Button>
              <Button variant="ghost" size="sm" className="rounded-full">
                <EyeOff /> Hide
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Button variant="ghost" size="sm" className="rounded-full state-on">
                <Star className="fill-current" /> Sprint review
                <span aria-hidden className="size-1.5 rounded-full bg-amber-500" />
                <ChevronDown className="text-muted-foreground" />
              </Button>
              <Button variant="outline" size="sm" className="rounded-full">
                Save
              </Button>
              <Button size="sm">
                <Play /> Make high
              </Button>
            </div>
          </Frame>

          <Frame title="Views and tabs" note="View switcher, segmented choices, panel tabs.">
            <div className="space-y-4">
              <Tabs defaultValue="standard">
                <TabsList>
                  <TabsTrigger value="compact">Compact</TabsTrigger>
                  <TabsTrigger value="standard">Standard</TabsTrigger>
                  <TabsTrigger value="detailed">Detailed</TabsTrigger>
                </TabsList>
              </Tabs>
              <Tabs defaultValue="overview">
                <UnderlineTabsList className="px-1">
                  <UnderlineTabsTrigger value="overview">
                    <LayoutGrid /> Overview
                  </UnderlineTabsTrigger>
                  <UnderlineTabsTrigger value="updates">
                    <MessageSquare /> Updates
                  </UnderlineTabsTrigger>
                  <UnderlineTabsTrigger value="assets">
                    <Inbox /> Assets
                  </UnderlineTabsTrigger>
                </UnderlineTabsList>
              </Tabs>
              <div className="w-64 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg">
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Views</p>
                {[
                  [Table2, "Main Table", "Every column, editable", true],
                  [Kanban, "Kanban", "Cards in lanes", false],
                  [CalendarDays, "Calendar", "Due dates by month or week", false],
                ].map(([Icon, name, hint, active]) => {
                  const I = Icon as typeof Table2;
                  return (
                    <div key={name as string} className={cn("flex items-start gap-2 rounded-md px-2 py-1.5 text-[13px]", active && "bg-accent")}>
                      <I className="mt-0.5 size-4" />
                      <span className="flex-1">
                        <span className="block">{name as string}</span>
                        <span className="block text-2xs text-muted-foreground">{hint as string}</span>
                      </span>
                      {active ? <Check className="mt-0.5 size-3.5" /> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </Frame>
        </div>

        <div className="grid grid-cols-2 gap-8">
          <Frame title="Status and priority" note="Status fills its cell; Stuck wears stripes. Priority is four fixed steps.">
            <div className="flex flex-wrap gap-2">
              {DEFAULT_STATUS_LABELS.map((label) => (
                <LabelPill key={label.id} label={label} striped={label.id === "stuck"} className="w-28 justify-center" />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              {DEFAULT_PRIORITY_LABELS.map((label) => (
                <PriorityPill key={label.id} label={label} />
              ))}
              {[0, 1, 2, 3].map((n) => (
                <PrioritySignal key={n} level={n} />
              ))}
            </div>
          </Frame>
          <Frame title="Tags, sizes, badges" note="Tags are soft chips from the board's palette.">
            <div className="flex flex-wrap gap-1.5">
              {(["indigo", "violet", "sky", "teal", "green", "amber", "orange", "rose"] as ColorToken[]).map((token, i) => (
                <span key={token} className={cn("rounded-md px-2 py-0.5 text-2xs font-medium", colorClasses(token).soft)}>
                  #{["Website", "Print", "Video", "Social", "Content", "Events", "Templates", "Navigation"][i]}
                </span>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {T_SHIRT_SIZES.map((size) => (
                <SizePill key={size} size={size} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {(["default", "outline", "primary", "muted", "warning", "success", "destructive"] as const).map((variant) => (
                <Badge key={variant} variant={variant}>
                  {variant}
                </Badge>
              ))}
            </div>
          </Frame>
        </div>

        <div className="grid grid-cols-2 gap-8">
          <Frame title="Form controls" note="Inputs sit on the card; focus is the indigo ring.">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input placeholder="e.g. This sprint" />
              </div>
              <div className="space-y-1.5">
                <Label>Group</Label>
                <Select defaultValue="backlog">
                  <SelectTrigger>
                    <SelectValue placeholder="Backlog" />
                  </SelectTrigger>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Brief</Label>
                <Textarea placeholder="What it is, who it is for, and when." rows={3} />
              </div>
              <label className="flex items-center gap-2 text-[13px]">
                <Checkbox defaultChecked /> Share with everyone on this board
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <Checkbox /> Ask before running
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <Switch checked={on} onCheckedChange={setOn} /> On
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <Switch size="sm" checked={!on} onCheckedChange={(v) => setOn(!v)} /> Small switch
              </label>
            </div>
            <div className="mt-4">
              <ColorPicker value={color} onChange={setColor} />
            </div>
          </Frame>
          <Frame title="People" note="Initials on the person's colour; stacks overlap.">
            <div className="flex flex-wrap items-end gap-3">
              {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
                <UserAvatar key={size} user={PEOPLE[0]} size={size} tooltip={false} />
              ))}
            </div>
            <div className="mt-4 flex items-center gap-4">
              <AvatarStack users={PEOPLE} size="md" max={3} />
              <AvatarStack users={PEOPLE.slice(0, 2)} size="sm" />
              <span className="flex items-center gap-1.5 text-[13px]">
                <UserAvatar user={PEOPLE[1]} size="xs" tooltip={false} /> Tom
              </span>
            </div>
          </Frame>
        </div>

        <div className="grid grid-cols-2 gap-8">
          <Frame title="Task buttons" note="The Button column: three styles in the label colours, and the ready-made ones.">
            <div className="space-y-3">
              {BUTTON_STYLES.map((style) => (
                <div key={style} className="flex flex-wrap items-center gap-2">
                  <span className="w-16 text-2xs text-muted-foreground">{style}</span>
                  {BUTTON_PRESETS.map((preset) => (
                    <ButtonFace key={preset.id} settings={{ kind: "button", style, ...preset.settings }} />
                  ))}
                </div>
              ))}
            </div>
          </Frame>
          <Frame title="Progress and figures" note="Progress bars and the figures on tiles.">
            <div className="space-y-3">
              {[0, 33, 50, 100].map((pct) => (
                <div key={pct} className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-strong">
                    <div className={cn("h-full rounded-full", pct === 100 ? "bg-green-500" : "bg-ring")} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-9 text-right text-2xs text-muted-foreground tabular">{pct}%</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-6">
              {[
                ["615", "requests"],
                ["321", "done"],
                ["52", "overdue"],
              ].map(([n, l], i) => (
                <p key={l} className="flex items-baseline gap-1.5">
                  <span className={cn("text-[22px] leading-none font-semibold tabular", i === 1 && "text-green-600 dark:text-green-400", i === 2 && "text-red-600 dark:text-red-400")}>{n}</span>
                  <span className="text-[13px] font-medium">{l}</span>
                </p>
              ))}
            </div>
          </Frame>
        </div>

        <div className="grid grid-cols-3 gap-8">
          <Frame title="Kanban card" note="A step lighter than its lane; no shadow.">
            <div className="rounded-2xl bg-surface/80 p-2.5" style={{ backgroundColor: `${colorClasses("orange").hex}1f` }}>
              <p className="mb-2 flex items-center gap-2 px-1 text-[13px] font-semibold text-orange-600 dark:text-orange-400">
                <span className="size-2.5 rounded-full bg-orange-500" /> In Progress
              </p>
              <article className="rounded-xl border border-border bg-card p-3 dark:border-white/10 dark:bg-surface-strong">
                <p className="text-[13px] font-semibold">Library guide – proofread</p>
                <p className="mt-0.5 flex items-center gap-1 text-2xs text-muted-foreground">
                  <ColorDot color="orange" /> Translating
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  <PriorityPill label={DEFAULT_PRIORITY_LABELS[2]!} />
                  <span className={cn("rounded-md px-1.5 py-0.5 text-2xs font-medium", colorClasses("amber").soft)}>#Video</span>
                </div>
                <div className="mt-2.5 flex items-center justify-between text-2xs text-muted-foreground">
                  <span className="tabular">Nov 5</span>
                  <AvatarStack users={PEOPLE.slice(0, 2)} size="xs" />
                </div>
              </article>
            </div>
          </Frame>
          <Frame title="Empty state" note="One line of what, one of what next.">
            <EmptyState icon={Search} title="No tasks match these filters" description="Try widening the filters or clearing the search." compact action={<Button variant="outline" size="sm">Clear filters</Button>} />
          </Frame>
          <Frame title="Loading" note="Skeletons in the shape of what is coming.">
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-3/4" />
            </div>
          </Frame>
        </div>

        <div className="grid grid-cols-3 gap-8">
          <Frame title="Menu" note="Menus are popovers on the card colour with a large shadow.">
            <div className="w-full overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg">
              {[
                [Users, "Manage members"],
                [Zap, "Automations"],
                [Settings2, "Board settings"],
              ].map(([Icon, name]) => {
                const I = Icon as typeof Users;
                return (
                  <div key={name as string} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] first:bg-accent">
                    <I className="size-4 text-muted-foreground" /> {name as string}
                  </div>
                );
              })}
              <div className="-mx-1 my-1 h-px bg-border" />
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-destructive">
                <Trash2 className="size-4" /> Delete board
              </div>
            </div>
          </Frame>
          <Frame title="Strips" note="Board-wide notices sit under the header.">
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-[13px] text-sky-900 dark:bg-sky-500/10 dark:text-sky-200">View only for you.</div>
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">This board is archived and read-only.</div>
              <div className="flex items-center gap-2 rounded-lg bg-accent-soft/60 px-3 py-2 text-xs text-accent-soft-foreground">Only yours · 2 of 3 items</div>
            </div>
          </Frame>
          <Frame title="Link tile" note="Portal admin: a solid fill and full border.">
            <div className="rounded-xl border border-border bg-surface dark:border-white/10 dark:bg-surface-strong">
              <div className="p-4">
                <p className="text-[14px] font-semibold">Portal</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">Departments see their work.</p>
                <p className="mt-3 flex items-baseline gap-1.5">
                  <span className="text-[22px] leading-none font-semibold tabular">3</span>
                  <span className="text-[13px] font-medium">departments</span>
                </p>
              </div>
              <div className="flex justify-end gap-1.5 border-t border-border/60 px-4 py-2.5">
                <Button variant="ghost" size="sm">
                  Open
                </Button>
                <Button variant="outline" size="sm">
                  Copy link
                </Button>
              </div>
            </div>
          </Frame>
        </div>
      </div>
    </div>
  );
}

function Frame({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs" data-kit-frame={title}>
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      {note && <p className="mt-0.5 mb-4 text-xs text-muted-foreground">{note}</p>}
      {children}
    </section>
  );
}
