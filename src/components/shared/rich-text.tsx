"use client";

import Link from "next/link";
import * as React from "react";
import { parseRichText, type BlockNode, type InlineNode, type RichTextColor } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

/** The palette an update can use. Chosen to stay readable on both themes. */
export const RICH_TEXT_COLOR_CLASSES: Record<RichTextColor, string> = {
  red: "text-red-600 dark:text-red-400",
  orange: "text-orange-600 dark:text-orange-400",
  green: "text-green-700 dark:text-green-400",
  blue: "text-blue-700 dark:text-blue-300",
  purple: "text-purple-700 dark:text-purple-300",
  grey: "text-muted-foreground",
};

function Inline({ nodes, mentionHref }: { nodes: InlineNode[]; mentionHref?: (displayName: string) => string | null }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.type) {
          case "text":
            return <React.Fragment key={index}>{node.text}</React.Fragment>;
          case "bold":
            return (
              <strong key={index} className="font-semibold">
                <Inline nodes={node.children} mentionHref={mentionHref} />
              </strong>
            );
          case "italic":
            return (
              <em key={index}>
                <Inline nodes={node.children} mentionHref={mentionHref} />
              </em>
            );
          case "color":
            return (
              <span key={index} className={RICH_TEXT_COLOR_CLASSES[node.color]}>
                <Inline nodes={node.children} mentionHref={mentionHref} />
              </span>
            );
          case "link":
            return (
              <a
                key={index}
                href={node.href}
                target="_blank"
                rel="noreferrer noopener"
                className="text-ring underline underline-offset-2 hover:text-ring/80"
              >
                {node.label}
              </a>
            );
          case "mention": {
            const className = "rounded bg-blue-50 px-1 font-medium text-blue-700 dark:bg-navy-500/40 dark:text-navy-100";
            const to = mentionHref?.(node.name) ?? null;
            return to ? (
              <Link key={index} href={to} className={cn(className, "hover:underline underline-offset-2")} data-testid="mention">
                @{node.name}
              </Link>
            ) : (
              <span key={index} className={className} data-testid="mention">
                @{node.name}
              </span>
            );
          }
        }
      })}
    </>
  );
}

function Block({ node, mentionHref }: { node: BlockNode; mentionHref?: (displayName: string) => string | null }) {
  switch (node.type) {
    case "heading":
      return node.level === 1 ? (
        <p className="mt-2 mb-1 text-[15px] font-semibold first:mt-0">
          <Inline nodes={node.children} mentionHref={mentionHref} />
        </p>
      ) : (
        <p className="mt-2 mb-0.5 text-[13px] font-semibold first:mt-0">
          <Inline nodes={node.children} mentionHref={mentionHref} />
        </p>
      );
    case "list":
      return node.ordered ? (
        <ol className="my-1 list-decimal space-y-0.5 pl-5">
          {node.items.map((item, index) => (
            <li key={index}>
              <Inline nodes={item} mentionHref={mentionHref} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className="my-1 list-disc space-y-0.5 pl-5">
          {node.items.map((item, index) => (
            <li key={index}>
              <Inline nodes={item} mentionHref={mentionHref} />
            </li>
          ))}
        </ul>
      );
    case "paragraph":
      return (
        <p className="whitespace-pre-wrap">
          <Inline nodes={node.children} mentionHref={mentionHref} />
        </p>
      );
  }
}

/**
 * Renders the small markup updates are written in. Everything comes from parsed
 * data — no HTML is ever built from what someone typed.
 */
export function RichText({
  body,
  mentionNames = [],
  className,
  mentionHref,
}: {
  body: string;
  mentionNames?: readonly string[];
  className?: string;
  /** Where an @name leads. Without it a mention is highlighted but not clickable. */
  mentionHref?: (displayName: string) => string | null;
}) {
  const blocks = React.useMemo(() => parseRichText(body, mentionNames), [body, mentionNames]);
  return (
    <div className={cn("space-y-1 text-[13px] break-words", className)} data-testid="rich-text">
      {blocks.map((block, index) => (
        <Block key={index} node={block} mentionHref={mentionHref} />
      ))}
    </div>
  );
}
