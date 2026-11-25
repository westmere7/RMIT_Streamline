"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { PersonHover } from "@/components/shared/user-avatar";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { parseRichText, type BlockNode, type ChecklistItem, type InlineNode, type RichTextColor } from "@/lib/rich-text";
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
            // A person's page ends in their id: their card on hover, as anywhere else they appear.
            const personId = to ? /\/people\/([^/?#]+)$/.exec(to)?.[1] : undefined;
            const link = to ? (
              <Link href={to} className={cn(className, "hover:underline underline-offset-2")} data-testid="mention">
                @{node.name}
              </Link>
            ) : null;
            if (link && personId)
              return (
                <PersonHover key={index} user={{ id: personId, displayName: node.name }}>
                  {link}
                </PersonHover>
              );
            return link ? (
              <React.Fragment key={index}>{link}</React.Fragment>
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

/**
 * The ticks on an update's checklists, and who may change them. Without it a
 * checklist still shows its boxes, empty and still: a brief or a preview has
 * nowhere to keep a tick.
 */
export interface RichTextChecklist {
  /** Ticked boxes by key, with what the tooltip says about each ("Ticked by Linh, 2h ago"). */
  ticked: ReadonlyMap<string, string>;
  /** Absent where the reader may only look. */
  onToggle?: (key: string, on: boolean) => void;
}

function ChecklistBox({ item, checklist, mentionHref }: { item: ChecklistItem; checklist?: RichTextChecklist; mentionHref?: (displayName: string) => string | null }) {
  const note = checklist?.ticked.get(item.key);
  const ticked = note !== undefined;
  const toggle = checklist?.onToggle;
  const box = (
    <button
      type="button"
      role="checkbox"
      aria-checked={ticked}
      disabled={!toggle}
      onClick={() => toggle?.(item.key, !ticked)}
      className={cn(
        "mt-[3px] flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border transition-colors disabled:cursor-default",
        ticked ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/50 bg-background enabled:hover:border-foreground",
      )}
      data-testid="checklist-box"
    >
      {ticked && <Check className="size-2.5" strokeWidth={3.5} />}
    </button>
  );
  return (
    <li className="flex items-start gap-2" data-checked={ticked || undefined} data-testid="checklist-item">
      {note ? <SimpleTooltip label={note}>{box}</SimpleTooltip> : box}
      <span className={cn("min-w-0 flex-1 transition-colors", ticked && "text-muted-foreground line-through decoration-muted-foreground/60")}>
        <Inline nodes={item.children} mentionHref={mentionHref} />
      </span>
    </li>
  );
}

function Block({ node, mentionHref, variant = "compact", checklist }: { node: BlockNode; mentionHref?: (displayName: string) => string | null; variant?: RichTextVariant; checklist?: RichTextChecklist }) {
  const doc = variant === "document";
  switch (node.type) {
    case "rule":
      return <hr className={cn("border-border/70", doc ? "my-4" : "my-2.5")} />;
    case "heading":
      return node.level === 1 ? (
        <p className={cn("leading-snug font-semibold tracking-tight text-foreground first:mt-0", doc ? "mt-6 mb-1.5 text-[20px]" : "mt-3 mb-1 text-[16px]", indentClass(node.indent))}>
          <Inline nodes={node.children} mentionHref={mentionHref} />
        </p>
      ) : (
        <p className={cn("leading-snug font-semibold text-foreground first:mt-0", doc ? "mt-5 mb-1.5 text-[14px]" : "mt-2.5 mb-0.5 text-[14px]", indentClass(node.indent))}>
          <Inline nodes={node.children} mentionHref={mentionHref} />
        </p>
      );
    case "list":
      return node.ordered ? (
        <ol className={cn("list-decimal space-y-0.5 pl-5", doc ? "my-1.5 text-muted-foreground" : "my-1", indentClass(node.indent))}>
          {node.items.map((item, index) => (
            <li key={index}>
              <Inline nodes={item} mentionHref={mentionHref} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className={cn("list-disc space-y-0.5 pl-5", doc ? "my-1.5 text-muted-foreground" : "my-1", indentClass(node.indent))}>
          {node.items.map((item, index) => (
            <li key={index}>
              <Inline nodes={item} mentionHref={mentionHref} />
            </li>
          ))}
        </ul>
      );
    case "checklist":
      return (
        <ul className={cn("space-y-1", doc ? "my-1.5" : "my-1", indentClass(node.indent))} data-testid="checklist">
          {node.items.map((item) => (
            <ChecklistBox key={item.key} item={item} checklist={checklist} mentionHref={mentionHref} />
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
 *
 * A document is drawn exactly as the editor draws it (the .rich-text-document
 * rules in globals.css): nothing here may show what the editor cannot make.
 */
export function RichText({
  body,
  mentionNames = [],
  className,
  mentionHref,
  variant = "compact",
  checklist,
}: {
  body: string;
  mentionNames?: readonly string[];
  className?: string;
  /** "document" for a brief: wider gaps between questions, the answer a shade quieter. */
  variant?: RichTextVariant;
  /** Where an @name leads. Without it a mention is highlighted but not clickable. */
  mentionHref?: (displayName: string) => string | null;
  /** The ticks on its checklists. */
  checklist?: RichTextChecklist;
}) {
  const parsed = React.useMemo(() => parseRichText(body, mentionNames), [body, mentionNames]);
  return (
    <div className={cn("text-[13px] break-words", variant === "document" ? "space-y-1.5" : "space-y-1", className)} data-testid="rich-text">
      {parsed.map((block, index) => (
        <Block key={index} node={block} mentionHref={mentionHref} variant={variant} checklist={checklist} />
      ))}
    </div>
  );
}
