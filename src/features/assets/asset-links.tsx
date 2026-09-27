"use client";

import { ArrowDown, ArrowUp, Check, Cloud, Copy, ExternalLink, Eye, FileCheck2, FileText, Folder, Image, Link2, MessageSquare, PenLine, Plus, Video, X, type LucideIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import type { MenuAction } from "@/components/layout/row-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AssetLink, AssetLinkIcon } from "@/domain";
import { ASSET_LINK_ICONS, ASSET_LINK_LABEL_MAX, ASSET_LINK_LIMIT, ASSET_LINK_PRESETS, ASSET_LINK_URL_MAX, assetLinkHref } from "@/domain";
import { newId } from "@/lib/ids";
import { cn } from "@/lib/utils";

export const LINK_ICON: Record<AssetLinkIcon, LucideIcon> = {
  eye: Eye,
  "file-check": FileCheck2,
  link: Link2,
  folder: Folder,
  image: Image,
  video: Video,
  "file-text": FileText,
  pen: PenLine,
  message: MessageSquare,
  cloud: Cloud,
};

const ICON_NAMES: Record<AssetLinkIcon, string> = {
  eye: "Preview",
  "file-check": "Final file",
  link: "Link",
  folder: "Folder",
  image: "Image",
  video: "Video",
  "file-text": "Document",
  pen: "Draft",
  message: "Feedback",
  cloud: "Cloud",
};

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Could not copy");
  }
}

/**
 * The links as menu entries: each one opens or copies, and with more than one
 * there is a way to copy the lot. On the row's "…" menu rather than on the row,
 * so a line with six links reads the same as a line with none.
 */
export function linkMenuActions(links: readonly AssetLink[]): MenuAction[] {
  if (links.length === 0) return [];
  const actions: MenuAction[] = [{ type: "label", label: "Links" }];
  for (const link of links) {
    const Icon = LINK_ICON[link.icon];
    const href = assetLinkHref(link.url);
    actions.push({
      type: "sub",
      label: link.label,
      icon: <Icon />,
      items: [
        ...(href ? [{ type: "item" as const, label: "Open", icon: <ExternalLink />, onSelect: () => window.open(href, "_blank", "noopener,noreferrer"), testId: "asset-link-open" }] : []),
        { type: "item", label: "Copy link", icon: <Copy />, onSelect: () => void copy(link.url, "Link"), testId: "asset-link-copy" },
      ],
    });
  }
  if (links.length > 1) {
    actions.push({ type: "item", label: "Copy all links", icon: <Copy />, onSelect: () => void copy(links.map((l) => `${l.label}: ${l.url}`).join("\n"), "Links"), testId: "asset-links-copy-all" });
  }
  return actions;
}

/** Links that say something: a url, trimmed, with a label to call it by. */
export function cleanDraftLinks(links: readonly AssetLink[]): AssetLink[] {
  return links
    .map((link) => ({ ...link, url: link.url.trim(), label: link.label.trim() || "Link" }))
    .filter((link) => link.url);
}

export function sameLinks(a: readonly AssetLink[], b: readonly AssetLink[]): boolean {
  return a.length === b.length && a.every((link, i) => link.id === b[i]!.id && link.label === b[i]!.label && link.url === b[i]!.url && link.icon === b[i]!.icon);
}

const iconButtonClass = "shrink-0 rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30";

/**
 * The open row's links: one line each — icon, label, address — moved up and
 * down with the arrows and taken off with the cross. Part of the row's draft,
 * so nothing is written until Update.
 */
