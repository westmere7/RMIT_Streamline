import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-[13px] font-medium transition-[background-color,border-color,box-shadow,color,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/92",
        secondary: "bg-secondary text-secondary-foreground hover:bg-surface-strong",
        outline: "border border-border bg-card shadow-xs hover:border-input hover:bg-accent/60",
        ghost: "text-foreground hover:bg-accent/70",
        subtle: "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
        destructive: "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // Below md every size keeps its desktop height and gains a 44px floor:
      // the minimum a finger can hit reliably. `max-md:` variants are emitted
      // after the base utilities, so the desktop rule is untouched and the
      // rendered desktop output is identical.
      size: {
        default: "h-9 px-3.5 max-md:min-h-11",
        sm: "h-8 px-3 max-md:min-h-11",
        lg: "h-10 px-4.5 max-md:min-h-11",
        icon: "size-9 max-md:size-11",
        "icon-sm": "size-8 max-md:size-11",
        "icon-xs": "size-7 max-md:size-11 [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
