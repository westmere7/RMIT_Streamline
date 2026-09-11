"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlignLeft, CircleDot, CircleQuestionMark, Copy, Link2, ListChecks, Minus, TextCursorInput, Trash2, Type } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { BookingBlock, BookingBlockKind, BookingHintMode, BookingServiceType, BookingTextLevel } from "@/domain";
import { BOOKING_BLOCK_LABELS, BOOKING_HINT_MODES, BOOKING_HINT_MODE_LABELS, BOOKING_TEXT_LEVELS, BOOKING_TEXT_LEVEL_LABELS, isQuestionBlock, newBlockId, newBookingBlock, numberedQuestions } from "@/domain";
import { cn } from "@/lib/utils";
import { NumberBadge } from "../booking-fields";
import { ChoiceChips } from "./choice-chips";
import { DragHandle, EditorFrame, TextBox } from "./editor-controls";

/**
 * The builder for one service's brief: step two, block by block.
 *
 * It is the form, not a description of one. Every block is drawn the way a
 * stakeholder will meet it — the same label, the same chips, the same box — and
 * editing happens by typing into that rather than into fields underneath it: a
 * choice is renamed by typing on the chip, recoloured by its dot, removed by
 * its cross. The handles that have nowhere to live in the finished form (drag,
 * duplicate, delete, required, where the description goes) sit in a quiet strip
 * that appears when the block is under the cursor, so the page reads as the
 * form until somebody reaches for it.
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

/** Kinds with a box a placeholder could sit in; the rest are chips, which have none. */
const HAS_PLACEHOLDER: BookingBlockKind[] = ["short", "long", "link"];

