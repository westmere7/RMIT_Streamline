import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DesignKit } from "@/features/design-kit/design-kit";

export const metadata: Metadata = { title: "Design kit", robots: { index: false } };

/**
 * Every component the app is drawn with, on one page, for capturing into Figma
 * (see design/figma/README.md). Development only: production answers 404.
 * `?theme=dark` or `?theme=dim` draws it in the other themes.
 */
export default function DesignKitPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense>
      <DesignKit />
    </Suspense>
  );
}
