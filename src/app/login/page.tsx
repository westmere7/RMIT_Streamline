import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginScreen } from "@/features/auth/components/login-screen";

export const metadata: Metadata = { title: "Sign in" };

/**
 * The screen reads `?next=` — a shared link sends people here and expects them
 * back — and a page that reads the query string has to be behind Suspense, or
 * the build cannot prerender it.
 */
export default function LoginPage() {
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}
