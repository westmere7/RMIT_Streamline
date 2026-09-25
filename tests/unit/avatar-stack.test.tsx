import { render, screen } from "@testing-library/react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { describe, expect, it, vi } from "vitest";
import { AvatarStack, uniqueUsers } from "@/components/shared/user-avatar";

const person = (id: string, name: string) => ({ id, firstName: name, lastName: "", displayName: name, avatarUrl: null });
const ana = person("u1", "Ana");
const ben = person("u2", "Ben");

describe("uniqueUsers", () => {
  it("keeps each user once, in first-seen order", () => {
    expect(uniqueUsers([ana, ben, ana, ben, ana])).toEqual([ana, ben]);
  });

  it("leaves a list without repeats alone", () => {
    expect(uniqueUsers([ben, ana])).toEqual([ben, ana]);
    expect(uniqueUsers([])).toEqual([]);
  });
});

describe("AvatarStack", () => {
  it("draws a person listed twice once, with no duplicate-key warning", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <TooltipPrimitive.Provider>
        <AvatarStack users={[ana, ana, ben]} max={3} />
      </TooltipPrimitive.Provider>,
    );
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
    expect(error.mock.calls.some((c) => String(c[0]).includes("same key"))).toBe(false);
    error.mockRestore();
  });
});
