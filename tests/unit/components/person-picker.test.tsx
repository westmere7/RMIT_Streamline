import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { describe, expect, it, vi } from "vitest";
import type { User } from "@/domain";
import { PersonPicker } from "@/features/boards/components/pickers/person-picker";

const user = (id: string, first: string, last: string, jobTitle: string): User => ({
  id,
  email: `${first.toLowerCase()}@rmit.local`,
  firstName: first,
  lastName: last,
  displayName: `${first} ${last}`,
  avatarUrl: null,
  jobTitle,
  department: null,
  timezone: "UTC",
  deactivatedAt: null,
  createdAt: "",
  updatedAt: "",
});

const users = [user("danh", "Danh", "Nguyen", "Senior Designer"), user("emily", "Emily", "Carter", "Creative Lead"), user("jun", "Jun", "Tanaka", "Digital Producer")];

function renderPicker(value: string[] = [], allowMultiple = true) {
  const onChange = vi.fn();
  const onDone = vi.fn();
  render(
    <TooltipPrimitive.Provider>
      <PersonPicker users={users} value={value} onChange={onChange} allowMultiple={allowMultiple} onDone={onDone} />
    </TooltipPrimitive.Provider>,
  );
  return { onChange, onDone };
}

describe("PersonPicker", () => {
  it("lists members and filters them by search", async () => {
    const u = userEvent.setup();
    renderPicker();
    expect(screen.getByText("Danh Nguyen")).toBeInTheDocument();
    await u.type(screen.getByPlaceholderText("Search people…"), "jun");
    expect(screen.queryByText("Danh Nguyen")).not.toBeInTheDocument();
    expect(screen.getByText("Jun Tanaka")).toBeInTheDocument();
  });

  it("adds people in multi-select mode and shows them as chips", async () => {
    const u = userEvent.setup();
    const { onChange } = renderPicker(["danh"]);
    const picker = screen.getByTestId("person-picker");
    expect(within(picker).getByRole("button", { name: "Remove Danh Nguyen" })).toBeInTheDocument();
    await u.click(screen.getByText("Emily Carter"));
    expect(onChange).toHaveBeenCalledWith(["danh", "emily"]);
    await u.click(screen.getByRole("button", { name: "Remove Danh Nguyen" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("replaces the selection and closes in single-select mode", async () => {
    const u = userEvent.setup();
    const { onChange, onDone } = renderPicker(["danh"], false);
    await u.click(screen.getByText("Jun Tanaka"));
    expect(onChange).toHaveBeenCalledWith(["jun"]);
    expect(onDone).toHaveBeenCalled();
  });
});
