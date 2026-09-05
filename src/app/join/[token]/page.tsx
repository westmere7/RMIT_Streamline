import type { Metadata } from "next";
import { OnboardingScreen } from "@/features/onboarding/onboarding-screen";

export const metadata: Metadata = { title: "Join the workspace" };

/** The page an invited person opens from their link. Works without a session. */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <OnboardingScreen token={decodeURIComponent(token)} />;
}
