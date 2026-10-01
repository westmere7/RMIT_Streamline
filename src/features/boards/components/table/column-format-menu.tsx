"use client";

import { Check, MousePointerClick, Palette, SlidersHorizontal } from "lucide-react";
import { DropdownChip } from "@/features/boards/components/cells/dropdown-chip";
import * as React from "react";
import { ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger } from "@/components/ui/context-menu";
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from "@/components/ui/dropdown-menu";
import {
  COUNTDOWN_ENDING_LABELS,
  COUNTDOWN_ENDINGS,
  COUNTDOWN_PRECISION_LABELS,
  COUNTDOWN_DISPLAY_LABELS,
  COUNTDOWN_DISPLAYS,
  COUNTDOWN_PRECISIONS,
  COUNTDOWN_STYLE_LABELS,
  COUNTDOWN_STYLES,
  COUNTDOWN_WARNING_LABELS,
  COUNTDOWN_WARNINGS,
  countdownSettings,
  DATE_FORMAT_LABELS,
  DATE_FORMATS,
  dateTimeSettings,
  TIME_FORMAT_LABELS,
  TIME_FORMATS,
  type BoardColumn,
  type ColumnType,
  type CountdownColumnSettings,
  PROGRESS_COUNT_LABELS,
  PROGRESS_COUNTS,
  PROGRESS_DISPLAY_LABELS,
  PROGRESS_DISPLAYS,
  PROGRESS_NUMBER_LABELS,
  PROGRESS_NUMBERS,
  progressSettings,
  type ProgressColumnSettings,
  LAST_UPDATED_DISPLAY_LABELS,
  LAST_UPDATED_DISPLAYS,
  LAST_UPDATED_SOURCE_LABELS,
  LAST_UPDATED_SOURCES,
  LAST_UPDATED_TIME_LABELS,
  LAST_UPDATED_TIMES,
  lastUpdatedSettings,
  type LastUpdatedColumnSettings,
  columnLabels,
  DROPDOWN_CORNER_LABELS,
  DROPDOWN_CORNERS,
  DROPDOWN_FIT_LABELS,
  DROPDOWN_FITS,
  DROPDOWN_LOOK_LABELS,
  DROPDOWN_LOOKS,
  dropdownStyle,
} from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { useButtonSettingsDialog } from "@/features/boards/components/dialogs/button-settings-dialog";

/** Which halves of the format each type has: a date, a time, or both. */
const FORMAT_PARTS: Partial<Record<ColumnType, { date: boolean; time: boolean }>> = {
  PLAIN_DATE: { date: true, time: false },
  TIME: { date: false, time: true },
  DATETIME: { date: true, time: true },
  BOOKED_AT: { date: true, time: true },
};

export function hasFormatMenu(column: BoardColumn): boolean {
  return column.type in FORMAT_PARTS || column.type === "COUNTDOWN" || column.type === "PROGRESS" || column.type === "LAST_UPDATED" || column.type === "BUTTON" || column.type === "DROPDOWN";
}

type Primitives = {
  Sub: React.ComponentType<{ children?: React.ReactNode }>;
  SubTrigger: React.ComponentType<{ children?: React.ReactNode }>;
  SubContent: React.ComponentType<{ children?: React.ReactNode; className?: string }>;
  Item: React.ComponentType<{ children?: React.ReactNode; onSelect?: (event: Event) => void }>;
  Label: React.ComponentType<{ children?: React.ReactNode; className?: string }>;
  Separator: React.ComponentType;
};

const PRIMITIVES: Record<"dropdown" | "context", Primitives> = {
  dropdown: { Sub: DropdownMenuSub, SubTrigger: DropdownMenuSubTrigger, SubContent: DropdownMenuSubContent, Item: DropdownMenuItem, Label: DropdownMenuLabel, Separator: DropdownMenuSeparator },
  context: { Sub: ContextMenuSub, SubTrigger: ContextMenuSubTrigger, SubContent: ContextMenuSubContent, Item: ContextMenuItem, Label: ContextMenuLabel, Separator: ContextMenuSeparator },
} as unknown as Record<"dropdown" | "context", Primitives>;