export function LinksEditor({ links, canEdit, onChange }: { links: readonly AssetLink[]; canEdit: boolean; onChange: (links: AssetLink[]) => void }) {
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const set = (id: string, patch: Partial<AssetLink>) => onChange(links.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...links];
    const [link] = next.splice(index, 1);
    next.splice(index + by, 0, link!);
    onChange(next);
  };
  const add = (label: string, icon: AssetLinkIcon) => {
    const id = newId();
    setFocusId(id);
    onChange([...links, { id, label, url: "", icon }]);
  };

  if (!canEdit) {
    return (
      <ul className="grid gap-1" data-testid="asset-link-rows">
        {links.map((link) => {
          const Icon = LINK_ICON[link.icon];
          const href = assetLinkHref(link.url);
          return (
            <li key={link.id} className="flex min-w-0 items-center gap-1.5 text-xs" data-testid="asset-link-row">
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              {href ? (
                <a href={href} target="_blank" rel="noreferrer noopener" className="truncate font-medium text-emerald-600 hover:underline dark:text-emerald-400">
                  {link.label}
                </a>
              ) : (
                <span className="truncate">{link.label}</span>
              )}
              <button type="button" onClick={() => void copy(link.url, "Link")} aria-label={`Copy ${link.label}`} className={cn(iconButtonClass, "ml-auto")}>
                <Copy className="size-3" />
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  const presets = ASSET_LINK_PRESETS.filter((p) => !links.some((l) => l.label.trim().toLowerCase() === p.label.toLowerCase()));
  const full = links.length >= ASSET_LINK_LIMIT;

  return (
    <div className="grid gap-1.5" data-testid="asset-link-rows">
      {links.map((link, index) => (
        <div key={link.id} className="grid grid-cols-[auto_minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-1 @max-[28rem]/assets:grid-cols-[auto_minmax(0,1fr)_auto]" data-testid="asset-link-row">
          <IconPicker value={link.icon} onChange={(icon) => set(link.id, { icon })} />
          <input
            value={link.label}
            onChange={(e) => set(link.id, { label: e.target.value })}
            maxLength={ASSET_LINK_LABEL_MAX}
            placeholder="Label"
            aria-label="Link label"
            data-testid="asset-link-label"
            className="h-8 min-w-0 rounded-lg border border-border/70 bg-background px-2 text-xs outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring"
          />
          <input
            value={link.url}
            onChange={(e) => set(link.id, { url: e.target.value })}
            maxLength={ASSET_LINK_URL_MAX}
            placeholder="Paste a link…"
            aria-label={`${link.label || "Link"} address`}
            autoFocus={focusId === link.id}
            data-testid="asset-link-url"
            className="h-8 min-w-0 rounded-lg border border-border/70 bg-background px-2 text-xs outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring @max-[28rem]/assets:order-last @max-[28rem]/assets:col-span-3"
          />
          <span className="flex items-center">
            <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${link.label || "link"} up`} className={iconButtonClass} data-testid="asset-link-up">
              <ArrowUp className="size-3.5" />
            </button>
            <button type="button" onClick={() => move(index, 1)} disabled={index === links.length - 1} aria-label={`Move ${link.label || "link"} down`} className={iconButtonClass} data-testid="asset-link-down">
              <ArrowDown className="size-3.5" />
            </button>
            <button type="button" onClick={() => onChange(links.filter((l) => l.id !== link.id))} aria-label={`Remove ${link.label || "link"}`} className={cn(iconButtonClass, "hover:text-destructive")} data-testid="asset-link-remove">
              <X className="size-3.5" />
            </button>
          </span>
        </div>
      ))}
      {!full && (
        <div className="flex flex-wrap gap-1">
          {presets.map((preset) => {
            const Icon = LINK_ICON[preset.icon];
            return (
              <button key={preset.label} type="button" onClick={() => add(preset.label, preset.icon)} className={addChipClass} data-testid={`asset-link-add-${preset.icon}`}>
                <Plus className="size-3" /> <Icon className="size-3" /> {preset.label}
              </button>
            );
          })}
          <button type="button" onClick={() => add("", "link")} className={addChipClass} data-testid="asset-link-add">
            <Plus className="size-3" /> Link
          </button>
        </div>
      )}
    </div>
  );
}

const addChipClass = "flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-2xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-accent hover:text-foreground";

function IconPicker({ value, onChange }: { value: AssetLinkIcon; onChange: (icon: AssetLinkIcon) => void }) {
  const [open, setOpen] = React.useState(false);
  const Icon = LINK_ICON[value];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Icon: ${ICON_NAMES[value]}`} className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" data-testid="asset-link-icon">
          <Icon className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-1.5">
        <div className="grid grid-cols-5 gap-0.5">
          {ASSET_LINK_ICONS.map((name) => {
            const Option = LINK_ICON[name];
            const active = name === value;
            return (
              <button
                key={name}
                type="button"
                title={ICON_NAMES[name]}
                aria-label={ICON_NAMES[name]}
                aria-pressed={active}
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                }}
                className={cn("relative flex size-8 items-center justify-center rounded-md transition-colors hover:bg-accent", active && "bg-accent text-foreground")}
                data-testid={`asset-link-icon-${name}`}
              >
                <Option className="size-4" />
                {active && <Check className="absolute right-0.5 bottom-0.5 size-2.5 text-emerald-600 dark:text-emerald-400" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
