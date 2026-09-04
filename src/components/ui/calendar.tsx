"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { DayPicker, type DayPickerProps } from "react-day-picker";
import { cn } from "@/lib/utils";

export type CalendarProps = DayPickerProps;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      weekStartsOn={1}
      className={cn("p-2", className)}
      classNames={{
        months: "flex flex-col gap-2",
        month: "flex flex-col gap-2",
        month_caption: "flex h-8 items-center justify-center relative",
        caption_label: "text-[13px] font-semibold",
        nav: "absolute inset-x-0 top-0 flex h-8 items-center justify-between px-1 z-10 pointer-events-none",
        button_previous:
          "pointer-events-auto inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
        button_next:
          "pointer-events-auto inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-8 text-2xs font-medium text-muted-foreground text-center",
        week: "flex mt-1",
        day: "size-8 p-0 text-center text-[13px] relative",
        day_button:
          "size-8 rounded-md inline-flex items-center justify-center hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring/50 aria-selected:opacity-100",
        today: "[&>button]:font-semibold [&>button]:text-primary",
        selected: "[&>button]:bg-foreground [&>button]:text-background [&>button]:hover:bg-foreground",
        range_start: "[&>button]:bg-foreground [&>button]:text-background rounded-l-md",
        range_end: "[&>button]:bg-foreground [&>button]:text-background rounded-r-md",
        range_middle: "bg-accent [&>button]:bg-transparent [&>button]:text-foreground rounded-none",
        outside: "text-muted-foreground/50",
        disabled: "text-muted-foreground opacity-40",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...rest }) =>
          orientation === "left" ? <ChevronLeft className="size-4" {...rest} /> : <ChevronRight className="size-4" {...rest} />,
      }}
      {...props}
    />
  );
}

export { Calendar };
