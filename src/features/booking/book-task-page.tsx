"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Copy, ExternalLink, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import type { BookingBlock, BookingFormTemplate, BookingSavedBlock, BookingTemplate } from "@/domain";
import { BookingFormEditor } from "@/features/booking/editor/booking-form-editor";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { canManageWorkspace, canSeeSystemEntities } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { publishDataChange } from "@/lib/realtime/local-realtime";
import { useRealtime, type RealtimeBinding } from "@/lib/realtime/use-realtime";
import { hasUnsavedWork } from "@/lib/unsaved-work";
import { PortalAdmin } from "@/features/portal/portal-admin";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * The Portal and Booking destination, at the URL "Book a task" always had.
 *
 * For a manager this is where the portal and the form are shaped. `links` (the
 * page itself) shows both links side by side, each card holding its own
 * settings; `editor` (/book/form, from the Booking form card) is the form's
 * questions. Booking itself happens on the one booking page (/book/<slug>), the
 * same page a stakeholder's link opens, so the form is never embedded here as a
 * second copy. A member with nothing to manage is sent straight on to that page.
 */
export function BookTaskPage({ view = "links" }: { view?: "links" | "editor" }) {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();
  const router = useRouter();
  const admin = canSeeSystemEntities(ws.permissions);
  const manager = canManageWorkspace(ws.permissions);
  const tab = view === "editor" ? "book" : "portals";
  // Where the editor hangs its controls: the top of the aside, so the card holds the form alone.
  const [editorPanel, setEditorPanel] = React.useState<HTMLDivElement | null>(null);
  // A phone stacks the aside under the whole form, so there the panel stays
  // at the top of the card, where saving and publishing are in reach.
  const isMobile = useIsMobile();

  React.useEffect(() => {
    if (!manager) router.replace(routes.bookForm(ws.slug));
  }, [manager, router, ws.slug]);

  // What another admin changes while this page is open: a form published, a
  // template saved, a block added. The draft is deliberately not on this list —
  // it is what somebody is part-way through building, and replacing it under
  // their cursor because the row was touched would lose their work.
  const bookingBindings = React.useMemo<RealtimeBinding[]>(
    () => [
      { table: "workspaces", filter: `id=eq.${ws.workspace.id}`, keys: [["booking-form", ws.slug]] },
      { table: "booking_templates", filter: `workspace_id=eq.${ws.workspace.id}`, keys: [queryKeys.bookingTemplates(ws.workspace.id)] },
      { table: "booking_saved_blocks", filter: `workspace_id=eq.${ws.workspace.id}`, keys: [queryKeys.bookingSavedBlocks(ws.workspace.id)] },
    ],
    [ws.workspace.id, ws.slug],
  );
  useRealtime(manager ? `booking:${ws.workspace.id}` : null, bookingBindings);

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
    publishDataChange({ kinds: ["settings"] });
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
    mutationFn: ({ template, name, keepDraft }: { template: BookingFormTemplate; name: string; keepDraft?: boolean }) => services.booking.publishForm(ws.workspace.id, template, name, { keepDraft }),
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
  const templatesChanged = () => {
    publishDataChange({ kinds: ["settings"] });
    return queryClient.invalidateQueries({ queryKey: queryKeys.bookingTemplates(ws.workspace.id) });
  };
  const saveTemplate = async (input: { name: string; description: string | null; template: BookingFormTemplate }) => {
    await services.booking.saveTemplate(ws.workspace.id, input, ws.currentUser.id);
    await templatesChanged();
  };
  const deleteTemplate = async (template: BookingTemplate) => {
    await services.booking.deleteTemplate(template.id);
    await templatesChanged();
  };
  const savedBlocksChanged = () => {
    publishDataChange({ kinds: ["settings"] });
    return queryClient.invalidateQueries({ queryKey: queryKeys.bookingSavedBlocks(ws.workspace.id) });
  };
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
      <div className="mx-auto w-full max-w-[80rem] shrink-0">
        <PageHeader
          title={tab === "portals" ? "Portal and Booking" : "Edit the booking form"}
          // Held to a reading width: at full width the line pushes the button onto one of its own.
          description={
            <span className="block max-w-[44rem]">
              {tab === "portals"
                ? "One link for every department. They pick whose work to look at once they are in, and book new work from the same place."
                : "Shape the form everybody books through. Save as you go; nothing changes for anyone until you publish."}
            </span>
          }
          actions={
            tab === "book" ? (
              <Button variant="ghost" asChild>
                <Link
                  href={routes.book(ws.slug)}
                  // Moving within the app raises no browser prompt, so unsaved form changes are asked about here.
                  onClick={(event) => {
                    if (hasUnsavedWork() && !window.confirm("Leave without saving your changes to the form?")) event.preventDefault();
                  }}
                  data-testid="booking-editor-back"
                >
                  <ArrowLeft /> Portal and Booking
                </Link>
              </Button>
            ) : undefined
          }
        />
      </div>

      {tab === "portals" && (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-6 sm:px-7">
          {/* pt-3: room above the cards, as a hovered card lifts and its edge and shadow must not be cut by the scroll box. */}
          <div className="mx-auto w-full max-w-[80rem]">
            <PortalAdmin />
          </div>
        </div>
      )}
      {/* On a desktop the editor card scrolls by itself under the header; on a phone the whole page scrolls. */}
      <div className={cn("scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-7 lg:overflow-visible", tab !== "book" && "hidden")}>
        <p className="mb-3 text-[13px] text-muted-foreground md:hidden" data-testid="booking-editor-phone-note">Editing the form works best on a larger screen.</p>
        <div className="mx-auto grid w-full max-w-[80rem] gap-6 lg:h-full lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
          <section className="scrollbar-thin w-full rounded-2xl border border-border bg-card p-3 shadow-lg ring-1 ring-ring/15 sm:p-7 lg:min-h-0 lg:overflow-y-auto" data-testid="book-task-card">
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
                onPublish={(template, name, options) => publishForm.mutateAsync({ template, name, keepDraft: options?.keepDraft }).then(() => undefined)}
                published={{
                  name: ws.workspace.bookingFormName ?? null,
                  publishedAt: ws.workspace.bookingFormPublishedAt ?? null,
                  bookings: ws.workspace.bookingFormBookings ?? 0,
                  builtIn: !ws.workspace.bookingForm,
                }}
                teamName={ws.workspace.creativeTeamName?.trim() || ws.workspace.name}
                onDiscardDraft={discardDraft}
                onSaveTemplate={saveTemplate}
                onDeleteTemplate={deleteTemplate}
                onSaveBlock={saveBlock}
                onDeleteSavedBlock={deleteSavedBlock}
                panelContainer={isMobile ? null : editorPanel}
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
  const [copied, setCopied] = React.useState(false);
  const key = ws.workspace.bookingKey ?? null;
  // The origin is only known in the browser; until hydration the path alone is shown.
  const origin = React.useSyncExternalStore(subscribeNever, () => window.location.origin, () => "");
  const publicUrl = key ? `${origin}${routes.publicBooking(ws.slug, key)}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy the link.");
    }
  };

  return (
    <aside className="scrollbar-thin space-y-3 lg:min-h-0 lg:overflow-y-auto">
      <div ref={editorSlot} />
      {/* The public form: two buttons, nothing to read. */}
      <div className="grid gap-2" data-testid="booking-share">
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={() => void copy()} disabled={!publicUrl} data-testid="booking-copy-link">
            {copied ? <Check className="text-green-600" /> : <Copy />} {copied ? "Copied" : "Copy link"}
          </Button>
          <Button asChild variant="outline" disabled={!publicUrl}>
            <a href={publicUrl || undefined} target="_blank" rel="noreferrer" data-testid="booking-public-link">
              <ExternalLink /> Open form
            </a>
          </Button>
        </div>
      </div>
    </aside>
  );
}

function subscribeNever(): () => void {
  return () => {};
}
