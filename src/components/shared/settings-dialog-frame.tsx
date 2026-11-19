"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The frame board and team settings share: a title over a column of tabs and
 * the chosen tab's content, which scrolls on its own. Closing it is choosing
 * no tab.
 */
export function SettingsDialogFrame<S extends string>({
  title,
  description,
  sections,
  section,
  onSectionChange,
  testId,
  children,
}: {
  title: string;
  description: React.ReactNode;
  sections: ReadonlyArray<{ id: S; label: string; danger?: boolean }>;
  section: S | null;
  onSectionChange: (section: S | null) => void;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={section !== null} onOpenChange={(next) => !next && onSectionChange(null)}>
      <DialogContent size="lg" className="max-h-[85vh] gap-0 overflow-hidden p-0" data-testid={testId}>
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-[420px]">
          <nav className="w-40 shrink-0 border-r p-2" aria-label="Settings sections">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSectionChange(s.id)}
                aria-current={section === s.id ? "page" : undefined}
                className={cn(
                  "flex h-8 w-full items-center rounded-md px-2 text-[13px] font-medium",
                  section === s.id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
                  s.danger && "text-destructive",
                )}
                data-testid={`settings-tab-${s.id}`}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <div className="scrollbar-thin max-h-[calc(85vh-80px)] flex-1 overflow-y-auto p-5">{children}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
