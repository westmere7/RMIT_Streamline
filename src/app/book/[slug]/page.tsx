import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

/**
 * The old members' booking page. Booking from inside the app is the pop-up
 * form now; this address goes to the one external form, which still knows a
 * signed-in member as the booker.
 */
export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(routes.workspaceBooking(decodeURIComponent(slug)));
}
