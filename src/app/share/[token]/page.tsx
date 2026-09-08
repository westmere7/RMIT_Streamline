import type { Metadata } from "next";
import { Suspense } from "react";
import { SharedBoardPage } from "@/features/share/shared-board-page";

export const metadata: Metadata = {
  title: "Shared board",
  // A link that has travelled by email should not turn up in search results.
  robots: { index: false, follow: false },
};

/** A board someone shared by link. Read-only, and works with no account. */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <Suspense>
      <SharedBoardPage token={decodeURIComponent(token)} />
    </Suspense>
  );
}
