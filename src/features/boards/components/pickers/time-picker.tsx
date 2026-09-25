"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { dateTimeSettings, formatDateTime, parseCountdownDuration, parseTimeOfDay } from "@/domain";
import { cn } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");

/** Now, as "HH:MM". */
function nowTime(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * A time field: the browser's own, so it types and steps the way every other
 * one does, and writes "HH:MM" whatever the column shows it as.
 */
function TimeField({ value, onChange, className, autoFocus }: { value: string | null; onChange: (time: string | null) => void; className?: string; autoFocus?: boolean }) {
  return (
    <input
      type="time"
      value={value ?? ""}
      onChange={(e) => onChange(parseTimeOfDay(e.target.value))}
      autoFocus={autoFocus}
      aria-label="Time"
      className={cn("h-8 rounded-md border border-input bg-background px-2 text-[13px] tabular outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30", className)}
      data-testid="time-input"
    />
  );
}

export function TimePicker({ value, onChange, onDone }: { value: string | null; onChange: (time: string | null) => void; onDone?: () => void }) {
  return (
    <div className="flex items-center gap-1.5 p-2" data-testid="time-picker">
      <TimeField value={value} onChange={onChange} autoFocus />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          onChange(nowTime());
          onDone?.();
        }}
      >
        Now
      </Button>
      {value && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => {
            onChange(null);
            onDone?.();
          }}
        >
          Clear
        </Button>
      )}
    </div>
  );
}

/**
 * A day and a time, stored as one moment. Picking a day keeps the time already
 * set (nine in the morning for a new one); changing the time keeps the day
 * (today for a new one).
 */
export function DateTimePicker({ value, onChange, onDone }: { value: string | null; onChange: (at: string | null) => void; onDone?: () => void }) {
  const at = value ? new Date(value) : null;
  const valid = at && !Number.isNaN(at.getTime()) ? at : null;
  const time = valid ? `${pad(valid.getHours())}:${pad(valid.getMinutes())}` : null;
  const emit = (day: Date, hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    onChange(new Date(day.getFullYear(), day.getMonth(), day.getDate(), h ?? 0, m ?? 0).toISOString());
  };
  return (
    <div data-testid="datetime-picker">
      <div className="flex flex-wrap items-center gap-1.5 border-b p-2">
        <TimeField value={time} onChange={(next) => next && emit(valid ?? new Date(), next)} />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onChange(new Date().toISOString());
            onDone?.();
          }}
        >
          Now
        </Button>
        {valid && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-muted-foreground"
            onClick={() => {
              onChange(null);
              onDone?.();
            }}
          >
            Clear
          </Button>
        )}
      </div>
      <Calendar mode="single" selected={valid ?? undefined} defaultMonth={valid ?? undefined} onSelect={(day) => day && emit(day, time ?? "09:00")} />
    </div>
  );
}

/** The quick ones, a minute's worth to a month's. */
const COUNTDOWN_PRESETS = ["15m", "1h", "1d", "1w", "1mo"];

/**
 * When a countdown ends: typed as a time from now ("45m", "3d 4h", "2mo"),
 * picked from the quick ones, or set to the minute on the calendar below.
 * Whichever way, the cell keeps the end moment.
 */
export function CountdownPicker({ value, onChange, onDone }: { value: string | null; onChange: (at: string | null) => void; onDone?: () => void }) {
  const [draft, setDraft] = React.useState("");
  const typed = draft.trim() ? parseCountdownDuration(draft) : null;
  const set = (end: Date) => {
    onChange(end.toISOString());
    onDone?.();
  };
  return (
    <div className="w-72" data-testid="countdown-picker">
      <form
        className="space-y-1.5 border-b p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed) set(typed);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          placeholder="In 45m, 3d 4h, 2mo…"
          aria-label="Time from now"
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          data-testid="countdown-input"
        />
        {draft.trim() && (
          <p className={cn("px-0.5 text-2xs", typed ? "text-muted-foreground" : "text-destructive")}>
            {typed ? `Ends ${formatDateTime(typed.toISOString(), dateTimeSettings(null))} · Enter to set` : "Try 45m, 3h, 2w or 4mo"}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1">
          {COUNTDOWN_PRESETS.map((preset) => (
            <Button key={preset} type="button" variant="outline" size="sm" className="h-7 px-2 text-xs tabular" onClick={() => set(parseCountdownDuration(preset)!)}>
              {preset}
            </Button>
          ))}
        </div>
      </form>
      <DateTimePicker value={value} onChange={onChange} onDone={onDone} />
    </div>
  );
}
