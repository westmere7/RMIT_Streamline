"use client";

import * as React from "react";
import type { TrackerSheet } from "@/domain";
import { useSheetEditor } from "@/features/trackers/hooks";

type SheetEditor = ReturnType<typeof useSheetEditor>;

const SheetEditorContext = React.createContext<SheetEditor | null>(null);

/**
 * Owns the editing state of one sheet. Mount it with `key={sheet.id}` so a sheet
 * switch starts a fresh editor (empty undo history, no pending save) instead of
 * the hook having to notice the change itself.
 */
export function SheetEditorProvider({ sheet, canEdit, children }: { sheet: TrackerSheet | undefined; canEdit: boolean; children: React.ReactNode }) {
  const editor = useSheetEditor(sheet, canEdit);
  return <SheetEditorContext.Provider value={editor}>{children}</SheetEditorContext.Provider>;
}

export function useSheetEditorContext(): SheetEditor {
  const ctx = React.useContext(SheetEditorContext);
  if (!ctx) throw new Error("useSheetEditorContext must be used inside SheetEditorProvider");
  return ctx;
}
