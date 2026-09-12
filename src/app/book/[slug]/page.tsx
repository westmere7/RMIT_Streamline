import type { Metadata } from "next";
import { BookingScreen } from "@/features/booking/booking-screen";

export const metadata: Metadata = { title: "Book a task" };

/**
 * The booking page for somebody signed in: the same form the public link
 * serves, reached without a key because the session answers for them. Every
 * "book a task" inside the app lands here, so the form is one page wherever it
 * was opened from.
 */
export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <BookingScreen workspaceSlug={decodeURIComponent(slug)} bookingKey={null} />;
}
