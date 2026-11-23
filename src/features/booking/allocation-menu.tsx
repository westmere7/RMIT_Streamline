"use client";

import { ArrowDownToLine, Rows3, SquareKanban } from "lucide-react";
import type { MenuAction } from "@/components/layout/row-menu";
import type { Board } from "@/domain";
import type { TargetGroups } from "@/features/booking/use-allocation";

/**
 * One board to allocate to, as a menu entry. With more than one group it opens
 * them — the landing group first, marked — so the request can land in a
 * particular one; with one group (or before the groups are read) it is the
 * board alone, and the request lands in its landing group.
 */
export function allocationTargetAction(target: Board, groups: TargetGroups | null, send: (groupId: string | null) => void, testId?: string): MenuAction {
  if (!groups || groups.groups.length <= 1) {
    return { type: "item", label: target.name, icon: <SquareKanban />, onSelect: () => send(null), testId };
  }
  const ordered = [...groups.groups].sort((a, b) => (a.id === groups.landingId ? -1 : b.id === groups.landingId ? 1 : a.position - b.position));
  return {
    type: "sub",
    label: target.name,
    icon: <SquareKanban />,
    items: ordered.map((group) => ({
      type: "item" as const,
      label: group.name,
      icon: group.id === groups.landingId ? <ArrowDownToLine /> : <Rows3 />,
      hint: group.id === groups.landingId ? "Landing" : undefined,
      onSelect: () => send(group.id),
      testId: testId ? `${testId}-group-${group.id}` : undefined,
    })),
  };
}
