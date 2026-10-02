"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import type { Doc, DocContent, DocPatch } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useDataContext, useServices } from "@/features/data/data-context";
import { deleteDocFile } from "@/features/docs/doc-files";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { queryKeys } from "@/lib/query/keys";
import { publishDataChange } from "@/lib/realtime/local-realtime";
import { useRealtime, type RealtimeBinding } from "@/lib/realtime/use-realtime";
import { beginUnsavedWork } from "@/lib/unsaved-work";
import type { CreateDocInput } from "@/services";

export function useDocs() {
  const services = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: queryKeys.docs(ws.workspace.id),
    queryFn: () => services.docs.list(ws.workspace.id),
    staleTime: 10_000,
  });
}

export function useDoc(docId: string | null) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.doc(docId ?? ""),
    queryFn: () => services.docs.get(docId!),
    enabled: !!docId,
    staleTime: 10_000,
  });
}

/**
 * Keeps an open doc in step with whoever else has it open. One doc only: a
 * page saves as the typing stops, and the sidebar's list rides on the
 * workspace channel instead.
 */
export function useDocRealtime(docId: string | null): void {
  const bindings = React.useMemo<RealtimeBinding[]>(() => (docId ? [{ table: "docs", filter: `id=eq.${docId}`, keys: [queryKeys.doc(docId), ["docs"]] }] : []), [docId]);
  useRealtime(docId ? `doc:${docId}` : null, bindings, { coalesceMs: 1_000, minIntervalMs: 4_000 });
}

export function useDocMutations() {
  const services = useServices();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const ws = useWorkspace();
  const { providerKind } = useDataContext();

  const settle = async () => {
    await queryClient.invalidateQueries({ queryKey: ["docs"] });
    void queryClient.invalidateQueries({ queryKey: ["doc"] });
    publishDataChange({ kinds: ["docs"] });
  };
  const fail = (title: string) => (error: unknown) => toast.error(title, { description: error instanceof Error ? error.message : undefined });

  const create = useMutation({
    mutationFn: (input: Omit<CreateDocInput, "workspaceId">) => services.docs.create({ ...input, workspaceId: ws.workspace.id }, user.id),
    onError: fail("Could not create the doc"),
    onSettled: settle,
  });
  const update = useMutation({
    mutationFn: ({ docId, patch }: { docId: string; patch: Omit<DocPatch, "updatedBy" | "content"> }) => services.docs.update(docId, patch, user.id),
    onError: fail("Could not update the doc"),
    onSettled: settle,
  });
  const remove = useMutation({
    mutationFn: async (doc: Pick<Doc, "id" | "filePath">) => {
      await services.docs.delete(doc.id);
      await deleteDocFile(providerKind, doc.filePath);
    },
    onSuccess: () => toast.success("Doc deleted"),
    onError: fail("Could not delete the doc"),
    onSettled: settle,
  });
  return { create, update, remove };
}

/**
 * Saving a page as it is written: shortly after the typing stops, holding the
 * leave-the-page guard while anything is unsaved, and finishing (not
 * dropping) a pending save when the page goes away.
 */
export function useDocSaver(docId: string) {
  const services = useServices();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const [state, setState] = React.useState<"idle" | "pending" | "saving" | "error">("idle");
  const timer = React.useRef<number | null>(null);
  const settled = React.useRef<(() => void) | null>(null);
  const flush = React.useRef<(() => void) | null>(null);
  /** True from the first keystroke until its save lands, so a remote copy does not replace what is being typed. */
  const dirty = React.useRef(false);

  const save = React.useCallback(
    (content: DocContent) => {
      dirty.current = true;
      if (timer.current) window.clearTimeout(timer.current);
      setState("pending");
      settled.current ??= beginUnsavedWork();
      const run = async () => {
        timer.current = null;
        flush.current = null;
        setState("saving");
        try {
          const saved = await services.docs.update(docId, { content }, user.id);
          dirty.current = timer.current !== null;
          queryClient.setQueryData(queryKeys.doc(docId), saved);
          void queryClient.invalidateQueries({ queryKey: ["docs"] });
          publishDataChange({ kinds: ["docs"] });
          setState(timer.current ? "pending" : "idle");
        } catch (error) {
          setState("error");
          toast.error("Could not save the doc", { description: error instanceof Error ? error.message : undefined });
        } finally {
          if (!timer.current) {
            settled.current?.();
            settled.current = null;
          }
        }
      };
      flush.current = () => {
        if (timer.current) window.clearTimeout(timer.current);
        void run();
      };
      timer.current = window.setTimeout(() => void run(), 800);
    },
    [services, queryClient, user.id, docId],
  );

  React.useEffect(() => () => flush.current?.(), []);

  return { save, state, dirty };
}
