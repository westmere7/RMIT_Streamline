"use client";

import { CircleHelp } from "lucide-react";
import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DASHBOARD_HELP, type HelpTopic } from "@/features/dashboard/help";

/**
 * The small "?" beside a panel's name: what the panel shows and what it means
 * for the team. A popover rather than a tooltip, so it opens on a tap as well as
 * a click and stays open to be read. Clicks stop here, so opening it inside a
 * headline card does not also switch the page's measure.
 */
export function PanelHelp({ topic, title }: { topic: HelpTopic; title: string }) {
  const help = DASHBOARD_HELP[topic];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`About ${title}`}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring max-md:size-7"
          data-testid={`dashboard-help-${topic}`}
        >
          <CircleHelp className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-72 text-xs leading-relaxed" onClick={(event) => event.stopPropagation()}>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mt-1.5 text-muted-foreground">{help.shows}</p>
        <p className="mt-2 text-2xs font-medium tracking-wide text-muted-foreground/80 uppercase">For the team</p>
        <p className="mt-0.5 text-foreground/90">{help.means}</p>
      </PopoverContent>
    </Popover>
  );
}
