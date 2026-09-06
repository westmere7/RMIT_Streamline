"use client";

import { ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Item } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { useDataContext } from "@/features/data/data-context";
import { CoverError, deleteCoverFile, uploadCover } from "@/features/items/cover-upload";
import { cn } from "@/lib/utils";

/**
 * The item's cover image, with add / replace / remove. Shown at the top of the
 * details panel (editable) and on kanban cards (image only). The file is
 * re-encoded as WebP on the client and capped at 3MB before upload.
 */
export function ItemCover({ item, canEdit }: { item: Item; canEdit: boolean }) {
  const { mutations } = useBoardContext();
  const { providerKind } = useDataContext();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState<"upload" | "remove" | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy("upload");
    try {
      const { url } = await uploadCover(providerKind, item.id, file);
      await mutations.setCover(item.id, url);
    } catch (error) {
      toast.error(error instanceof CoverError ? error.message : "Could not save the cover");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    setBusy("remove");
    try {
      await mutations.setCover(item.id, null);
      await deleteCoverFile(providerKind, item.id);
    } finally {
      setBusy(null);
    }
  };

  const input = canEdit ? <input ref={inputRef} type="file" accept="image/*" hidden aria-label="Choose a cover image" onChange={(e) => void pick(e.target.files?.[0])} data-testid="cover-input" /> : null;

  if (!item.coverUrl) {
    if (!canEdit) return null;
    return (
      <div className="px-3 pt-3">
        {input}
        {/* Just the icon at rest; the words slide out on hover so the header stays quiet. */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== null}
          aria-label="Add a cover image (WebP, up to 3MB)"
          className="group/add flex h-8 items-center gap-0 rounded-lg px-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
          data-testid="cover-add"
        >
          {busy ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <ImagePlus className="size-4 shrink-0" />}
          <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity,margin] duration-200 group-hover/add:ml-2 group-hover/add:max-w-xs group-hover/add:opacity-100 group-focus-visible/add:ml-2 group-focus-visible/add:max-w-xs group-focus-visible/add:opacity-100">
            Add a cover image <span className="text-2xs text-muted-foreground/70">· WebP, up to 3MB</span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="group/cover relative" data-testid="item-cover">
      {input}
      {/* Capped at a band across the top: never more than a quarter of the screen, whatever the picture's shape. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- covers are user uploads at arbitrary sizes and hosts */}
      <img src={item.coverUrl} alt="" className={cn("block h-40 max-h-[26vh] w-full object-cover transition-opacity", busy && "opacity-60")} />
      {canEdit && (
        <div className="absolute right-3 bottom-3 flex gap-1 opacity-0 transition-opacity group-hover/cover:opacity-100 focus-within:opacity-100">
          <Button type="button" size="sm" variant="secondary" className="h-7 bg-background/90 shadow-sm backdrop-blur" disabled={busy !== null} onClick={() => inputRef.current?.click()} data-testid="cover-replace">
            {busy === "upload" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Replace
          </Button>
          <Button type="button" size="sm" variant="secondary" className="h-7 bg-background/90 shadow-sm backdrop-blur hover:text-destructive" disabled={busy !== null} onClick={() => void remove()} data-testid="cover-remove">
            {busy === "remove" ? <Loader2 className="animate-spin" /> : <Trash2 />} Remove
          </Button>
        </div>
      )}
    </div>
  );
}

/** The cover as it appears on a kanban card: image only, nothing to click. */
export function CardCover({ url }: { url: string | null | undefined }) {
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element -- user upload
  return <img src={url} alt="" className="-mx-3 -mt-3 mb-2.5 block h-28 w-[calc(100%+1.5rem)] max-w-none rounded-t-xl object-cover" data-testid="card-cover" />;
}
