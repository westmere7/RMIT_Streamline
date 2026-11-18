import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SEED_USER_IDS } from "@/data/seed/seed-data";
import { EditProfileDialog } from "@/features/profile/edit-profile-dialog";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { AppReady, createTestApp } from "../helpers/render-app";

/** The dialog open on one person, as the profile page opens it. */
function EditOpen({ userId }: { userId: string }) {
  const ws = useWorkspace();
  const user = ws.users.find((u) => u.id === userId);
  return user ? <EditProfileDialog user={user} open onOpenChange={() => undefined} /> : null;
}

/**
 * A photo is the person's own to change. The avatars bucket takes writes only
 * into the uploader's own folder, so an admin who could edit someone's name was
 * offered Replace photo and then refused by the storage policy.
 */
describe("the profile photo in the edit dialog", () => {
  it("offers your own photo to change", async () => {
    const app = await createTestApp("danh");
    await app.render(
      <AppReady>
        <EditOpen userId={SEED_USER_IDS.danh} />
      </AppReady>,
    );
    expect(await screen.findByTestId("avatar-upload")).toBeInTheDocument();
  });

  it("shows someone else's photo with nothing to change it", async () => {
    const app = await createTestApp("danh");
    await app.render(
      <AppReady>
        <EditOpen userId={SEED_USER_IDS.anh} />
      </AppReady>,
    );
    expect(await screen.findByText("Name and contact details.")).toBeInTheDocument();
    expect(screen.queryByTestId("avatar-upload")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove photo" })).not.toBeInTheDocument();
  });
});
