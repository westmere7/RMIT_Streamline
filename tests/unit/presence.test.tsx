import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { UserAvatar } from "@/components/shared/user-avatar";
import { setOnline } from "@/lib/realtime/presence";

const ana = { id: "u-ana", firstName: "Ana", lastName: "Le", displayName: "Ana Le", avatarUrl: null };
const ben = { id: "u-ben", firstName: "Ben", lastName: "Ho", displayName: "Ben Ho", avatarUrl: null };

describe("online status", () => {
  afterEach(() => act(() => setOnline([])));

  it("puts a dot on the avatar of someone online, and none on anyone else", () => {
    render(
      <>
        <UserAvatar user={ana} tooltip={false} />
        <UserAvatar user={ben} tooltip={false} />
      </>,
    );
    expect(screen.queryAllByTestId("avatar-online")).toHaveLength(0);

    act(() => setOnline(["u-ana"]));
    expect(screen.getByRole("img", { name: "Ana Le" }).querySelector("[data-testid=avatar-online]")).not.toBeNull();
    expect(screen.getByRole("img", { name: "Ben Ho" }).querySelector("[data-testid=avatar-online]")).toBeNull();

    act(() => setOnline(["u-ben"]));
    expect(screen.getByRole("img", { name: "Ana Le" }).hasAttribute("data-online")).toBe(false);
    expect(screen.getByRole("img", { name: "Ben Ho" }).hasAttribute("data-online")).toBe(true);
  });

  it("shows no dot where nobody has joined, such as a shared page or an empty seat", () => {
    render(<UserAvatar user={null} tooltip={false} />);
    act(() => setOnline(["u-ana"]));
    expect(screen.queryAllByTestId("avatar-online")).toHaveLength(0);
  });

  it("re-renders an avatar only when its own person comes or goes", () => {
    let renders = 0;
    function Counted() {
      renders += 1;
      return <UserAvatar user={ana} tooltip={false} />;
    }
    render(<Counted />);
    const first = renders;
    act(() => setOnline(["u-ben"]));
    act(() => setOnline(["u-ben"]));
    // Counted itself never re-renders; the avatar inside it re-renders on its own store read.
    expect(renders).toBe(first);
    expect(screen.queryAllByTestId("avatar-online")).toHaveLength(0);
  });
});
