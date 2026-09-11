"use client";

import { AlignLeft, ArrowDown, ArrowUp, CircleDot, Copy, Link2, ListChecks, Minus, TextCursorInput, Trash2, Type } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { BookingBlock, BookingBlockKind, BookingHintMode, BookingServiceType, BookingTextLevel } from "@/domain";
import { BOOKING_BLOCK_LABELS, BOOKING_HINT_MODES, BOOKING_HINT_MODE_LABELS, BOOKING_TEXT_LEVELS, BOOKING_TEXT_LEVEL_LABELS, isQuestionBlock, newBlockId, newBookingBlock, numberedQuestions } from "@/domain";
import { cn } from "@/lib/utils";
import { BlockField, NumberBadge, SeparatorBlockView, TextBlockView } from "../booking-fields";
import { optionsToText, parseOptions } from "./options";
import { Handle, TextBox } from "./editor-controls";

/**
 * The builder for one service's brief: step two, block by block.
 *
 * Every block is shown as the thing it will be — the control a stakeholder
 * meets, disabled, under the words that make it — so an administrator writes a
 * question while looking at the box it labels rather than at a form describing
 * a form. The handles are the same on every card and always in the same place,
 * because a builder is used for an hour at a time and hunting for the remove
 * button on card eleven is what makes that hour long.
 */

const BLOCK_ICONS: Record<BookingBlockKind, React.ComponentType<{ className?: string }>> = {
  short: TextCursorInput,
  long: AlignLeft,
  multi: ListChecks,
  single: CircleDot,
  link: Link2,
  separator: Minus,
  text: Type,
};

/** The order the "add" row offers them in: the two that carry most briefs first. */
const ADD_ORDER: BookingBlockKind[] = ["short", "long", "multi", "single", "link", "text", "separator"];

