import type { Metadata } from "next";
import { BookingScreen } from "@/features/booking/booking-screen";

export const metadata: Metadata = { title: "Book a task" };

/** The public booking page stakeholders open from the studio's link. Works without a session. */
export default async function BookPage({ params }: { params: Promise<{ slug: string; key: string }> }) {
  const { slug, key } = await params;
  return <BookingScreen workspaceSlug={decodeURIComponent(slug)} bookingKey={decodeURIComponent(key)} />;
}
