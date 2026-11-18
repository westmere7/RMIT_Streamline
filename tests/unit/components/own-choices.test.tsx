import { fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it } from "vitest";
import type { BookingAnswer, BookingChoiceBlock } from "@/domain";
import { BlockField } from "@/features/booking/booking-fields";

const block = (allowOwn?: boolean): BookingChoiceBlock => ({
  id: "where",
  kind: "multi",
  label: "Where will it run?",
  description: null,
  required: true,
  options: [
    { name: "Social", color: "blue" },
    { name: "Print", color: "gray" },
  ],
  ...(allowOwn ? { allowOwn } : {}),
});

function Harness({ allowOwn }: { allowOwn?: boolean }) {
  const [value, setValue] = React.useState<BookingAnswer | undefined>(undefined);
  return (
    <>
      <BlockField block={block(allowOwn)} number="1" value={value} onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value ?? null)}</output>
    </>
  );
}

describe("adding a choice of your own", () => {
  it("adds what was typed as a chosen chip, and takes it off again when clicked", () => {
    render(<Harness allowOwn />);
    fireEvent.click(screen.getByTestId("booking-answer-where-social"));
    fireEvent.click(screen.getByTestId("booking-answer-where-own"));
    const input = screen.getByTestId("booking-answer-where-own-input");
    fireEvent.change(input, { target: { value: " Digital screens " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(JSON.parse(screen.getByTestId("value").textContent!)).toEqual({ kind: "choice", values: ["Social", "Digital screens"] });
    // The same again, in other letters, is not a second choice.
    fireEvent.change(input, { target: { value: "digital SCREENS" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(JSON.parse(screen.getByTestId("value").textContent!).values).toHaveLength(2);

    fireEvent.click(screen.getByTestId("booking-answer-where-own-digital-screens"));
    expect(JSON.parse(screen.getByTestId("value").textContent!)).toEqual({ kind: "choice", values: ["Social"] });
  });

  it("offers nothing to add where the question does not allow it", () => {
    render(<Harness />);
    expect(screen.queryByTestId("booking-answer-where-own")).not.toBeInTheDocument();
  });
});
