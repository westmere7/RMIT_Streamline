"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import type { CalendarKeyDate, CalendarKeyDateInput, CalendarKeyDatePatch, EntityId, ISODate, LeaveEntry, LeaveEntryInput, LeaveEntryPatch, WorkspaceHoliday, WorkspaceHolidayInput, WorkspaceHolidayPatch } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { useWorkspaceRowChecks } from "@/lib/realtime/in-workspace";
import { useRealtime, type RealtimeBinding } from "@/lib/realtime/use-realtime";

export const calendarKeys = {
  all: (ws: EntityId) => ["calendar", ws] as const,
  tasks: (ws: EntityId, from: ISODate, to: ISODate) => ["calendar", ws, "tasks", from, to] as const,
  columns: (ws: EntityId, boards: string) => ["calendar", ws, "columns", boards] as const,
  holidays: (ws: EntityId) => ["calendar", ws, "holidays"] as const,
  leave: (ws: EntityId) => ["calendar", ws, "leave"] as const,
  keyDates: (ws: EntityId) => ["calendar", ws, "key-dates"] as const,
  feed: (ws: EntityId, user: EntityId) => ["calendar", ws, "feed", user] as const,
};

const failed = (fallback: string) => (error: unknown) => toast.error(error instanceof Error ? error.message : fallback);

/** The dated tasks in [from, to]: one read, kept on screen while the next period loads. */
export function useCalendarTasks(workspaceId: EntityId, from: ISODate, to: ISODate, enabled = true) {
  const services = useServices();
  return useQuery({
    queryKey: calendarKeys.tasks(workspaceId, from, to),
    queryFn: () => services.calendar.listTasks(workspaceId, from, to),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled,
  });
}

/** Every visible board's columns, in one read, for reading the tasks' dates, status and people. */
export function useCalendarColumns(workspaceId: EntityId, boardIds: readonly EntityId[]) {
  const services = useServices();
  const key = React.useMemo(() => [...boardIds].sort().join(","), [boardIds]);
  return useQuery({
    queryKey: calendarKeys.columns(workspaceId, key),
    queryFn: () => services.repos.boards.listColumnsForBoards(boardIds),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    enabled: boardIds.length > 0,
  });
}

export function useHolidays(workspaceId: EntityId) {
  const services = useServices();
  return useQuery({ queryKey: calendarKeys.holidays(workspaceId), queryFn: () => services.calendar.listHolidays(workspaceId), staleTime: 60_000 });
}

export function useLeave(workspaceId: EntityId) {
  const services = useServices();
  return useQuery({ queryKey: calendarKeys.leave(workspaceId), queryFn: () => services.calendar.listLeave(workspaceId), staleTime: 30_000 });
}

export function useKeyDates(workspaceId: EntityId) {
  const services = useServices();
  return useQuery({ queryKey: calendarKeys.keyDates(workspaceId), queryFn: () => services.calendar.listKeyDates(workspaceId), staleTime: 60_000 });
}