export function BriefBuilder({ service, onPatch }: { service: BookingServiceType; onPatch: (patch: Partial<BookingServiceType>) => void }) {
  const blocks = service.blocks;
  const numbers = new Map(numberedQuestions(blocks).map((q) => [q.block.id, q.number]));

  const setBlocks = (next: BookingBlock[]) => onPatch({ blocks: next });
  const patchBlock = (id: string, patch: Partial<BookingBlock>) => setBlocks(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as BookingBlock) : b)));
  const moveBlock = (id: string, by: -1 | 1) => {
    const from = blocks.findIndex((b) => b.id === id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= blocks.length) return;
    const next = blocks.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    setBlocks(next);
  };
  const removeBlock = (id: string) => setBlocks(blocks.filter((b) => b.id !== id));
  const duplicateBlock = (id: string) => {
    const at = blocks.findIndex((b) => b.id === id);
    if (at < 0) return;
    const next = blocks.slice();
    next.splice(at + 1, 0, { ...structuredClone(blocks[at]!), id: newBlockId() });
    setBlocks(next);
  };
  const add = (kind: BookingBlockKind) => setBlocks([...blocks, newBookingBlock(kind)]);

  return (
    <div className="space-y-4" data-testid="brief-builder">
      <div className="space-y-1 rounded-xl border border-dashed border-border p-4">
        <TextBox value={service.briefTitle} onChange={(v) => onPatch({ briefTitle: v })} ariaLabel="Brief heading" placeholder="Heading of this step" className="text-[15px] font-semibold tracking-tight" testId="editor-brief-title" />
        <TextBox value={service.briefHint ?? ""} onChange={(v) => onPatch({ briefHint: v || null })} ariaLabel="Brief hint" placeholder="A line under the heading (optional)" className="text-[13px] text-muted-foreground" />
      </div>

      <div className="space-y-3">
        {blocks.map((block, i) => (
          <BlockEditor
            key={block.id}
            block={block}
            number={numbers.get(block.id) ?? null}
            first={i === 0}
            last={i === blocks.length - 1}
            onPatch={(patch) => patchBlock(block.id, patch)}
            onMove={(by) => moveBlock(block.id, by)}
            onDuplicate={() => duplicateBlock(block.id)}
            onRemove={() => removeBlock(block.id)}
          />
        ))}
        {blocks.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground" data-testid="brief-builder-empty">
            Nothing here yet. Add the first question below — it is what {service.name || "this service"} asks and nobody else.
          </p>
        )}
      </div>

      {/* One row, always at the bottom, always the same seven. A menu would
          hide the choice behind a click and make the shape of a brief harder to
          learn; these are cheap enough to show. */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-border/70 bg-surface/40 p-2" data-testid="brief-builder-add">
        {ADD_ORDER.map((kind) => {
          const Icon = BLOCK_ICONS[kind];
          return (
            <Button key={kind} type="button" variant="ghost" size="sm" onClick={() => add(kind)} className="text-muted-foreground hover:text-foreground" data-testid={`brief-add-${kind}`}>
              <Icon /> {BOOKING_BLOCK_LABELS[kind]}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function BlockEditor({
  block,
  number,
  first,
  last,
  onPatch,
  onMove,
  onDuplicate,
  onRemove,
}: {
  block: BookingBlock;
  number: number | null;
  first: boolean;
  last: boolean;
  onPatch: (patch: Partial<BookingBlock>) => void;
  onMove: (by: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const Icon = BLOCK_ICONS[block.kind];
  const question = isQuestionBlock(block);
  const choice = block.kind === "multi" || block.kind === "single";
  const [optionsText, setOptionsText] = React.useState(() => (choice ? optionsToText((block as { options: Parameters<typeof optionsToText>[0] }).options) : ""));

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-card p-3.5 shadow-xs" data-testid={`editor-block-${block.id}`}>
      <div className="flex items-center gap-2">
        {number !== null && <NumberBadge n={number} />}
        <Badge variant="muted" className="shrink-0 gap-1">
          <Icon className="size-2.5" />
          {BOOKING_BLOCK_LABELS[block.kind]}
        </Badge>
        <span className="min-w-0 flex-1" />
        <div className="flex shrink-0 items-center gap-0.5">
          <Handle label="Move up" onClick={() => onMove(-1)} disabled={first} testId={`editor-block-up-${block.id}`}>
            <ArrowUp />
          </Handle>
          <Handle label="Move down" onClick={() => onMove(1)} disabled={last} testId={`editor-block-down-${block.id}`}>
            <ArrowDown />
          </Handle>
          <Handle label="Duplicate" onClick={onDuplicate} testId={`editor-block-copy-${block.id}`}>
            <Copy />
          </Handle>
          <Handle label="Remove" onClick={onRemove} testId={`editor-block-remove-${block.id}`}>
            <Trash2 />
          </Handle>
        </div>
      </div>

      {block.kind === "separator" && (
        <div className="opacity-70">
          <SeparatorBlockView />
        </div>
      )}

      {block.kind === "text" && (
        <div className="space-y-2">
          <TextBox
            value={block.text}
            onChange={(v) => onPatch({ text: v } as Partial<BookingBlock>)}
            ariaLabel="Text"
            placeholder="What this says"
            className={cn(block.level === "heading" ? "text-[15px] font-semibold tracking-tight" : block.level === "subheading" ? "text-[13px] font-semibold" : "text-[13px] text-muted-foreground")}
            testId={`editor-block-text-${block.id}`}
            multiline={block.level === "body"}
          />
          <label className="flex items-center gap-1.5 text-2xs text-muted-foreground">
            Shown as
            <Select value={block.level} onValueChange={(v) => onPatch({ level: v as BookingTextLevel } as Partial<BookingBlock>)}>
              <SelectTrigger className="h-7 w-auto gap-1 px-2 text-2xs" aria-label="Text level" data-testid={`editor-block-level-${block.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOOKING_TEXT_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {BOOKING_TEXT_LEVEL_LABELS[level]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="pointer-events-none rounded-lg border border-border/50 bg-surface/40 p-2.5 opacity-80" aria-hidden>
            <TextBlockView block={block} />
          </div>
        </div>
      )}

      {question && (
        <>
          <TextBox value={block.label} onChange={(v) => onPatch({ label: v } as Partial<BookingBlock>)} ariaLabel="Question" placeholder="What are you asking?" className="text-[13px] font-medium" testId={`editor-block-label-${block.id}`} />

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <TextBox
              value={block.description ?? ""}
              onChange={(v) => onPatch({ description: v || null } as Partial<BookingBlock>)}
              ariaLabel="Description"
              placeholder="Explain it, give an example (optional)"
              className="text-2xs text-muted-foreground"
              testId={`editor-block-description-${block.id}`}
            />
            <label className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              Shown
              <Select value={block.hintMode} onValueChange={(v) => onPatch({ hintMode: v as BookingHintMode } as Partial<BookingBlock>)} disabled={!block.description?.trim()}>
                <SelectTrigger className="h-7 w-auto gap-1 px-2 text-2xs" aria-label="Where the description is shown" data-testid={`editor-block-hintmode-${block.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOOKING_HINT_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode} disabled={mode === "placeholder" && !HAS_PLACEHOLDER.includes(block.kind)}>
                      {BOOKING_HINT_MODE_LABELS[mode]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          {choice && (
            <TextBox
              value={optionsText}
              onChange={(v) => {
                setOptionsText(v);
                onPatch({ options: parseOptions(v, (block as { options: Parameters<typeof optionsToText>[0] }).options) } as Partial<BookingBlock>);
              }}
              ariaLabel="Choices"
              placeholder="Choices, separated with commas"
              className="text-2xs"
              testId={`editor-block-options-${block.id}`}
            />
          )}

          <label className="flex w-fit items-center gap-1.5 text-2xs text-muted-foreground">
            <Switch size="sm" checked={block.required} onCheckedChange={(on) => onPatch({ required: on } as Partial<BookingBlock>)} data-testid={`editor-block-required-${block.id}`} />
            Required
          </label>

          <div className="pointer-events-none rounded-lg border border-border/50 bg-surface/40 p-2.5 opacity-80" aria-hidden>
            <BlockField block={block} number={number} value={undefined} onChange={() => {}} preview hideLabel />
          </div>
        </>
      )}
    </div>
  );
}

/** Kinds with a box a placeholder could sit in; the rest are chips, which have none. */
const HAS_PLACEHOLDER: BookingBlockKind[] = ["short", "long", "link"];
