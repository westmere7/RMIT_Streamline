import * as React from "react";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-surface-strong/70", className)} {...props} />;
}

/**
 * A skeleton that may sit inside a line of text.
 *
 * A `span`, because the blocks above are `div`s and the places that need one
 * most — a page's description, a count beside a heading — are paragraphs. It
 * takes the line height of the text it stands in, so the line does not change
 * height when the words arrive.
 */
function SkeletonLine({ className, ...props }: React.ComponentProps<"span">) {
  return <span aria-hidden className={cn("inline-block h-[0.9em] animate-pulse rounded bg-surface-strong/70 align-middle", className)} {...props} />;
}

export { Skeleton, SkeletonLine };
