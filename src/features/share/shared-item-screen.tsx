"use client";

import { CalendarClock, Eye } from "lucide-react";
import * as React from "react";
import { BrandMark } from "@/features/auth/components/auth-shell";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { ErrorState } from "@/components/shared/error-state";
import { FullPageLoader } from "@/components/layout/full-page-loader";
import { Badge } from "@/components/ui/badge";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { PublicItemPayload } from "@/domain";
import { BoardContextProvider, type BoardContextValue } from "@/features/boards/board-context";
import { buildBoardModel } from "@/features/boards/board-model";
import { useBoardMutations } from "@/features/boards/hooks/use-board-mutations";
import { useBoardSnapshot } from "@/features/boards/hooks/use-board-snapshot";
import { useBoardUpdates } from "@/features/comments/updates";
import { EMPTY_FILTERS } from "@/stores/board-ui-store";
import { ItemDetailPanel } from "@/features/items/item-detail-panel";
import { colorClasses } from "@/lib/colors";
import { formatShortDate } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";

/**
 * One shared task as a visitor sees it.
 *
 * The item panel the workspace uses, on data that came down one link and with
 * editing off — the board context says so, the same switch the app uses for a
 * board somebody may read but not change. There is no board around it, because
 * the payload holds only this task: nothing to click through to.
 */
export function SharedItemScreen({ payload }: { payload: PublicItemPayload }) {
  const board = payload.board;
  const snapshot = useBoardSnapshot(board.id);
  const mutations = useBoardMutations(board.id);
  const [now] = React.useState(() => new Date());

  const model = React.useMemo(
    () => (snapshot.data ? buildBoardModel(snapshot.data, { search: "", filters: EMPTY_FILTERS, sort: null, now, userName: (id) => payload.users.find((u) => u.id === id)?.displayName }) : null),
    [snapshot.data, now, payload.users],
  );
  const itemIds = React.useMemo(() => payload.items.map((i) => i.id), [payload.items]);
  const updates = useBoardUpdates(board.id, itemIds);

  const contextValue = React.useMemo<BoardContextValue | null>(
    () =>
      model
        ? {
            board,
            model,
            mutations,
            users: payload.users,
            canEdit: false,
            canManage: false,
            // There is nowhere else to go: the link opens this task and nothing more.
            openItem: () => undefined,
            openItemUpdates: () => undefined,
            openEditLabels: () => undefined,
            now,
            showReference: true,
            setShowReference: () => undefined,
            updates,
          }
        : null,
    [board, model, mutations, payload.users, now, updates],
  );

  if (!contextValue && !snapshot.isError) return <FullPageLoader label="Opening the shared task…" />;

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-canvas" data-testid="shared-item">
      <SharedItemHeader payload={payload} />
      {snapshot.isError && <ErrorState title="Something went wrong while opening this task." error={snapshot.error} onRetry={() => snapshot.refetch()} />}
      {contextValue && (
        <BoardContextProvider value={contextValue}>
          {/* The panel is the page here, so it fills the width instead of sitting beside a board. */}
          <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col p-2.5 sm:p-4">
            <ItemDetailPanel itemId={payload.itemId} onClose={() => undefined} shared />
          </div>
        </BoardContextProvider>
      )}
    </div>
  );
}

/** Says which board the task came from, and that nothing here can be changed. */
function SharedItemHeader({ payload }: { payload: PublicItemPayload }) {
  const board = payload.board;
  return (
    <header className="relative flex shrink-0 items-center gap-3.5 border-b border-border/60 px-5 py-3.5 sm:px-7">
      <span
        aria-hidden
        className={cn("pointer-events-none absolute inset-x-0 top-0 h-20 opacity-[0.10]", colorClasses(board.color).dot)}
        style={{ maskImage: "linear-gradient(to bottom, black, transparent)", WebkitMaskImage: "linear-gradient(to bottom, black, transparent)" }}
      />
      <span className={cn("relative hidden size-9 shrink-0 items-center justify-center rounded-xl shadow-xs sm:flex", colorClasses(board.color).solid)}>
        <DynamicIcon name={board.icon} className="size-4.5" />
      </span>
      <div className="relative min-w-0 flex-1">
        <h1 className="flex min-w-0 items-center gap-2 text-[17px] font-semibold tracking-tight">
          <span className="truncate">{board.name}</span>
          <Badge variant="outline" className="shrink-0 gap-1" data-testid="share-view-only">
            <Eye className="size-3" /> View only
          </Badge>
        </h1>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{payload.workspaceName}</p>
      </div>
      {payload.expiresAt && (
        <SimpleTooltip label="After this day the link stops working.">
          <span className="relative hidden items-center gap-1.5 rounded-full border border-border/60 bg-surface/60 px-2.5 py-1 text-2xs text-muted-foreground sm:flex" data-testid="share-expiry">
            <CalendarClock className="size-3.5" /> Until {formatShortDate(payload.expiresAt)}
          </span>
        </SimpleTooltip>
      )}
      <span className="relative flex items-center gap-2 pl-1">
        <BrandMark className="size-8 rounded-lg" />
      </span>
    </header>
  );
}