export function BriefBuilder({ service, onPatch }: { service: BookingServiceType; onPatch: (patch: Partial<BookingServiceType>) => void }) {
  const blocks = service.blocks;
  const numbers = new Map(numberedQuestions(blocks).map((q) => [q.block.id, q.number]));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const setBlocks = (next: BookingBlock[]) => onPatch({ blocks: next });
  const patchBlock = (id: string, patch: Partial<BookingBlock>) => setBlocks(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as BookingBlock) : b)));
  const removeBlock = (id: string) => setBlocks(blocks.filter((b) => b.id !== id));
  const duplicateBlock = (id: string) => {
    const at = blocks.findIndex((b) => b.id === id);
    if (at < 0) return;
    const next = blocks.slice();
    next.splice(at + 1, 0, { ...structuredClone(blocks[at]!), id: newBlockId() });
    setBlocks(next);
  };
  const add = (kind: BookingBlockKind) => setBlocks([...blocks, newBookingBlock(kind)]);
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = blocks.findIndex((b) => b.id === active.id);
    const to = blocks.findIndex((b) => b.id === over.id);
    if (from < 0 || to < 0) return;
    setBlocks(arrayMove(blocks, from, to));
  };

  return (
    <div className="space-y-4" data-testid="brief-builder">
      {/* The heading of the step, which the form only shows when there is one.
          Emptying both boxes takes it off, the way removing a text block does. */}
      <div className="space-y-1 rounded-xl border border-dashed border-border/70 p-4">
        <TextBox value={service.briefTitle ?? ""} onChange={(v) => onPatch({ briefTitle: v || null })} ariaLabel="Brief heading" placeholder="A heading for this step (optional)" className="text-[15px] font-semibold tracking-tight" testId="editor-brief-title" />
        <TextBox value={service.briefHint ?? ""} onChange={(v) => onPatch({ briefHint: v || null })} ariaLabel="Brief hint" placeholder="A line under it (optional)" className="text-[13px] text-muted-foreground" testId="editor-brief-hint" />
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis, restrictToParentElement]} onDragEnd={onDragEnd}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {blocks.map((block) => (
              <BlockEditor
                key={block.id}
                block={block}
                number={numbers.get(block.id) ?? null}
                onPatch={(patch) => patchBlock(block.id, patch)}
                onDuplicate={() => duplicateBlock(block.id)}
                onRemove={() => removeBlock(block.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {blocks.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground" data-testid="brief-builder-empty">
          Nothing here yet. Add the first question below — it is what {service.name || "this service"} asks and nobody else.
        </p>
      )}

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

function BlockEditor({ block, number, onPatch, onDuplicate, onRemove }: { block: BookingBlock; number: number | null; onPatch: (patch: Partial<BookingBlock>) => void; onDuplicate: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const question = isQuestionBlock(block);
  const description = question ? (block.description ?? "") : "";
  const placeholder = question && block.hintMode === "placeholder" && description.trim() ? description.trim() : undefined;

  return (
    <EditorFrame
      innerRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "z-10 border-border bg-card opacity-90 shadow-lg")}
      testId={`editor-block-${block.id}`}
      handle={<DragHandle label={`Reorder ${question ? block.label || "this question" : BOOKING_BLOCK_LABELS[block.kind]}`} testId={`editor-block-drag-${block.id}`} setRef={setActivatorNodeRef} listeners={listeners} attributes={attributes} />}
      chrome={<BlockChrome block={block} onPatch={onPatch} onDuplicate={onDuplicate} onRemove={onRemove} />}
    >

      {block.kind === "separator" && <hr className="my-2 border-border/70" />}

      {block.kind === "text" && (
        <TextBox
          value={block.text}
          onChange={(v) => onPatch({ text: v } as Partial<BookingBlock>)}
          ariaLabel="Text"
          placeholder="Write something for whoever is filling this in"
          className={cn(block.level === "heading" ? "text-[15px] font-semibold tracking-tight" : block.level === "subheading" ? "text-[13px] font-semibold" : "text-[13px] text-muted-foreground")}
          testId={`editor-block-text-${block.id}`}
          multiline={block.level === "body"}
        />
      )}

      {question && (
        <div className="grid gap-1.5">
          {/* Label and description exactly where the form puts them: the icon
              beside the label, the line under it, the placeholder in the box. */}
          <div className="flex items-center gap-1.5">
            {number !== null && <NumberBadge n={number} />}
            <TextBox value={block.label} onChange={(v) => onPatch({ label: v } as Partial<BookingBlock>)} ariaLabel="Question" placeholder="What are you asking?" className="min-w-0 flex-1 text-[13px] font-medium" testId={`editor-block-label-${block.id}`} />
            {block.required && (
              <span aria-hidden className="text-primary">
                *
              </span>
            )}
            {block.hintMode === "icon" && description.trim() && (
              <SimpleTooltip label={description.trim()}>
                <span className="text-muted-foreground">
                  <CircleQuestionMark className="size-3.5" />
                </span>
              </SimpleTooltip>
            )}
          </div>

          {block.hintMode === "below" && (
            <TextBox
              value={description}
              onChange={(v) => onPatch({ description: v || null } as Partial<BookingBlock>)}
              ariaLabel="Description"
              placeholder="Explain it, give an example (optional)"
              quiet={!description.trim()}
              className="-mt-0.5 text-2xs text-muted-foreground"
              testId={`editor-block-description-${block.id}`}
            />
          )}

          {block.kind === "short" && <Input readOnly placeholder={placeholder} className="pointer-events-none text-muted-foreground/60" tabIndex={-1} aria-hidden />}
          {block.kind === "long" && <Textarea readOnly rows={3} placeholder={placeholder} className="pointer-events-none resize-none text-muted-foreground/60" tabIndex={-1} aria-hidden />}
          {block.kind === "link" && (
            <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
              <Input readOnly placeholder={placeholder ?? "https://"} className="pointer-events-none text-muted-foreground/60" tabIndex={-1} aria-hidden />
              <Input readOnly placeholder="What to call it (optional)" className="pointer-events-none text-muted-foreground/60" tabIndex={-1} aria-hidden />
            </div>
          )}
          {(block.kind === "multi" || block.kind === "single") && (
            <ChoiceChips options={block.options} onChange={(options) => onPatch({ options } as Partial<BookingBlock>)} testIdPrefix={`editor-block-options-${block.id}`} />
          )}

          {/* The description when it does not belong above: an icon's words and
              a placeholder's words are still the team's to write. */}
          {block.hintMode !== "below" && (
            <TextBox
              value={description}
              onChange={(v) => onPatch({ description: v || null } as Partial<BookingBlock>)}
              ariaLabel="Description"
              placeholder={block.hintMode === "icon" ? "What the question mark says (optional)" : "What the empty box says (optional)"}
              quiet
              className="text-2xs text-muted-foreground/70 italic"
              testId={`editor-block-description-${block.id}`}
            />
          )}
        </div>
      )}
    </EditorFrame>
  );
}

/** The handles a block needs and the finished form has no room for. */
function BlockChrome({ block, onPatch, onDuplicate, onRemove }: { block: BookingBlock; onPatch: (patch: Partial<BookingBlock>) => void; onDuplicate: () => void; onRemove: () => void }) {
  const Icon = BLOCK_ICONS[block.kind];
  const question = isQuestionBlock(block);
  return (
    <>
      <span className="flex items-center gap-1 pr-1 text-2xs text-muted-foreground">
        <Icon className="size-3" />
        {BOOKING_BLOCK_LABELS[block.kind]}
      </span>
      {block.kind === "text" && (
        <Select value={block.level} onValueChange={(v) => onPatch({ level: v as BookingTextLevel } as Partial<BookingBlock>)}>
          <SelectTrigger className="h-6 w-auto gap-1 px-1.5 text-2xs" aria-label="Text level" data-testid={`editor-block-level-${block.id}`}>
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
      )}
      {question && (
        <>
          <label className="flex items-center gap-1 text-2xs text-muted-foreground">
            <Switch size="sm" checked={block.required} onCheckedChange={(on) => onPatch({ required: on } as Partial<BookingBlock>)} data-testid={`editor-block-required-${block.id}`} />
            Required
          </label>
          <Select value={block.hintMode} onValueChange={(v) => onPatch({ hintMode: v as BookingHintMode } as Partial<BookingBlock>)}>
            <SelectTrigger className="h-6 w-auto gap-1 px-1.5 text-2xs" aria-label="Where the description is shown" data-testid={`editor-block-hintmode-${block.id}`}>
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
        </>
      )}
      <Button type="button" variant="ghost" size="icon-xs" aria-label="Duplicate" title="Duplicate" onClick={onDuplicate} className="text-muted-foreground" data-testid={`editor-block-copy-${block.id}`}>
        <Copy />
      </Button>
      <Button type="button" variant="ghost" size="icon-xs" aria-label="Remove" title="Remove" onClick={onRemove} className="text-muted-foreground hover:text-destructive" data-testid={`editor-block-remove-${block.id}`}>
        <Trash2 />
      </Button>
    </>
  );
}
