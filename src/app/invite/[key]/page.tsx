import type { Metadata } from "next";
import { SelfJoinScreen } from "@/features/onboarding/self-join-screen";

export const metadata: Metadata = { title: "Join the workspace" };

/** The workspace's join link, handed round the team. Works without a session. */
export default async function InvitePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <SelfJoinScreen joinKey={decodeURIComponent(key)} />;
}