/** Writes for holidays, leave and key dates; each refreshes what it changed. */
export function useCalendarMutations(workspaceId: EntityId) {
  const services = useServices();
  const qc = useQueryClient();
  const refresh = (key: readonly unknown[]) => () => qc.invalidateQueries({ queryKey: key });
  const holidays = calendarKeys.holidays(workspaceId);
  const leave = calendarKeys.leave(workspaceId);
  const keyDates = calendarKeys.keyDates(workspaceId);

  const createHoliday = useMutation({ mutationFn: (input: WorkspaceHolidayInput) => services.calendar.createHoliday(input), onError: failed("Could not add the holiday"), onSettled: refresh(holidays) });
  const updateHoliday = useMutation({ mutationFn: (a: { current: WorkspaceHoliday; patch: WorkspaceHolidayPatch }) => services.calendar.updateHoliday(a.current.id, a.patch, a.current), onError: failed("Could not change the holiday"), onSettled: refresh(holidays) });
  const deleteHoliday = useMutation({ mutationFn: (id: EntityId) => services.calendar.deleteHoliday(id), onError: failed("Could not remove the holiday"), onSettled: refresh(holidays) });
  const addVietnamYear = useMutation({
    mutationFn: (year: number) => services.calendar.addVietnamYear(workspaceId, year),
    onSuccess: (n, year) => toast.success(n ? `Added ${n} ${n === 1 ? "holiday" : "holidays"} for ${year}` : `${year} is already in`),
    onError: failed("Could not add the holidays"),
    onSettled: refresh(holidays),
  });
  const copyYear = useMutation({
    mutationFn: (fromYear: number) => services.calendar.copyYearForward(workspaceId, fromYear),
    onSuccess: (r, fromYear) => toast.success(`Copied ${r.copied} to ${fromYear + 1}${r.lunar.length ? `. Add ${r.lunar.join(", ")} by hand: lunar dates move.` : ""}`),
    onError: failed("Could not copy the year"),
    onSettled: refresh(holidays),
  });

  const createLeave = useMutation({ mutationFn: (input: LeaveEntryInput) => services.calendar.createLeave(input), onError: failed("Could not add the leave"), onSettled: refresh(leave) });
  const updateLeave = useMutation({ mutationFn: (a: { current: LeaveEntry; patch: LeaveEntryPatch }) => services.calendar.updateLeave(a.current.id, a.patch, a.current), onError: failed("Could not change the leave"), onSettled: refresh(leave) });
  const deleteLeave = useMutation({ mutationFn: (id: EntityId) => services.calendar.deleteLeave(id), onError: failed("Could not remove the leave"), onSettled: refresh(leave) });

  const createKeyDate = useMutation({ mutationFn: (input: CalendarKeyDateInput) => services.calendar.createKeyDate(input), onError: failed("Could not add the key date"), onSettled: refresh(keyDates) });
  const updateKeyDate = useMutation({ mutationFn: (a: { current: CalendarKeyDate; patch: CalendarKeyDatePatch }) => services.calendar.updateKeyDate(a.current.id, a.patch, a.current), onError: failed("Could not change the key date"), onSettled: refresh(keyDates) });
  const deleteKeyDate = useMutation({ mutationFn: (id: EntityId) => services.calendar.deleteKeyDate(id), onError: failed("Could not remove the key date"), onSettled: refresh(keyDates) });

  return { createHoliday, updateHoliday, deleteHoliday, addVietnamYear, copyYear, createLeave, updateLeave, deleteLeave, createKeyDate, updateKeyDate, deleteKeyDate };
}

/** The reader's private feed address and the ways to change it. */
export function useCalendarFeed(workspaceId: EntityId, userId: EntityId, enabled: boolean) {
  const services = useServices();
  const qc = useQueryClient();
  const key = calendarKeys.feed(workspaceId, userId);
  const feed = useQuery({ queryKey: key, queryFn: () => services.calendar.getFeed(workspaceId, userId), enabled });
  const set = (next: unknown) => qc.setQueryData(key, next);
  const create = useMutation({ mutationFn: () => services.calendar.getOrCreateFeed(workspaceId, userId), onSuccess: set, onError: failed("Could not make the feed") });
  const replace = useMutation({ mutationFn: () => services.calendar.replaceFeed(workspaceId, userId), onSuccess: (f) => (set(f), toast.success("New address ready. The old one has stopped.")), onError: failed("Could not make a new address") });
  const stop = useMutation({ mutationFn: () => services.calendar.stopFeed(workspaceId, userId), onSuccess: () => (set(null), toast.success("Feed stopped")), onError: failed("Could not stop the feed") });
  return { feed, create, replace, stop };
}

/**
 * Keeps the Calendar current: holidays, leave and key dates straight away, the
 * tasks once a burst of board edits has settled.
 */
export function useCalendarRealtime(workspaceId: EntityId) {
  const checks = useWorkspaceRowChecks();
  const own = React.useMemo<RealtimeBinding[]>(() => {
    const ws = `workspace_id=eq.${workspaceId}`;
    return [
      { table: "workspace_holidays", filter: ws, keys: [calendarKeys.holidays(workspaceId)] },
      { table: "leave_entries", filter: ws, keys: [calendarKeys.leave(workspaceId)] },
      { table: "calendar_key_dates", filter: ws, keys: [calendarKeys.keyDates(workspaceId)] },
    ];
  }, [workspaceId]);
  const boards = React.useMemo<RealtimeBinding[]>(() => {
    const tasks = [[...calendarKeys.all(workspaceId), "tasks"]];
    return [
      { table: "items", keys: tasks, accept: checks.onBoard },
      { table: "item_column_values", keys: tasks, accept: checks.onBoard },
      { table: "item_assets", keys: tasks, accept: checks.onBoard },
      { table: "board_columns", keys: [[...calendarKeys.all(workspaceId), "columns"]], accept: checks.onBoard },
    ];
  }, [workspaceId, checks]);
  // Their writes bump the workspace revision (0162), so a catch-up is one probe, not three reads.
  useRealtime(`calendar:${workspaceId}`, own, { coalesceMs: 400, catchUp: { workspaceId } });
  // Board edits come in bursts; the tasks are read again once one settles.
  // A year of tasks is a large read (about a megabyte on a busy workspace): at most every 30 s.
  useRealtime(`calendar-tasks:${workspaceId}`, boards, { coalesceMs: 2_000, minIntervalMs: 30_000, catchUp: { workspaceId } });
}
