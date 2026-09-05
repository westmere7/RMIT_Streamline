import { ProfilePage } from "@/features/profile/profile-page";

export default async function PersonRoute({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <ProfilePage userId={userId} />;
}