/**
 * Format, in a date or time column's menu: how its values are written, each
 * choice shown as what it looks like. The change is the column's, so everyone
 * sees the same.
 */
export function ColumnFormatMenu({ column, variant = "dropdown" }: { column: BoardColumn; variant?: "dropdown" | "context" }) {
  const { mutations } = useBoardContext();
  const parts = FORMAT_PARTS[column.type];
  const { Sub, SubTrigger, SubContent, Item, Label, Separator } = PRIMITIVES[variant];
  if (column.type === "COUNTDOWN") return <CountdownFormatMenu column={column} primitives={PRIMITIVES[variant]} />;
  if (column.type === "PROGRESS") return <ProgressFormatMenu column={column} primitives={PRIMITIVES[variant]} />;
  if (column.type === "DROPDOWN") return <DropdownStyleMenu column={column} primitives={PRIMITIVES[variant]} />;
  if (column.type === "LAST_UPDATED") return <LastUpdatedFormatMenu column={column} primitives={PRIMITIVES[variant]} />;
  if (column.type === "BUTTON") return <ButtonSettingsItem column={column} primitives={PRIMITIVES[variant]} />;
  if (!parts) return null;
  const settings = dateTimeSettings(column.settings);
  const set = (patch: Partial<typeof settings>) => void mutations.updateColumn(column.id, { settings: { ...settings, ...patch } });
  return (
    <Sub>
      <SubTrigger>
        <SlidersHorizontal /> Format
      </SubTrigger>
      <SubContent className="w-44">
        {parts.date && (
          <>
            <Label className="text-2xs font-normal text-muted-foreground">Date</Label>
            {DATE_FORMATS.map((format) => (
              <Item key={format} onSelect={() => set({ dateFormat: format })}>
                <span className="tabular">{DATE_FORMAT_LABELS[format]}</span>
                {settings.dateFormat === format && <Check className="ml-auto size-3.5" />}
              </Item>
            ))}
          </>
        )}
        {parts.date && parts.time && <Separator />}
        {parts.time && (
          <>
            <Label className="text-2xs font-normal text-muted-foreground">Time</Label>
            {TIME_FORMATS.map((format) => (
              <Item key={format} onSelect={() => set({ timeFormat: format })}>
                <span className="tabular">{TIME_FORMAT_LABELS[format]}</span>
                {settings.timeFormat === format && <Check className="ml-auto size-3.5" />}
              </Item>
            ))}
          </>
        )}
      </SubContent>
    </Sub>
  );
}

/**
 * A dropdown's Style: its look, corners and width, each choice drawn as a chip
 * in the column's first colour. Stays open between choices. Status has no
 * such menu: it looks the same on every board.
 */
function DropdownStyleMenu({ column, primitives }: { column: BoardColumn; primitives: Primitives }) {
  const { mutations } = useBoardContext();
  const { Sub, SubTrigger, SubContent, Item, Label, Separator } = primitives;
  if (column.settings.kind !== "dropdown") return null;
  const settings = column.settings;
  const style = dropdownStyle(settings);
  const sample = columnLabels(column)[0] ?? { id: "sample", name: "Label", color: "blue" as const };
  const set = (patch: Partial<typeof style>) => void mutations.updateColumn(column.id, { settings: { ...settings, ...style, ...patch } });
  const choose = (fn: () => void) => (event: Event) => {
    event.preventDefault();
    fn();
  };
  const row = (selected: boolean, chip: React.ReactNode, name: string) => (
    <>
      <span className="flex h-6 w-28 shrink-0 items-center justify-center">{chip}</span>
      <span className="text-[13px]">{name}</span>
      {selected && <Check className="ml-auto size-3.5" />}
    </>
  );
  return (
    <Sub>
      <SubTrigger>
        <Palette /> Style
      </SubTrigger>
      <SubContent className="w-64" data-testid="dropdown-style-menu">
        <Label className="text-2xs font-normal text-muted-foreground">Look</Label>
        {DROPDOWN_LOOKS.map((look) => (
          <Item key={look} onSelect={choose(() => set({ look }))}>
            {row(style.look === look, <DropdownChip label={sample} look={look} corners={style.corners} fit="fit" />, DROPDOWN_LOOK_LABELS[look])}
          </Item>
        ))}
        {style.look !== "dot" && style.look !== "text" && (
          <>
            <Separator />
            <Label className="text-2xs font-normal text-muted-foreground">Corners</Label>
            {DROPDOWN_CORNERS.map((corners) => (
              <Item key={corners} onSelect={choose(() => set({ corners }))}>
                {row(style.corners === corners, <DropdownChip label={sample} look={style.look} corners={corners} fit="fit" />, DROPDOWN_CORNER_LABELS[corners])}
              </Item>
            ))}
          </>
        )}
        <Separator />
        <Label className="text-2xs font-normal text-muted-foreground">Width</Label>
        {DROPDOWN_FITS.map((fit) => (
          <Item key={fit} onSelect={choose(() => set({ fit }))}>
            <span className="text-[13px]">{DROPDOWN_FIT_LABELS[fit]}</span>
            {style.fit === fit && <Check className="ml-auto size-3.5" />}
          </Item>
        ))}
      </SubContent>
    </Sub>
  );
}

