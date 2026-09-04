"use client";

import * as React from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import type { ISODate } from "@/domain";
import { parseISODate, shiftISODate, toISODate, todayISO } from "@/lib/dates/dates";

export interface DatePickerProps {
  value: ISODate | null;
  onChange: (date: ISODate | null) => void;
  onDone?: () => void;
}

export function DatePicker({ value, onChange, onDone }: DatePickerProps) {
  const selected = parseISODate(value) ?? undefined;
  const pick = (date: ISODate | null) => {
    onChange(date);
    onDone?.();
  };
  return (
    <div data-testid="date-picker">
      <div className="flex flex-wrap gap-1 border-b p-2">
        <Button variant="ghost" size="sm" onClick={() => pick(todayISO())}>
          Today
        </Button>
        <Button variant="ghost" size="sm" onClick={() => pick(shiftISODate(todayISO(), 1))}>
          Tomorrow
        </Button>
        <Button variant="ghost" size="sm" onClick={() => pick(shiftISODate(todayISO(), 7))}>
          Next week
        </Button>
        {value && (
          <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={() => pick(null)}>
            Clear
          </Button>
        )}
      </div>
      <Calendar
        mode="single"
        selected={selected}
        defaultMonth={selected}
        onSelect={(date) => pick(date ? toISODate(date) : null)}
      />
    </div>
  );
}

export interface TimelinePickerProps {
  start: ISODate | null;
  end: ISODate | null;
  onChange: (range: { start: ISODate | null; end: ISODate | null }) => void;
}

export function TimelinePicker({ start, end, onChange }: TimelinePickerProps) {
  const range: DateRange | undefined = start || end ? { from: parseISODate(start) ?? undefined, to: parseISODate(end) ?? undefined } : undefined;
  return (
    <div>
      <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
        <span>Pick a start and end date</span>
        {(start || end) && (
          <Button variant="ghost" size="sm" onClick={() => onChange({ start: null, end: null })}>
            Clear
          </Button>
        )}
      </div>
      <Calendar
        mode="range"
        selected={range}
        defaultMonth={range?.from}
        numberOfMonths={1}
        onSelect={(next) => onChange({ start: next?.from ? toISODate(next.from) : null, end: next?.to ? toISODate(next.to) : null })}
      />
    </div>
  );
}
