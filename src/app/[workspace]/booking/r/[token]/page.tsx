import type { Metadata } from "next";
import { ResubmitScreen } from "@/features/booking/resubmit-screen";

export const metadata: Metadata = {
  title: "Add what's missing",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

/**
 * Where a requester answers a send-back: their form, filled in, with what the
 * team asked for. The token in the address is the only key (src/domain/booking/send-back.ts).
 */
export default async function Page({ params }: { params: Promise<{ workspace: string; token: string }> }) {
  const { token } = await params;
  return <ResubmitScreen token={decodeURIComponent(token)} />;
}
