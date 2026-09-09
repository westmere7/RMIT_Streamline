import type { Metadata } from "next";
import { PortalPage } from "@/features/portal/portal-page";

export const metadata: Metadata = {
  title: "Stakeholder Portal",
  // A portal link is a credential: it must not travel to anywhere the visitor
  // clicks through to, and it must not be indexed.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PortalPage token={decodeURIComponent(token)} />;
}
