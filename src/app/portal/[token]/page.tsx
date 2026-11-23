import type { Metadata } from "next";
import { LegacyPortalLink } from "@/features/portal/short-links";

export const metadata: Metadata = {
  title: "Portal",
  // An old link carries its token: it must not travel to anywhere the visitor
  // clicks through to, and it must not be indexed.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

/** An old portal link: moves to the workspace's short address (/<workspace>/portal) while it is the current one. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <LegacyPortalLink token={decodeURIComponent(token)} />;
}
