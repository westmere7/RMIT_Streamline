"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { parseTimeOfDay } from "@/domain";
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
