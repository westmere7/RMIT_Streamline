import type { Metadata } from "next";
import { TaskLinkScreen } from "@/features/booking/task-link-screen";

export const metadata: Metadata = {
  title: "Your request",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

/** A booking's own task, read-only, from the link on its receipt. */
export default async function Page({ params }: { params: Promise<{ workspace: string; token: string }> }) {
  const { token } = await params;
  return <TaskLinkScreen token={decodeURIComponent(token)} />;
}
