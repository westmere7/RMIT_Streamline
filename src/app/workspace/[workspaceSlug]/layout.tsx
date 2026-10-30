import type { Metadata } from "next";
import { APP_LINK_DESCRIPTION, workspaceLinkMeta } from "@/server/workspace-meta";
import { WorkspaceShell } from "./workspace-shell";

/**
 * What a link to a workspace says when it is shared: the workspace's name and
 * its description (Settings → Overview), read on the server for the chat that
 * unfurls it. The rest of the workspace is the client shell, as before.
 */
export async function generateMetadata({ params }: { params: Promise<{ workspaceSlug: string }> }): Promise<Metadata> {
  const { workspaceSlug } = await params;
  const meta = await workspaceLinkMeta(decodeURIComponent(workspaceSlug));
  if (!meta) return {};
  const description = meta.description ?? APP_LINK_DESCRIPTION;
  return {
    title: meta.name,
    description,
    openGraph: { title: `${meta.name} · Streamline`, description, siteName: "Streamline", type: "website" },
    twitter: { card: "summary", title: `${meta.name} · Streamline`, description },
  };
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
