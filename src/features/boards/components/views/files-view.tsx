"use client";

import { FileText, Paperclip } from "lucide-react";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { RelativeTime } from "@/components/shared/relative-time";
import { UserAvatar } from "@/components/shared/user-avatar";
import type { AttachmentMeta } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { useWorkspace } from "@/features/workspace/workspace-context";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilesView() {
  const { model, openItem } = useBoardContext();
  const ws = useWorkspace();
  const rows: Array<{ file: AttachmentMeta; itemId: string; itemName: string }> = [];
  for (const v of model.snapshot.values) {
    if (v.value.type !== "FILES") continue;
    const item = model.itemById.get(v.itemId);
    if (!item) continue;
    for (const file of v.value.files) rows.push({ file, itemId: item.id, itemName: item.name });
  }
  rows.sort((a, b) => b.file.uploadedAt.localeCompare(a.file.uploadedAt));

  if (!model.columns.some((c) => c.type === "FILES")) {
    return <EmptyState icon={Paperclip} title="No Files column on this board" description="Add a Files column to attach files to items and see them all here." />;
  }
  if (rows.length === 0) {
    return <EmptyState icon={Paperclip} title="No files yet" description="Attach files from an item's detail panel." />;
  }
  return (
    <div className="scrollbar-thin flex-1 overflow-auto p-4" data-testid="files-view">
      <table className="w-full min-w-[640px] text-[13px]">
        <thead className="text-left text-2xs text-muted-foreground">
          <tr className="h-8 border-b">
            <th className="px-2 font-medium">File</th>
            <th className="px-2 font-medium">Item</th>
            <th className="px-2 font-medium">Size</th>
            <th className="px-2 font-medium">Uploaded by</th>
            <th className="px-2 font-medium">When</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map(({ file, itemId, itemName }) => (
            <tr key={file.id} className="h-10 hover:bg-accent/50">
              <td className="px-2">
                <span className="flex items-center gap-2">
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="truncate font-medium">{file.filename}</span>
                </span>
              </td>
              <td className="px-2">
                <button type="button" onClick={() => openItem(itemId)} className="truncate hover:underline">
                  {itemName}
                </button>
              </td>
              <td className="px-2 text-muted-foreground tabular">{formatBytes(file.size)}</td>
              <td className="px-2">
                <span className="flex items-center gap-1.5">
                  <UserAvatar user={ws.userById(file.uploadedBy)} size="xs" tooltip={false} />
                  {ws.userById(file.uploadedBy)?.firstName ?? "Unknown"}
                </span>
              </td>
              <td className="px-2 text-muted-foreground">
                <RelativeTime iso={file.uploadedAt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
