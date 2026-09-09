import type { Metadata } from "next";
import { Suspense } from "react";
import { SharedItemPage } from "@/features/share/shared-item-page";

export const metadata: Metadata = {
  title: "Shared task",
  // A link that has travelled by email should not turn up in search results.
  robots: { index: false, follow: false },
};

/** One task someone shared by link. Read-only; public links need no account. */
export default async function ShareItemPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <Suspense>
      <SharedItemPage token={decodeURIComponent(token)} />
    </Suspense>
  );
}
