"use client";

import { CalendarDays, Plus, UserRound, X } from "lucide-react";
import * as React from "react";
import { ColorDot } from "@/components/shared/label-pill";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AssetLink, TagOption, User } from "@/domain";
import { cleanDraftLinks, LinksEditor } from "@/features/assets/asset-links";
import { DatePicker } from "@/features/boards/components/pickers/date-picker";
import { PersonPicker } from "@/features/boards/components/pickers/person-picker";
import { formatShortDate } from "@/lib/dates/dates";
import { newId } from "@/lib/ids";
import { cn } from "@/lib/utils";

/**
 * What a block is made of: a name, who is on it, its own links, and its lines.
 * A line with an id is one already in the block; without one it is new. On an
 * edit, a line of the block that is not in `lines` was taken off.
 */
export interface AssetBlockForm {
  name: string;
  assigneeIds: string[];
  links: AssetLink[];
  lines: Array<{ id: string | null; name: string; assetType: string | null; quantity: number | null; dueDate: string | null }>;
}

interface DraftLine {
  key: string;
  id: string | null;
  name: string;
  assetType: string | null;
  quantity: number | null;
  dueDate: string | null;
}

const emptyLine = (): DraftLine => ({ key: newId(), id: null, name: "", assetType: null, quantity: 1, dueDate: null });

const draftLines = (block: AssetBlockForm | undefined): DraftLine[] =>
  block && block.lines.length > 0 ? block.lines.map((line) => ({ ...line, key: line.id ?? newId() })) : [emptyLine(), emptyLine()];

const NO_TYPE = "__none__";

/**
 * A block, set up or edited in one go: the name, the person, the links for the
 * whole block, then each thing being made with its own type, quantity and due
 * date. Lines without a name are left out.
 *
 * With `block` it edits that block — the same form, filled in — and hands back
 * everything on it; without, it starts empty and `initialName` names it.
 */
export function AssetBlockDialog({
  open,
  onOpenChange,
  block,
  initialName = "",
  assetTypes,
  users,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  block?: AssetBlockForm;
  initialName?: string;
  assetTypes: readonly TagOption[];
  users: User[];
  onSubmit: (block: AssetBlockForm) => void;
}) {
  const editing = !!block;
  const [name, setName] = React.useState(block?.name ?? initialName);
  const [assigneeIds, setAssigneeIds] = React.useState<string[]>(block?.assigneeIds ?? []);
  const [links, setLinks] = React.useState<AssetLink[]>(block?.links ?? []);
  const [lines, setLines] = React.useState<DraftLine[]>(() => draftLines(block));
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(block?.name ?? initialName);
      setAssigneeIds(block?.assigneeIds ?? []);
      setLinks(block?.links ?? []);
      setLines(draftLines(block));
    }
  }

  const patch = (key: string, p: Partial<DraftLine>) => setLines((current) => current.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const named = lines.filter((l) => l.name.trim());
  const ready = name.trim() !== "" && named.length > 0;
  const assignees = assigneeIds.map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);

  const submit = () => {
    if (!ready) return;
    onSubmit({
      name: name.trim(),
      assigneeIds,
      links: cleanDraftLinks(links),
      lines: named.map((l) => ({ id: l.id, name: l.name.trim(), assetType: l.assetType, quantity: l.quantity, dueDate: l.dueDate })),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" data-testid="asset-block-dialog">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit block" : "New block"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Block name, e.g. Event kit" aria-label="Block name" autoFocus maxLength={200} data-testid="asset-block-name" />
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="flex h-9 min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm transition-colors hover:bg-accent" data-testid="asset-block-assignee">
                {assignees.length > 0 ? (
                  <span className="flex shrink-0 -space-x-1">
                    {assignees.slice(0, 3).map((u) => (
                      <UserAvatar key={u.id} user={u} size="xs" tooltip={false} />
                    ))}
                  </span>
                ) : (
                  <UserRound className="size-3.5 shrink-0 opacity-60" />
                )}
                <span className={cn("truncate", assignees.length === 0 && "text-muted-foreground")}>
                  {assignees.length === 0 ? "In charge" : assignees.length === 1 ? assignees[0]!.displayName : `${assignees.length} people`}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-0">
              <PersonPicker users={users} value={assigneeIds} onChange={setAssigneeIds} />
            </PopoverContent>
          </Popover>
        </div>

        <ul className="grid gap-1.5" data-testid="asset-block-lines">
          {lines.map((line) => (
            <li key={line.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 rounded-xl border border-border/60 bg-card p-2 sm:grid-cols-[minmax(0,1fr)_8.5rem_4rem_7rem_auto] sm:items-center" data-testid="asset-block-line">
              <Input value={line.name} onChange={(e) => patch(line.key, { name: e.target.value })} placeholder="Item, e.g. A1 poster" aria-label="Item" className="h-8 text-[13px] max-sm:col-span-1" data-testid="asset-block-line-name" />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove this item"
                onClick={() => setLines((current) => (current.length > 1 ? current.filter((l) => l.key !== line.key) : [emptyLine()]))}
                className="text-muted-foreground hover:text-destructive sm:order-last"
                data-testid="asset-block-line-remove"
              >
                <X />
              </Button>
              <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_4rem_7rem] gap-1.5 sm:contents">
                <Select value={line.assetType ?? NO_TYPE} onValueChange={(v) => patch(line.key, { assetType: v === NO_TYPE ? null : v })}>
                  <SelectTrigger className="h-8 text-[13px]" aria-label="Type" data-testid="asset-block-line-type">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TYPE}>No type</SelectItem>
                    {assetTypes.map((option) => (
                      <SelectItem key={option.name} value={option.name}>
                        <span className="flex items-center gap-2">
                          <ColorDot color={option.color} />
                          {option.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={line.quantity ?? ""}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    patch(line.key, { quantity: Number.isFinite(n) && n >= 0 ? n : null });
                  }}
                  aria-label="Quantity"
                  placeholder="Qty"
                  className="h-8 text-[13px] tabular"
                  data-testid="asset-block-line-quantity"
                />
                <DueButton value={line.dueDate} onChange={(dueDate) => patch(line.key, { dueDate })} />
              </div>
            </li>
          ))}
        </ul>

        <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setLines((current) => [...current, emptyLine()])} data-testid="asset-block-add-line">
          <Plus /> Add item
        </Button>

        {/* Links for the whole block: the shared folder, the brief. Shown in the block's menu. */}
        <div className="@container/assets grid gap-1.5" data-testid="asset-block-links">
          <span className="label-quiet">Block links</span>
          <LinksEditor links={links} canEdit onChange={setLinks} />
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!ready} data-testid="asset-block-create">
            {editing ? "Save" : "Add block"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DueButton({ value, onChange }: { value: string | null; onChange: (value: string | null) => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-8 min-w-0 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-[13px] tabular transition-colors hover:bg-accent" aria-label={`Due: ${value ? formatShortDate(value) : "not set"}`} data-testid="asset-block-line-due">
          <CalendarDays className="size-3.5 shrink-0 opacity-60" />
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value ? formatShortDate(value) : "Due"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <DatePicker value={value} onChange={onChange} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
