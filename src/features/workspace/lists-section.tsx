"use client";

import { Plus, Trash2, X } from "lucide-react";
import * as React from "react";
import { ColorPicker } from "@/components/shared/color-picker";
import { LabelPill } from "@/components/shared/label-pill";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ColorToken, TagOption, WorkspaceListKey } from "@/domain";
import { MAX_LIST_OPTION_NAME, WORKSPACE_LIST_KEYS, WORKSPACE_LIST_META } from "@/domain";
import { useListOptionUsage, useWorkspaceLists, useWorkspaceListMutations } from "@/features/workspace/list-hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses, tagColorFor } from "@/lib/colors";
import { canManageWorkspace } from "@/lib/permissions/permissions";
import { cn } from "@/lib/utils";

/** Nothing means "leave the word where it is" in the replace picker. */
const KEEP = "__keep__";

/**
 * The lists this workspace standardises: the asset types a deliverable can be,
 * the stakeholder groups a request comes from. One vocabulary for everyone, so
 * they are workspace-wide and only workspace admins may change them — the same
 * rule the database enforces (policies/0011_workspace_lists_policies.sql).
 *
 * A word already in use cannot simply vanish, so deleting one says how many
 * things still carry it and offers to hand them to another option.
 */
export function ListsSection() {
  const ws = useWorkspace();
  const lists = useWorkspaceLists(ws.workspace.id);
  const manage = canManageWorkspace(ws.permissions);

  return (
    <>
      <div className="mb-4">
        <h2 className="text-base font-semibold">Lists</h2>
        <p className="text-[13px] text-muted-foreground">The words everyone picks from. {manage ? "Editing one changes it for the whole workspace." : "Only workspace owners and admins can change them."}</p>
      </div>
      <div className="space-y-6">
        {WORKSPACE_LIST_KEYS.map((key) => (
          <ListEditor key={key} listKey={key} options={lists.data?.[key] ?? WORKSPACE_LIST_META[key].defaults.map((o) => ({ ...o }))} canEdit={manage} />
        ))}
      </div>
    </>
  );
}

