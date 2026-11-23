import type { Metadata } from "next";
import { LegacyPortalLink } from "@/features/portal/short-links";

export const metadata: Metadata = {
  title: "Book a task",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

/** An old booking link: moves to the workspace's short address (/<workspace>/booking) while it is the current one. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <LegacyPortalLink token={decodeURIComponent(token)} startOnBooking />;
}
