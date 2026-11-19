"use client";

import * as React from "react";
import { ColorPicker } from "@/components/shared/color-picker";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { IconPicker } from "@/components/shared/icon-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ColorToken } from "@/domain";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";

/**
 * A colour and an icon as one small button: the icon on its colour, beside a
 * name, opening a popover to pick both. Used by board and team settings and
 * by creating a team, so their look is a glance rather than a panel.
 */
export function LookPicker({
  color,
  icon,
  onColor,
  onIcon,
  disabled,
  testId = "look-picker",
}: {
  color: ColorToken;
  icon: string;
  onColor: (color: ColorToken) => void;
  onIcon: (icon: string) => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label="Colour and icon"
          title="Colour and icon"
          disabled={disabled}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg text-white transition-[box-shadow] hover:ring-2 hover:ring-ring/50 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none",
            colorClasses(color).solid,
          )}
          data-testid={testId}
        >
          <DynamicIcon name={icon} className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3">
        <ColorPicker value={color} onChange={(next) => onColor(next as ColorToken)} />
        <div className="scrollbar-thin max-h-52 overflow-y-auto">
          <IconPicker value={icon} onChange={onIcon} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