/** A Button column's look and steps are a dialog's worth, so the menu only opens it. */
function ButtonSettingsItem({ column, primitives }: { column: BoardColumn; primitives: Primitives }) {
  const show = useButtonSettingsDialog((s) => s.show);
  const { Item } = primitives;
  return (
    <Item onSelect={() => show(column.id)}>
      <MousePointerClick /> Button settings…
    </Item>
  );
}

/**
 * Last updated's Format: which changes count as an update, whether copies from
 * a linked task do, and how the answer is shown. Stays open between choices.
 */
function LastUpdatedFormatMenu({ column, primitives }: { column: BoardColumn; primitives: Primitives }) {
  const { mutations } = useBoardContext();
  const { Sub, SubTrigger, SubContent, Item, Label, Separator } = primitives;
  const settings = lastUpdatedSettings(column.settings);
  const set = (patch: Partial<LastUpdatedColumnSettings>) => void mutations.updateColumn(column.id, { settings: { ...settings, ...patch } });
  const keepOpen = (fn: () => void) => (event: Event) => {
    event.preventDefault();
    fn();
  };
  return (
    <Sub>
      <SubTrigger>
        <SlidersHorizontal /> Format
      </SubTrigger>
      <SubContent className="w-56" data-testid="last-updated-format-menu">
        <Label className="text-2xs font-normal text-muted-foreground">Counts as an update</Label>
        {LAST_UPDATED_SOURCES.map((source) => {
          const on = settings.sources.includes(source);
          return (
            <Item key={source} onSelect={keepOpen(() => set({ sources: on ? settings.sources.filter((s) => s !== source) : [...settings.sources, source] }))}>
              <span>{LAST_UPDATED_SOURCE_LABELS[source]}</span>
              {on && <Check className="ml-auto size-3.5" />}
            </Item>
          );
        })}
        <Separator />
        <Item onSelect={keepOpen(() => set({ skipSynced: !settings.skipSynced }))}>
          <span>Skip copies from linked tasks</span>
          {settings.skipSynced && <Check className="ml-auto size-3.5" />}
        </Item>
        <Separator />
        <Label className="text-2xs font-normal text-muted-foreground">Show</Label>
        {LAST_UPDATED_DISPLAYS.map((display) => (
          <Item key={display} onSelect={keepOpen(() => set({ display }))}>
            <span>{LAST_UPDATED_DISPLAY_LABELS[display]}</span>
            {settings.display === display && <Check className="ml-auto size-3.5" />}
          </Item>
        ))}
        {settings.display !== "person" && (
          <>
            <Separator />
            <Label className="text-2xs font-normal text-muted-foreground">Time</Label>
            {LAST_UPDATED_TIMES.map((time) => (
              <Item key={time} onSelect={keepOpen(() => set({ time }))}>
                <span className="tabular">{LAST_UPDATED_TIME_LABELS[time]}</span>
                {settings.time === time && <Check className="ml-auto size-3.5" />}
              </Item>
            ))}
          </>
        )}
      </SubContent>
    </Sub>
  );
}

