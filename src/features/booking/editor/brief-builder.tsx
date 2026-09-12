"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlignLeft, Bookmark, BookmarkPlus, ChevronDown, CircleDot, Copy, Link2, ListChecks, LoaderCircle, Minus, Plus, TextCursorInput, Trash2, Type } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { BookingBlock, BookingBlockKind, BookingChoiceDisplay, BookingSavedBlock, BookingServiceType, BookingTextLevel } from "@/domain";
import { BOOKING_BLOCK_LABELS, BOOKING_CHOICE_DISPLAYS, BOOKING_CHOICE_DISPLAY_LABELS, BOOKING_TEXT_LEVELS, BOOKING_TEXT_LEVEL_LABELS, MAX_BOOKING_SAVED_BLOCK_NAME, isQuestionBlock, newBlockId, newBookingBlock, numberedQuestions } from "@/domain";
import { cn } from "@/lib/utils";
import { NumberBadge } from "../booking-fields";
import { ChoiceChips } from "./choice-chips";
import { DragHandle, EditorSection, Handle, Segmented, TextBox } from "./editor-controls";

/**
 * The builder for one service's brief: step two, block by block.
 *
 * Each block is a card with its controls in plain sight — the question, the
 * help text, the choices, and in the title bar whether it is required and what
 * can be done to it. An earlier version drew the finished form and hid the
 * controls until hovered; it looked like the form and edited like a puzzle.
 * "Preview the form" is where the finished form is looked at now.
 */

