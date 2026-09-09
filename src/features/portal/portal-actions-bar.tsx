"use client";

import { ArrowLeft, ClipboardPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchBox } from "@/features/boards/components/board-toolbar";
import { PortalTotalsBar } from "@/features/portal/portal-totals";
import type { PortalTotals } from "@/domain";
import { useBoardUi, useBoardUiStore } from "@/stores/board-ui-store";

/**
 * The two things a stakeholder came for, above everything else.
 *
 * Searching is what a visitor does most, and the board's own box appears only
 * on the table view — so it is hoisted up here, where it is on every view and
 * on the booking form too. It is the board's own control (`SearchBox` writing
 * to the same store), not a copy: the same look, the same clear button, the
 * same Escape.
 *
 * Booking is what they came to *do*, so it is a button rather than a tab. A tab
 * says "another list of things to read"; this one asks for work.
 */
export function PortalActionsBar({
  boardId,
  totals,
  booking,
  onBook,
  onBackToTasks,
}: {
  boardId: string;
  totals: PortalTotals | null;
  /** True while the booking form is showing instead of the board. */
  booking: boolean;
  onBook: () => void;
  onBackToTasks: () => void;
}) {
  const ui = useBoardUi(boardId);
  const setSearch = useBoardUiStore((s) => s.setSearch);

  return (
    <div className="shrink-0 border-b border-border/70">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
        {/* Typing while the form is open is asking to look something up, so it
            puts the board back rather than filtering a page that is not there. */}
        <SearchBox
          value={ui.search}
          onChange={(value) => {
            setSearch(boardId, value);
            if (value && booking) onBackToTasks();
          }}
          className="w-full min-w-0 sm:w-72 md:w-80"
        />
        <div className="flex flex-1 items-center justify-end gap-2">
          {booking ? (
            <Button variant="outline" onClick={onBackToTasks} data-testid="portal-back-to-tasks">
              <ArrowLeft /> Our tasks
            </Button>
          ) : (
            <Button onClick={onBook} data-testid="portal-book-button">
              <ClipboardPen /> Book a task
            </Button>
          )}
        </div>
      </div>
      {totals && !booking && <PortalTotalsBar totals={totals} />}
    </div>
  );
}
