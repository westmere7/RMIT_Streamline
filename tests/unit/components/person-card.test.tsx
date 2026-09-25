import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { PersonCardProvider, UserAvatar } from "@/components/shared/user-avatar";
import type { BoardColumn, Item } from "@/domain";
import { defaultSettingsFor } from "@/domain";
import { SEED_USER_IDS } from "@/data/seed/seed-data";
import { BoardContextProvider, type BoardContextValue } from "@/features/boards/board-context";
import { PersonCell } from "@/features/boards/components/cells/cell-renderer";
import { renderPersonCard } from "@/features/members/person-card";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { AppReady, createTestApp } from "../helpers/render-app";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const column: BoardColumn = { id: "req", boardId: "b", name: "Requester", type: "REQUESTER", settings: defaultSettingsFor("REQUESTER"), position: 0, width: 130, hidden: false, createdAt: "" };
const item: Item = { id: "i1", boardId: "b", groupId: "g", parentItemId: null, name: "Open Day posters", description: null, position: 0, createdBy: "u", archivedAt: null, createdAt: "", updatedAt: "" };

/** A board as the app gives it: pickers offer active people, cells name everyone. */
function Board({ children }: { children: React.ReactNode }) {
  const ws = useWorkspace();
  const ctx = { users: ws.activeUsers, people: ws.users } as unknown as BoardContextValue;
  return (
    <PersonCardProvider value={renderPersonCard}>
      <BoardContextProvider value={ctx}>
        <AppReady>{children}</AppReady>
      </BoardContextProvider>
    </PersonCardProvider>
  );
}

describe("a person's card and a requester who has not onboarded", () => {
  it("names a pending requester in the cell, as any member is, without offering them in the picker", async () => {
    const app = await createTestApp("danh");
    const user = userEvent.setup();
    await app.render(
      <Board>
        <PersonCell item={item} column={column} value={{ type: "REQUESTER", userIds: [SEED_USER_IDS.anh] }} onChange={() => undefined} readOnly={false} />
      </Board>,
    );
    const cell = screen.getByTestId("requester-cell");
    expect(cell).toHaveTextContent("Anh");
    expect(within(cell).getByRole("img", { name: "Anh Pham" })).toBeInTheDocument();
    await user.click(cell);
    const picker = await screen.findByTestId("person-picker");
    // Chosen, so shown as the chip; not assignable, so not in the list below it.
    expect(within(picker).getByRole("button", { name: "Remove Anh Pham" })).toBeInTheDocument();
    expect(within(picker).queryByRole("option", { name: /Anh Pham/ })).toBeNull();
    expect(within(picker).getByRole("option", { name: /Emily/ })).toBeInTheDocument();
  });

  it("shows a pending member's card on hover, marked as pending, with a way to their profile", async () => {
    const app = await createTestApp("danh");
    const user = userEvent.setup();
    await app.render(
      <Board>
        <PersonCell item={item} column={column} value={{ type: "REQUESTER", userIds: [SEED_USER_IDS.anh] }} onChange={() => undefined} readOnly={false} />
      </Board>,
    );
    await user.hover(screen.getByText("Anh"));
    const card = await screen.findByTestId("person-card");
    expect(within(card).getByTestId("person-card-name")).toHaveTextContent("Anh Pham");
    expect(within(card).getByTestId("person-card-status")).toHaveTextContent("Pending onboarding");
    expect(within(card).getByText("Production Designer")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "View profile" })).toHaveAttribute("href", `/workspace/rmit/people/${SEED_USER_IDS.anh}`);
  });

  it("shows an active member's card with no status, from any avatar", async () => {
    const app = await createTestApp("danh");
    const user = userEvent.setup();
    function Face() {
      const ws = useWorkspace();
      return <UserAvatar user={ws.userById(SEED_USER_IDS.emily)} />;
    }
    await app.render(
      <Board>
        <Face />
      </Board>,
    );
    await user.hover(screen.getByRole("img"));
    const card = await screen.findByTestId("person-card");
    expect(within(card).getByTestId("person-card-name")).toHaveTextContent(/Emily/);
    expect(within(card).queryByTestId("person-card-status")).toBeNull();
    expect(within(card).getByText(/@rmit\.local$/)).toBeInTheDocument();
  });
});
