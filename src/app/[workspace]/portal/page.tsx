import type { Metadata } from "next";
import { WorkspacePortalPage } from "@/features/portal/short-links";

export const metadata: Metadata = {
  title: "Portal",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

/** The workspace's portal at its short address: /<workspace>/portal. */
export default async function Page({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  return <WorkspacePortalPage workspaceSlug={decodeURIComponent(workspace)} />;
}
