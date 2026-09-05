"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps extends React.ComponentProps<typeof SwitchPrimitive.Root> {
  /** `sm` is for switches that sit inside a line of text, next to a label. */
  size?: "sm" | "md";
}

function Switch({ className, size = "md", ...props }: SwitchProps) {
  const small = size === "sm";
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex shrink-0 items-center rounded-full border border-transparent transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-ring data-[state=unchecked]:bg-input",
        small ? "h-4 w-7" : "h-5.5 w-10",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block rounded-full bg-white shadow-sm transition-transform duration-150 data-[state=unchecked]:translate-x-0.5",
          small ? "size-3 data-[state=checked]:translate-x-[0.875rem]" : "size-4.5 data-[state=checked]:translate-x-[1.125rem]",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
