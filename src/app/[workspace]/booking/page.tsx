import type { Metadata } from "next";
import { WorkspacePortalPage } from "@/features/portal/short-links";

export const metadata: Metadata = {
  title: "Book a task",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

/**
 * The one booking form for people outside the app, at its short address:
 * /<workspace>/booking. The portal's own form, opened on its own; a member who
 * is signed in is still recognised as the booker.
 */
export default async function Page({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  return <WorkspacePortalPage workspaceSlug={decodeURIComponent(workspace)} startOnBooking />;
}