export const BLOCK_ICONS: Record<BookingBlockKind, React.ComponentType<{ className?: string }>> = {
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

export interface BriefBuilderProps {
  service: BookingServiceType;
  onPatch: (patch: Partial<BookingServiceType>) => void;
  /** Blocks the workspace keeps by name, for dropping in here. */
  savedBlocks: BookingSavedBlock[];
  onSaveBlock: (input: { name: string; block: BookingBlock }) => Promise<void>;
  onDeleteSavedBlock: (saved: BookingSavedBlock) => Promise<void>;
}

export function BriefBuilder({ service, onPatch, savedBlocks, onSaveBlock, onDeleteSavedBlock }: BriefBuilderProps) {
  const blocks = service.blocks;
  const numbers = new Map(numberedQuestions(blocks).map((q) => [q.block.id, q.number]));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const [saving, setSaving] = React.useState<BookingBlock | null>(null);

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
  const insertAt = (index: number, block: BookingBlock) => {
    const next = blocks.slice();
    next.splice(index, 0, block);
    setBlocks(next);
  };
  const add = (kind: BookingBlockKind) => insertAt(blocks.length, newBookingBlock(kind));
  // A copy with an id of its own: the brief and the saved block part ways here.
  const copyOf = (saved: BookingSavedBlock): BookingBlock => ({ ...structuredClone(saved.block), id: newBlockId() });
  const insertSaved = (saved: BookingSavedBlock) => insertAt(blocks.length, copyOf(saved));
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = blocks.findIndex((b) => b.id === active.id);
    const to = blocks.findIndex((b) => b.id === over.id);
    if (from < 0 || to < 0) return;
    setBlocks(arrayMove(blocks, from, to));
  };

  return (
    <div className="space-y-3" data-testid="brief-builder">
      {/* The heading of the step, which the form only shows when there is one. */}
      <EditorSection title="Heading of this step" testId="editor-brief-heading">
        <TextBox value={service.briefTitle ?? ""} onChange={(v) => onPatch({ briefTitle: v || null })} ariaLabel="Brief heading" placeholder="A heading for this step (optional)" className="text-[15px] font-semibold tracking-tight" testId="editor-brief-title" />
        <TextBox value={service.briefHint ?? ""} onChange={(v) => onPatch({ briefHint: v || null })} ariaLabel="Brief hint" placeholder="A line under it (optional)" className="text-[13px] text-muted-foreground" testId="editor-brief-hint" />
      </EditorSection>

      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis, restrictToParentElement]} onDragEnd={onDragEnd}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {blocks.map((block, index) => (
              <BlockEditor
                key={block.id}
                block={block}
                number={numbers.get(block.id) ?? null}
                onPatch={(patch) => patchBlock(block.id, patch)}
                onDuplicate={() => duplicateBlock(block.id)}
                onRemove={() => removeBlock(block.id)}
                onSave={() => setSaving(block)}
                // The gap above every block takes an insertion; the last block takes one below as well.
                insertAbove={<InsertLine position="top" saved={savedBlocks} onInsert={(b) => insertAt(index, b)} testId={`brief-insert-${index}`} />}
                insertBelow={index === blocks.length - 1 ? <InsertLine position="bottom" saved={savedBlocks} onInsert={(b) => insertAt(index + 1, b)} testId={`brief-insert-${index + 1}`} /> : null}
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

      {/* One row, always at the bottom, always the same seven, and the saved
          blocks beside them. A menu would hide the choice behind a click and
          make the shape of a brief harder to learn; these are cheap to show. */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/70 bg-surface/40 p-2" data-testid="brief-builder-add">
        {ADD_ORDER.map((kind) => {
          const Icon = BLOCK_ICONS[kind];
          return (
            <Button key={kind} type="button" variant="ghost" size="sm" onClick={() => add(kind)} className="text-muted-foreground hover:text-foreground" data-testid={`brief-add-${kind}`}>
              <Icon /> {BOOKING_BLOCK_LABELS[kind]}
            </Button>
          );
        })}
        <span aria-hidden className="mx-1 h-5 w-px bg-border/70" />
        <SavedBlocksMenu saved={savedBlocks} onInsert={insertSaved} onDelete={onDeleteSavedBlock} />
      </div>

      <SaveBlockDialog block={saving} existing={savedBlocks} onOpenChange={(open) => !open && setSaving(null)} onSave={onSaveBlock} />
    </div>
  );
}

function BlockEditor({
  block,
  number,
  onPatch,
  onDuplicate,
  onRemove,
  onSave,
  insertAbove,
  insertBelow,
}: {
  block: BookingBlock;
  number: number | null;
  onPatch: (patch: Partial<BookingBlock>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onSave: () => void;
  insertAbove?: React.ReactNode;
  insertBelow?: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const question = isQuestionBlock(block);
  const Icon = BLOCK_ICONS[block.kind];
  const name = question ? block.label || "this question" : BOOKING_BLOCK_LABELS[block.kind];

  return (
    // The sortable node is the wrapper, so the insert lines in its margins move with the card.
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn("relative", isDragging && "z-10 opacity-90")}>
      {!isDragging && insertAbove}
      {!isDragging && insertBelow}
    <EditorSection
      className={cn(isDragging && "shadow-lg")}
      testId={`editor-block-${block.id}`}
      title={
        <>
          <DragHandle label={`Reorder ${name}`} testId={`editor-block-drag-${block.id}`} setRef={setActivatorNodeRef} listeners={listeners} attributes={attributes} className="-ml-1" />
          {number !== null && <NumberBadge n={number} />}
          <Icon className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{BOOKING_BLOCK_LABELS[block.kind]}</span>
        </>
      }
      aside={
        <>
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
            <label className="mr-1 flex items-center gap-1.5 text-2xs text-muted-foreground">
              <Switch size="sm" checked={block.required} onCheckedChange={(on) => onPatch({ required: on } as Partial<BookingBlock>)} data-testid={`editor-block-required-${block.id}`} />
              Required
            </label>
          )}
          {block.kind !== "separator" && (
            <Handle label="Save as a block" onClick={onSave} testId={`editor-block-save-${block.id}`}>
              <BookmarkPlus />
            </Handle>
          )}
          <Handle label="Duplicate" onClick={onDuplicate} testId={`editor-block-copy-${block.id}`}>
            <Copy />
          </Handle>
          <Handle label="Remove" onClick={onRemove} destructive testId={`editor-block-remove-${block.id}`}>
            <Trash2 />
          </Handle>
        </>
      }
    >
      {/* A separator is its title bar and nothing else. */}
      {block.kind !== "separator" && <BlockBody block={block} onPatch={onPatch} />}
    </EditorSection>
    </div>
  );
}

/**
 * The line that appears in the gap between two blocks, with a plus on it.
 *
 * Hovering the gap is how somebody says "here"; the bottom row of buttons only
 * ever says "at the end", and a brief being reworked is rarely added to at the
 * end. The menu it opens is the same seven kinds and the saved blocks.
 */
function InsertLine({ position, saved, onInsert, testId }: { position: "top" | "bottom"; saved: BookingSavedBlock[]; onInsert: (block: BookingBlock) => void; testId?: string }) {
  const [open, setOpen] = React.useState(false);
  const insert = (block: BookingBlock) => {
    onInsert(block);
    setOpen(false);
  };
  return (
    <div className={cn("group/insert absolute inset-x-0 z-[1] flex h-4 items-center", position === "top" ? "-top-3" : "-bottom-3")} data-testid={testId}>
      <div className={cn("flex w-full items-center transition-opacity", open ? "opacity-100" : "opacity-0 group-hover/insert:opacity-100 focus-within:opacity-100")}>
        <span aria-hidden className="h-px flex-1 bg-ring/70" />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button type="button" aria-label="Insert a block here" className="flex size-5 items-center justify-center rounded-full bg-ring text-background shadow-sm transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-ring/50" data-testid={testId ? `${testId}-button` : undefined}>
              <Plus className="size-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-72 p-1.5">
            <div className="grid grid-cols-2 gap-0.5">
              {ADD_ORDER.map((kind) => {
                const Icon = BLOCK_ICONS[kind];
                return (
                  <button key={kind} type="button" onClick={() => insert(newBookingBlock(kind))} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent" data-testid={testId ? `${testId}-${kind}` : undefined}>
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    {BOOKING_BLOCK_LABELS[kind]}
                  </button>
                );
              })}
            </div>
            {saved.length > 0 && (
              <>
                <p className="mt-1.5 border-t border-border/60 px-2 pt-2 pb-1 label-quiet">Saved blocks</p>
                <ul className="scrollbar-thin max-h-48 overflow-y-auto">
                  {saved.map((entry) => {
                    const Icon = BLOCK_ICONS[entry.block.kind];
                    return (
                      <li key={entry.id}>
                        <button type="button" onClick={() => insert({ ...structuredClone(entry.block), id: newBlockId() })} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent" data-testid={testId ? `${testId}-saved-${entry.id}` : undefined}>
                          <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="truncate">{entry.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </PopoverContent>
        </Popover>
        <span aria-hidden className="h-px flex-1 bg-ring/70" />
      </div>
    </div>
  );
}

function BlockBody({ block, onPatch }: { block: BookingBlock; onPatch: (patch: Partial<BookingBlock>) => void }) {
  if (block.kind === "separator") return null;
  if (block.kind === "text") {
    return (
      <TextBox
        value={block.text}
        onChange={(v) => onPatch({ text: v } as Partial<BookingBlock>)}
        ariaLabel="Text"
        placeholder="Write something for whoever is filling this in"
        className={cn(block.level === "heading" ? "text-[15px] font-semibold tracking-tight" : block.level === "subheading" ? "text-[13px] font-semibold" : "text-[13px] text-muted-foreground")}
        testId={`editor-block-text-${block.id}`}
        multiline={block.level === "body"}
      />
    );
  }
  return (
    <>
      <TextBox value={block.label} onChange={(v) => onPatch({ label: v } as Partial<BookingBlock>)} ariaLabel="Question" placeholder="What are you asking?" className="text-[13px] font-medium" testId={`editor-block-label-${block.id}`} />
      <TextBox
        value={block.description ?? ""}
        onChange={(v) => onPatch({ description: v || null } as Partial<BookingBlock>)}
        ariaLabel="Help text"
        placeholder="Help text under the question (optional)"
        className="text-2xs text-muted-foreground"
        testId={`editor-block-description-${block.id}`}
      />
      {(block.kind === "multi" || block.kind === "single") && (
        <div className="mt-1 grid gap-2">
          <ChoiceChips
            options={block.options}
            onChange={(options) => onPatch({ options } as Partial<BookingBlock>)}
            layout={block.kind === "single" && block.display === "dropdown" ? "list" : "chips"}
            testIdPrefix={`editor-block-options-${block.id}`}
          />
          {/* Chips for a few words each; a dropdown for choices that are sentences. */}
          {block.kind === "single" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="label-quiet">Answered with</span>
              <Segmented
                options={BOOKING_CHOICE_DISPLAYS.map((display) => ({ value: display, label: BOOKING_CHOICE_DISPLAY_LABELS[display] }))}
                value={block.display ?? "chips"}
                onChange={(display: BookingChoiceDisplay) => onPatch({ display } as Partial<BookingBlock>)}
                label="How the choice is answered"
                testId={`editor-block-display-${block.id}`}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ---- saved blocks -------------------------------------------------------------

/** What a saved block is called on the menu: its question, or its first words. */
function describeBlock(block: BookingBlock): string {
  if (isQuestionBlock(block)) return block.label;
  if (block.kind === "text") return block.text;
  return BOOKING_BLOCK_LABELS.separator;
}

/** The workspace's saved blocks, ready to drop into the brief; each may be taken off the list here too. */
function SavedBlocksMenu({ saved, onInsert, onDelete }: { saved: BookingSavedBlock[]; onInsert: (saved: BookingSavedBlock) => void; onDelete: (saved: BookingSavedBlock) => Promise<void> }) {
  const [open, setOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<BookingSavedBlock | null>(null);
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" data-testid="brief-saved-blocks">
            <Bookmark /> Saved blocks
            {saved.length > 0 && <span className="text-2xs tabular">{saved.length}</span>}
            <ChevronDown className="opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-1.5" data-testid="brief-saved-blocks-menu">
          {saved.length === 0 ? (
            <p className="px-2 py-3 text-center text-[13px] text-muted-foreground">
              Nothing saved yet. The bookmark on any block keeps it here for every brief.
            </p>
          ) : (
            <ul className="scrollbar-thin max-h-72 overflow-y-auto">
              {saved.map((entry) => {
                const Icon = BLOCK_ICONS[entry.block.kind];
                return (
                  <li key={entry.id} className="flex items-center gap-1 rounded-md hover:bg-accent" data-testid={`saved-block-${entry.id}`}>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[13px]"
                      onClick={() => {
                        onInsert(entry);
                        setOpen(false);
                      }}
                      data-testid={`saved-block-insert-${entry.id}`}
                    >
                      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{entry.name}</span>
                        <span className="block truncate text-2xs text-muted-foreground">{describeBlock(entry.block)}</span>
                      </span>
                    </button>
                    <Handle label={`Delete saved block ${entry.name}`} onClick={() => setDeleting(entry)} destructive testId={`saved-block-delete-${entry.id}`}>
                      <Trash2 />
                    </Handle>
                  </li>
                );
              })}
            </ul>
          )}
        </PopoverContent>
      </Popover>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description="The saved block goes for everyone. Briefs it was dropped into keep their copy."
        confirmLabel="Delete block"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await onDelete(deleting);
            toast.success(`Deleted “${deleting.name}”`);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not delete the block");
          }
          setDeleting(null);
        }}
      />
    </>
  );
}

/** Names a block and keeps it. Opens with the block's own words as the name, which is usually right. */
function SaveBlockDialog({ block, existing, onOpenChange, onSave }: { block: BookingBlock | null; existing: BookingSavedBlock[]; onOpenChange: (open: boolean) => void; onSave: (input: { name: string; block: BookingBlock }) => Promise<void> }) {
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  // Reset on every opening, so the box offers this block's words and not the last one's.
  const [seenBlock, setSeenBlock] = React.useState<BookingBlock | null>(null);
  if (block !== seenBlock) {
    setSeenBlock(block);
    setName(block ? describeBlock(block).slice(0, MAX_BOOKING_SAVED_BLOCK_NAME) : "");
  }
  const trimmed = name.trim();
  const replaces = existing.find((b) => b.name.toLowerCase() === trimmed.toLowerCase());

  const save = async () => {
    if (!block || !trimmed) return;
    setBusy(true);
    try {
      await onSave({ name: trimmed, block });
      toast.success(replaces ? `Saved block “${trimmed}” updated` : `Saved as “${trimmed}”`, { description: "Drop it into any brief from Saved blocks." });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the block");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={block !== null} onOpenChange={onOpenChange}>
      <DialogContent size="sm" data-testid="save-block-dialog">
        <DialogHeader>
          <DialogTitle>Save as a block</DialogTitle>
          <DialogDescription>Keeps this block, choices and all, for any brief in this workspace.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="save-block-name">Name</Label>
            <Input id="save-block-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={MAX_BOOKING_SAVED_BLOCK_NAME} data-testid="save-block-name" />
            {replaces && <p className="text-2xs text-amber-700 dark:text-amber-300">Replaces the saved block already called “{replaces.name}”.</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmed || busy} data-testid="save-block-submit">
              {busy ? <LoaderCircle className="animate-spin" /> : null} {replaces ? "Replace block" : "Save block"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