function ListEditor({ listKey, options, canEdit }: { listKey: WorkspaceListKey; options: TagOption[]; canEdit: boolean }) {
  const ws = useWorkspace();
  const meta = WORKSPACE_LIST_META[listKey];
  const { save } = useWorkspaceListMutations(ws.workspace.id);
  const [adding, setAdding] = React.useState("");
  const [deleting, setDeleting] = React.useState<TagOption | null>(null);

  const commit = (next: TagOption[], renames: Record<string, string> = {}) => save.mutate({ listKey, options: next, renames });

  const add = () => {
    const name = adding.trim();
    if (!name) return;
    if (options.some((o) => o.name.toLowerCase() === name.toLowerCase())) {
      setAdding("");
      return;
    }
    commit([...options, { name, color: tagColorFor(name) }]);
    setAdding("");
  };

  const rename = (index: number, name: string) => {
    const trimmed = name.trim();
    const current = options[index]!;
    if (!trimmed || trimmed === current.name) return;
    if (options.some((o, i) => i !== index && o.name.toLowerCase() === trimmed.toLowerCase())) return;
    commit(
      options.map((o, i) => (i === index ? { ...o, name: trimmed } : o)),
      { [current.name]: trimmed },
    );
  };

  const recolor = (index: number, color: ColorToken) => commit(options.map((o, i) => (i === index ? { ...o, color } : o)));

  return (
    <section data-testid={`list-${listKey}`}>
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-[13px] font-semibold">{meta.label}</h3>
        <p className="text-2xs text-muted-foreground">{meta.description}</p>
        <span className="ml-auto text-2xs text-muted-foreground tabular">{options.length}</span>
      </div>

      <div className="rounded-xl border border-border/70 bg-card shadow-xs">
        <ul className="divide-y divide-border/60">
          {options.map((option, index) => (
            <li key={`${option.name}-${index}`} className="group flex items-center gap-2 px-2.5 py-1.5" data-testid="list-option">
              <Popover>
                <PopoverTrigger asChild disabled={!canEdit}>
                  <button
                    type="button"
                    aria-label={`Colour of ${option.name}`}
                    className={cn("size-4 shrink-0 rounded-full", colorClasses(option.color).dot, canEdit && "hover:ring-2 hover:ring-ring")}
                    data-testid="list-option-color"
                  />
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-2">
                  <ColorPicker value={option.color} onChange={(color) => recolor(index, color)} />
                </PopoverContent>
              </Popover>

              {canEdit ? (
                <input
                  defaultValue={option.name}
                  key={option.name}
                  maxLength={MAX_LIST_OPTION_NAME}
                  aria-label={`Name of ${option.name}`}
                  onBlur={(e) => rename(index, e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      e.currentTarget.value = option.name;
                      e.currentTarget.blur();
                    }
                  }}
                  className="h-7 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-[13px] outline-none hover:bg-accent focus:bg-background focus:ring-2 focus:ring-ring"
                  data-testid="list-option-name"
                />
              ) : (
                <span className="min-w-0 flex-1 truncate px-1.5 text-[13px]" data-testid="list-option-name">
                  {option.name}
                </span>
              )}

              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${option.name}`}
                  onClick={() => setDeleting(option)}
                  className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive"
                  data-testid="list-option-remove"
                >
                  <X />
                </Button>
              )}
            </li>
          ))}
          {options.length === 0 && <li className="px-3 py-3 text-center text-[13px] text-muted-foreground">Nothing in this list yet.</li>}
        </ul>

        {canEdit && (
          <div className="flex items-center gap-2 border-t border-border/60 px-2.5 py-1.5">
            <Plus className="size-3.5 shrink-0 text-muted-foreground/60" />
            <input
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                add();
              }}
              maxLength={MAX_LIST_OPTION_NAME}
              placeholder={`Add to ${meta.label.toLowerCase()}`}
              aria-label={`Add to ${meta.label}`}
              className="h-7 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70"
              data-testid="list-add-input"
            />
            <Button type="button" size="sm" variant="secondary" className="h-7 shrink-0" disabled={!adding.trim()} onClick={add} data-testid="list-add-submit">
              Add
            </Button>
          </div>
        )}
      </div>

      <RemoveOptionDialog listKey={listKey} option={deleting} options={options} onClose={() => setDeleting(null)} />
    </section>
  );
}

/**
 * Taking a word out of a list when things already carry it. It says how many,
 * and either hands them to another option or leaves the word on them — never
 * silently blanks work that has already been done.
 */
function RemoveOptionDialog({ listKey, option, options, onClose }: { listKey: WorkspaceListKey; option: TagOption | null; options: TagOption[]; onClose: () => void }) {
  const ws = useWorkspace();
  const { remove } = useWorkspaceListMutations(ws.workspace.id);
  const usage = useListOptionUsage(ws.workspace.id, listKey, option?.name ?? null);
  const [replaceWith, setReplaceWith] = React.useState<string>(KEEP);
  // The dialog animates out after the option is gone, so it keeps the last one
  // to read from — and each option opens its own question, so the previous
  // answer must not carry over to it.
  const [shown, setShown] = React.useState<TagOption | null>(option);
  if (option && option.name !== shown?.name) {
    setShown(option);
    setReplaceWith(KEEP);
  }
  const others = options.filter((o) => o.name !== shown?.name);
  const count = usage.data?.count ?? 0;

  const confirm = () => {
    if (!shown) return;
    remove.mutate({ listKey, name: shown.name, options: replaceWith === KEEP ? {} : { replaceWith: replaceWith === "" ? null : replaceWith } });
    onClose();
  };

  return (
    <Dialog open={!!option} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="sm" data-testid="list-remove-dialog">
        <DialogHeader>
          <DialogTitle>Remove {shown?.name}?</DialogTitle>
          <DialogDescription>
            {usage.isLoading
              ? "Checking what still uses it…"
              : count === 0
                ? `Nothing uses ${shown?.name}, so it just leaves the list.`
                : `${count} ${usage.data?.noun} still ${count === 1 ? "carries" : "carry"} it.`}
          </DialogDescription>
        </DialogHeader>

        {count > 0 && (
          <div className="space-y-2">
            <p className="text-[13px] font-medium">What happens to {count === 1 ? "it" : "them"}?</p>
            <Select value={replaceWith} onValueChange={setReplaceWith}>
              <SelectTrigger data-testid="list-remove-replacement">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>Keep {shown?.name} on them</SelectItem>
                <SelectItem value="">Clear it</SelectItem>
                {others.map((other) => (
                  <SelectItem key={other.name} value={other.name}>
                    Move them to {other.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {replaceWith === KEEP && (
              <p className="text-2xs text-muted-foreground">
                They keep the word <LabelPill label={{ id: shown?.name ?? "", name: shown?.name ?? "", color: shown?.color ?? "gray" }} appearance="soft" size="sm" /> and the list stops offering it.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={usage.isLoading} data-testid="list-remove-confirm">
            <Trash2 /> Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
