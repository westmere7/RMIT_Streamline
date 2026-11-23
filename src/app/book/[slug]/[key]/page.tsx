import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

/**
 * The old public booking link with the workspace's key. The one external form
 * is the short address now and needs no key; the workspace is already in this
 * link, so moving it on tells nobody anything new.
 */
export default async function BookPage({ params }: { params: Promise<{ slug: string; key: string }> }) {
  const { slug } = await params;
  redirect(routes.workspaceBooking(decodeURIComponent(slug)));
}
