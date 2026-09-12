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
          case "underline":
            return (
              <u key={index} className="underline underline-offset-2">
                <Inline nodes={node.children} mentionHref={mentionHref} />
              </u>
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

/**
 * How far in a block sits. Tailwind needs the whole class name in the source,
 * so the steps are written out rather than worked out.
 */
const INDENT_CLASSES = ["", "pl-5", "pl-10", "pl-15"] as const;

function indentClass(indent: number | undefined): string {
  return INDENT_CLASSES[Math.min(INDENT_CLASSES.length - 1, Math.max(0, indent ?? 0))] ?? "";
}

/**
 * Three sizes and no more: a heading, a subheading, and the words themselves.
 *
 * They have to be told apart at a glance or they are not three sizes, so the
 * step between them is a real one — 16, 14 and 13 — rather than the same
 * thirteen pixels wearing different weights. A brief is mostly body text with a
 * heading every few lines; anything louder than this turns it into a poster.
 */
/**
 * How a block is drawn, which depends on what it is part of.
 *
 * `compact` is an update in a feed: a few lines, read in passing, tight. In a
 * `document` — a booking brief — every heading is a question and every
 * paragraph under it is the answer, so the pair has to hold together and the
 * next pair has to be plainly a different question. That is a wide gap above a
 * heading, a narrow one below it, and the answer a shade quieter than the
 * question it answers.
 */
export type RichTextVariant = "compact" | "document";

function Block({ node, mentionHref, variant = "compact" }: { node: BlockNode; mentionHref?: (displayName: string) => string | null; variant?: RichTextVariant }) {
  const doc = variant === "document";
  switch (node.type) {
    case "rule":
      return <hr className="my-2.5 border-border/70" />;
    case "heading":
      return node.level === 1 ? (
        <p className={cn("leading-snug font-semibold tracking-tight text-foreground first:mt-0", doc ? "mt-6 mb-1.5 text-[17px]" : "mt-3 mb-1 text-[16px]", indentClass(node.indent))}>
          <Inline nodes={node.children} mentionHref={mentionHref} />
        </p>
      ) : (
        <p className={cn("leading-snug font-semibold text-foreground first:mt-0", doc ? "mt-5 mb-1 text-[14px]" : "mt-2.5 mb-0.5 text-[14px]", indentClass(node.indent))}>
          <Inline nodes={node.children} mentionHref={mentionHref} />
        </p>
      );
    case "list":
      return node.ordered ? (
        <ol className={cn("my-1 list-decimal space-y-0.5 pl-5", doc && "text-muted-foreground", indentClass(node.indent))}>
          {node.items.map((item, index) => (
            <li key={index}>
              <Inline nodes={item} mentionHref={mentionHref} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className={cn("my-1 list-disc space-y-0.5 pl-5", doc && "text-muted-foreground", indentClass(node.indent))}>
          {node.items.map((item, index) => (
            <li key={index}>
              <Inline nodes={item} mentionHref={mentionHref} />
            </li>
          ))}
        </ul>
      );
    case "paragraph":
      return (
        <p className={cn("whitespace-pre-wrap", doc && "text-muted-foreground", indentClass(node.indent))}>
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
  variant = "compact",
}: {
  body: string;
  mentionNames?: readonly string[];
  className?: string;
  /** "document" for a brief: wider gaps between questions, the answer a shade quieter. */
  variant?: RichTextVariant;
  /** Where an @name leads. Without it a mention is highlighted but not clickable. */
  mentionHref?: (displayName: string) => string | null;
}) {
  const blocks = React.useMemo(() => parseRichText(body, mentionNames), [body, mentionNames]);
  return (
    <div className={cn("space-y-1 text-[13px] break-words", className)} data-testid="rich-text">
      {blocks.map((block, index) => (
        <Block key={index} node={block} mentionHref={mentionHref} variant={variant} />
      ))}
    </div>
  );
}
