import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandBackgrounds } from "@/features/design-kit/brand-backgrounds";

export const metadata: Metadata = { title: "Brand backgrounds", robots: { index: false } };

/** Options for the brand panel's background, side by side. Development only, like the design kit. */
export default function BrandBackgroundsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BrandBackgrounds />;
}
