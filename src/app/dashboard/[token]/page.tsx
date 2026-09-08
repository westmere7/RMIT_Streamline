import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicDashboardPage } from "@/features/dashboard/public-dashboard-page";

export const metadata: Metadata = {
  title: "Shared dashboard",
  // A link that has travelled by email should not turn up in search results.
  robots: { index: false, follow: false },
};

/** A dashboard someone shared by link. Read-only, full screen, and works with no account. */
export default async function SharedDashboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <Suspense>
      <PublicDashboardPage token={decodeURIComponent(token)} />
    </Suspense>
  );
}
