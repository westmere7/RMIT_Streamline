import type { Metadata } from "next";
import { PortalPage } from "@/features/portal/portal-page";

export const metadata: Metadata = {
  title: "Book a task",
  // A portal link is a credential: it must not travel to anywhere the visitor
  // clicks through to, and it must not be indexed.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

/**
 * The booking form on a link of its own.
 *
 * The same portal, the same credential, opened on the one thing most people
 * follow a link to do. Sending somebody the portal and asking them to find the
 * button put a board of other people's work between them and the form; this
 * puts them in it, and the stakeholder they are booking for is the form's first
 * question rather than a filter they had to set on the page behind it.
 */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PortalPage token={decodeURIComponent(token)} startOnBooking />;
}
