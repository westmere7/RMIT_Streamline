import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it } from "vitest";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function ui() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button">open</button>
      </PopoverTrigger>
      <PopoverContent>
        <span role="option" aria-selected={false}>Inside</span>
      </PopoverContent>
    </Popover>
  );
}

it("user-event default", async () => {
  const user = userEvent.setup();
  render(ui());
  const t0 = Date.now();
  await user.click(screen.getByText("open"));
  process.stderr.write(`\nDEFAULT click ${Date.now() - t0}ms open=${document.body.innerHTML.includes("Inside")}\n`);
}, 60000);

it("user-event no pointer check", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  render(ui());
  const t0 = Date.now();
  await user.click(screen.getByText("open"));
  process.stderr.write(`\nNOCHECK click ${Date.now() - t0}ms open=${document.body.innerHTML.includes("Inside")}\n`);
}, 60000);

it("fireEvent", async () => {
  render(ui());
  const t0 = Date.now();
  fireEvent.click(screen.getByText("open"));
  await screen.findByText("Inside");
  process.stderr.write(`\nFIRE click ${Date.now() - t0}ms\n`);
}, 60000);