/** Progress's Format: what is counted, and whether the bar, the number or both show. Stays open between choices. */
function ProgressFormatMenu({ column, primitives }: { column: BoardColumn; primitives: Primitives }) {
  const { mutations } = useBoardContext();
  const { Sub, SubTrigger, SubContent, Item, Label, Separator } = primitives;
  const settings = progressSettings(column.settings);
  const set = (patch: Partial<ProgressColumnSettings>) => void mutations.updateColumn(column.id, { settings: { ...settings, ...patch } });
  const section = <K extends keyof Omit<ProgressColumnSettings, "kind">>(title: string, key: K, options: readonly ProgressColumnSettings[K][], labels: Record<string, string>) => (
    <>
      <Label className="text-2xs font-normal text-muted-foreground">{title}</Label>
      {options.map((option) => (
        <Item
          key={option}
          onSelect={(event) => {
            event.preventDefault();
            set({ [key]: option } as Partial<ProgressColumnSettings>);
          }}
        >
          <span className="tabular">{labels[option]}</span>
          {settings[key] === option && <Check className="ml-auto size-3.5" />}
        </Item>
      ))}
    </>
  );
  return (
    <Sub>
      <SubTrigger>
        <SlidersHorizontal /> Format
      </SubTrigger>
      <SubContent className="w-48" data-testid="progress-format-menu">
        {section("Count", "countBy", PROGRESS_COUNTS, PROGRESS_COUNT_LABELS)}
        <Separator />
        {section("Show", "display", PROGRESS_DISPLAYS, PROGRESS_DISPLAY_LABELS)}
        {settings.display !== "bar" && (
          <>
            <Separator />
            {section("Number", "number", PROGRESS_NUMBERS, PROGRESS_NUMBER_LABELS)}
          </>
        )}
      </SubContent>
    </Sub>
  );
}

/**
 * A countdown's Format: how it writes the time left, how much of it, what it
 * says once the moment has passed, how close to the end it turns amber, and
 * whether it shows the ring, the words, or both. The menu stays open between choices, since there are
 * several to make.
 */
function CountdownFormatMenu({ column, primitives }: { column: BoardColumn; primitives: Primitives }) {
  const { mutations } = useBoardContext();
  const { Sub, SubTrigger, SubContent, Item, Label, Separator } = primitives;
  const settings = countdownSettings(column.settings);
  const set = (patch: Partial<CountdownColumnSettings>) => void mutations.updateColumn(column.id, { settings: { ...settings, ...patch } });
  const section = <K extends keyof Omit<CountdownColumnSettings, "kind">>(title: string, key: K, options: readonly CountdownColumnSettings[K][], labels: Record<string, string>) => (
    <>
      <Label className="text-2xs font-normal text-muted-foreground">{title}</Label>
      {options.map((option) => (
        <Item
          key={String(option)}
          onSelect={(event) => {
            event.preventDefault();
            set({ [key]: option } as Partial<CountdownColumnSettings>);
          }}
        >
          <span>{labels[String(option)]}</span>
          {settings[key] === option && <Check className="ml-auto size-3.5" />}
        </Item>
      ))}
    </>
  );
  return (
    <Sub>
      <SubTrigger>
        <SlidersHorizontal /> Format
      </SubTrigger>
      <SubContent className="w-48">
        {section("Style", "style", COUNTDOWN_STYLES, COUNTDOWN_STYLE_LABELS)}
        <Separator />
        {section("Units", "precision", COUNTDOWN_PRECISIONS, COUNTDOWN_PRECISION_LABELS)}
        <Separator />
        {section("When it ends", "ending", COUNTDOWN_ENDINGS, COUNTDOWN_ENDING_LABELS)}
        <Separator />
        {section("Turn amber", "warnWithin", COUNTDOWN_WARNINGS, COUNTDOWN_WARNING_LABELS)}
        <Separator />
        {section("Show", "display", COUNTDOWN_DISPLAYS, COUNTDOWN_DISPLAY_LABELS)}
      </SubContent>
    </Sub>
  );
}
