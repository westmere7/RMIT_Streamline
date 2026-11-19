"use client";

import * as React from "react";
import { ColorPicker } from "@/components/shared/color-picker";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { IconPicker } from "@/components/shared/icon-picker";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ColorToken } from "@/domain";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";

/** The icon on its colour, as a still tile: the look a full picker below is changing. */
export function LookTile({ color, icon, testId }: { color: ColorToken; icon: string; testId?: string }) {
  return (
    <span aria-hidden className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg text-white", colorClasses(color).solid)} data-testid={testId}>
      <DynamicIcon name={icon} className="size-4" />
    </span>
  );
}

/**
 * The colour and icon pickers laid out in full, for a settings tab with room
 * for them. Each choice is passed on at once.
 */
export function LookFields({ color, icon, onColor, onIcon, disabled }: { color: ColorToken; icon: string; onColor: (color: ColorToken) => void; onIcon: (icon: string) => void; disabled?: boolean }) {
  return (
    <div className={cn("grid gap-4", disabled && "pointer-events-none opacity-60")} data-testid="look-fields">
      <div className="grid gap-1.5">
        <Label>Colour</Label>
        <ColorPicker value={color} onChange={(next) => onColor(next as ColorToken)} />
      </div>
      <div className="grid gap-1.5">
        <Label>Icon</Label>
        <IconPicker value={icon} onChange={onIcon} className="grid-cols-11" />
      </div>
    </div>
  );
}

/**
 * A colour and an icon as one small button: the icon on its colour, beside a
 * name, opening a popover to pick both. Used by creating a team, where the
 * form is short; settings, with a tab of room, show LookFields in full.
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
