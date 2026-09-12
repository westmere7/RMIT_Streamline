"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BookingBlock, BookingFormTemplate, BookingSavedBlock, BookingTemplate } from "@/domain";
import { BookingFormEditor } from "@/features/booking/editor/booking-form-editor";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canManageWorkspace, canSeeSystemEntities } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { PortalAdmin } from "@/features/portal/portal-admin";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * The Stakeholder Portal destination, at the URL "Book a task" always had.
 *
 * For a manager this is where the portal and the form are shaped: the portal's
 * links and settings on one tab, the form editor on the other. Booking itself
 * happens on the one booking page (/book/<slug>), the same page a stakeholder's
 * link opens, so the form is never embedded here as a second copy. A member
 * with nothing to manage is sent straight on to that page.
 */
export function BookTaskPage() {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();
  const router = useRouter();
  const admin = canSeeSystemEntities(ws.permissions);
  const manager = canManageWorkspace(ws.permissions);
  const [tab, setTab] = React.useState<"portals" | "book">("portals");
  // Where the editor hangs its controls: the top of the aside, so the card holds the form alone.
  const [editorPanel, setEditorPanel] = React.useState<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!manager) router.replace(routes.bookForm(ws.slug));
  }, [manager, router, ws.slug]);

  const form = useQuery({
    queryKey: queryKeys.bookingForm(ws.slug, null),
    queryFn: () => services.booking.getForm({ workspaceSlug: ws.slug, key: null }),
    staleTime: 60_000,
    enabled: manager,
  });
  const templates = useQuery({
    queryKey: queryKeys.bookingTemplates(ws.workspace.id),
    queryFn: () => services.booking.listTemplates(ws.workspace.id),
    enabled: manager,
  });
  const savedBlocks = useQuery({
    queryKey: queryKeys.bookingSavedBlocks(ws.workspace.id),
    queryFn: () => services.booking.listSavedBlocks(ws.workspace.id),
    enabled: manager,
  });
  // What the editor opens on. Separate from the form above because they are
  // separate things: that one is what stakeholders are being served, this one
  // is what somebody is part-way through building.
  const draft = useQuery({
    queryKey: queryKeys.bookingDraft(ws.workspace.id),
    queryFn: () => services.booking.getDraft(ws.workspace.id),
    enabled: manager,
    staleTime: 60_000,
  });

  // The published form is read by every booking page of the workspace, public
  // link included; the draft by nobody but this page.
  const draftChanged = () => queryClient.invalidateQueries({ queryKey: queryKeys.bookingDraft(ws.workspace.id) });
  const formChanged = async () => {
    await queryClient.invalidateQueries({ queryKey: ["booking-form", ws.slug] });
    await draftChanged();
    await ws.refresh();
  };
  const saveDraft = useMutation({
    mutationFn: (template: BookingFormTemplate) => services.booking.saveDraft(ws.workspace.id, template),
    onSuccess: draftChanged,
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save the draft"),
  });
  const publishForm = useMutation({
    mutationFn: (template: BookingFormTemplate) => services.booking.publishForm(ws.workspace.id, template),
    onSuccess: async () => {
      await formChanged();
      toast.success("Form published", { description: "Everyone sees the new form from now on." });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not publish the form"),
  });
  const discardDraft = async () => {
    await services.booking.discardDraft(ws.workspace.id);
    await draftChanged();
  };
  const templatesChanged = () => queryClient.invalidateQueries({ queryKey: queryKeys.bookingTemplates(ws.workspace.id) });
  const saveTemplate = async (input: { name: string; description: string | null; template: BookingFormTemplate }) => {
    await services.booking.saveTemplate(ws.workspace.id, input, ws.currentUser.id);
    await templatesChanged();
  };
  const deleteTemplate = async (template: BookingTemplate) => {
    await services.booking.deleteTemplate(template.id);
    await templatesChanged();
  };
  const savedBlocksChanged = () => queryClient.invalidateQueries({ queryKey: queryKeys.bookingSavedBlocks(ws.workspace.id) });
  const saveBlock = async (input: { name: string; block: BookingBlock }) => {
    await services.booking.saveBlock(ws.workspace.id, input, ws.currentUser.id);
    await savedBlocksChanged();
  };
  const deleteSavedBlock = async (saved: BookingSavedBlock) => {
    await services.booking.deleteSavedBlock(saved.id);
    await savedBlocksChanged();
  };

  if (!manager) {
    return (
      <div className="flex h-full flex-1 items-center justify-center gap-2 text-[13px] text-muted-foreground" role="status" data-testid="booking-redirect">
        <LoaderCircle className="size-4 animate-spin" /> Opening the booking form…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* The form is a fixed reading width, so the page is one centred column
          rather than a card pinned left and an aside pinned right with a hole
          between them. The header shares the column, and its button lines up
          with the aside's right edge. */}
      <div className="mx-auto w-full max-w-[66rem] shrink-0">
        <PageHeader
          title="Stakeholder Portal"
          // Held to a reading width: at full width the line pushes the button onto one of its own.
          description={
            <span className="block max-w-[44rem]">
              {tab === "portals"
                ? "One link for every stakeholder. They pick whose work to look at once they are in, and book new work from the same place."
                : "Shape the form everybody books through. Save as you go; nothing changes for anyone until you publish."}
            </span>
          }
          actions={
            <Button type="button" variant={tab === "book" ? "outline" : "default"} asChild>
              <a href={routes.bookForm(ws.slug)} target="_blank" rel="noreferrer noopener" data-testid="booking-open-form">
                <ExternalLink /> Open the form
              </a>
            </Button>
          }
        />
        <div role="tablist" aria-label="Stakeholder Portal" className="mb-4 flex items-end gap-0.5 border-b border-border/70 px-4 sm:px-7">
          {(
            [
              ["portals", "Portal"],
              ["book", "Form Editor"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "relative -mb-px inline-flex h-10 items-center rounded-t-lg px-3 text-[13px] font-medium transition-colors after:absolute after:inset-x-2 after:-bottom-px after:h-[2.5px] after:rounded-full after:bg-transparent max-md:h-12",
                tab === id ? "text-foreground after:bg-ring" : "text-muted-foreground hover:text-foreground",
              )}
              data-testid={`portal-tab-${id}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "portals" && (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-7">
          <div className="mx-auto w-full max-w-[66rem]">
            <PortalAdmin />
          </div>
        </div>
      )}
      {/* On a desktop the editor card scrolls by itself under the header; on a phone the whole page scrolls. */}
      <div className={cn("scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-7 lg:overflow-visible", tab !== "book" && "hidden")}>
        <div className="mx-auto grid w-full max-w-[66rem] gap-6 lg:h-full lg:grid-cols-[minmax(0,44rem)_minmax(16rem,20rem)]">
          <section className="scrollbar-thin w-full rounded-2xl border border-border bg-card p-5 shadow-lg ring-1 ring-ring/15 sm:p-7 lg:min-h-0 lg:overflow-y-auto" data-testid="book-task-card">
            {form.isLoading || draft.isLoading ? (
              <div className="flex items-center gap-2 py-10 text-[13px] text-muted-foreground" role="status">
                <LoaderCircle className="size-4 animate-spin" /> Opening the editor…
              </div>
            ) : form.isError || !form.data ? (
              <ErrorState title="Could not load the booking form." error={form.error} onRetry={() => form.refetch()} />
            ) : (
              <BookingFormEditor
                form={form.data}
                live={form.data.template}
                initial={draft.data ?? form.data.template}
                templates={templates.data ?? []}
                savedBlocks={savedBlocks.data ?? []}
                savingDraft={saveDraft.isPending}
                publishing={publishForm.isPending}
                onSaveDraft={(template) => saveDraft.mutateAsync(template).then(() => undefined)}
                onPublish={(template) => publishForm.mutateAsync(template).then(() => undefined)}
                onDiscardDraft={discardDraft}
                onSaveTemplate={saveTemplate}
                onDeleteTemplate={deleteTemplate}
                onSaveBlock={saveBlock}
                onDeleteSavedBlock={deleteSavedBlock}
                panelContainer={editorPanel}
              />
            )}
          </section>
          {admin && <AdminAside editorSlot={setEditorPanel} />}
        </div>
      </div>
    </div>
  );
}

/** The public link and where bookings arrive: admins only. */
function AdminAside({ editorSlot }: { editorSlot: (node: HTMLDivElement | null) => void }) {
  const ws = useWorkspace();
  const services = useServices();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const key = ws.workspace.bookingKey ?? null;
  // The origin is only known in the browser; until hydration the path alone is shown.
  const origin = React.useSyncExternalStore(subscribeNever, () => window.location.origin, () => "");
  const publicUrl = key ? `${origin}${routes.publicBooking(ws.slug, key)}` : "";
  const allocation = ws.boards.find((b) => b.system === "TASK_ALLOCATION");

  const regenerate = useMutation({
    mutationFn: () => services.workspace.regenerateBookingKey(ws.workspace.id),
    onSuccess: async () => {
      await ws.refresh();
      toast.success("New booking link ready", { description: "The previous link no longer works." });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not replace the link"),
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  };

  return (
    <aside className="scrollbar-thin space-y-4 lg:min-h-0 lg:overflow-y-auto">
      <div ref={editorSlot} />
      <section className="rounded-2xl border border-border/60 bg-surface/40 p-5" data-testid="booking-share">
        <h2 className="text-[15px] font-semibold tracking-tight">Share with stakeholders</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">Anyone with this link can book a task without an account. Send it by email or put it on the intranet.</p>
        <div className="mt-3 flex gap-1.5">
          <Input readOnly value={publicUrl} aria-label="Public booking link" onFocus={(e) => e.currentTarget.select()} className="h-9 text-xs" data-testid="booking-public-link" />
          <Button type="button" variant="outline" size="icon-sm" className="size-9 shrink-0" aria-label="Copy booking link" onClick={() => void copy()} disabled={!publicUrl} data-testid="booking-copy-link">
            {copied ? <Check className="text-green-600" /> : <Copy />}
          </Button>
        </div>
        <Button type="button" variant="ghost" size="sm" className="mt-2 text-muted-foreground" onClick={() => setConfirmOpen(true)} disabled={regenerate.isPending} data-testid="booking-regenerate">
          <RefreshCw className={regenerate.isPending ? "animate-spin" : undefined} /> Replace the link
        </Button>
      </section>
      <section className="rounded-2xl border border-border/60 bg-surface/40 p-5">
        <h2 className="text-[15px] font-semibold tracking-tight">Where bookings land</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Every booking arrives on <span className="font-medium text-foreground">{allocation?.name ?? "Task Allocation"}</span> unless the chosen team has picked one of its boards to receive them (Team settings → Bookings land on).
        </p>
        {allocation && (
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href={ws.boardPath(allocation)} data-testid="booking-open-allocation">
              <ExternalLink /> Open {allocation.name}
            </Link>
          </Button>
        )}
      </section>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Replace the booking link?"
        description="Everyone holding the current link loses access to the form. Send the new one out afterwards."
        confirmLabel="Replace link"
        onConfirm={() => regenerate.mutateAsync().then(() => undefined)}
      />
    </aside>
  );
}

function subscribeNever(): () => void {
  return () => {};
}
