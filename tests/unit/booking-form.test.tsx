import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingForm as BookingFormData, BookingReceipt, BookingRequest } from "@/domain";
import { defaultBookingFormTemplate } from "@/domain";
import { BookingForm } from "@/features/booking/booking-form";

const form: BookingFormData = {
  workspaceId: "ws-1",
  workspaceName: "RMIT VN MKT",
  workspaceSlug: "rmit",
  assetTypes: [
    { name: "Print assets", color: "red" },
    { name: "Static Designs", color: "blue" },
  ],
  priorities: [
    { name: "High", color: "orange" },
    { name: "Medium", color: "blue" },
  ],
  teams: [],
  template: defaultBookingFormTemplate(),
};

const receipt = (): BookingReceipt =>
  ({
    reference: "TA-7C3F",
    itemId: "item-1",
    itemName: "Open Day posters",
    boardId: "board-1",
    boardName: "Task Allocation",
    teamName: null,
    assetCount: 0,
    submittedAt: "2026-09-11T02:00:00.000Z",
  }) as BookingReceipt;

const renderForm = (props: Partial<React.ComponentProps<typeof BookingForm>> = {}) => {
  const onSubmit = vi.fn(async () => receipt());
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TooltipPrimitive.Provider>
        <BookingForm form={form} onSubmit={onSubmit} remember="portal:test" {...props} />
      </TooltipPrimitive.Provider>
    </QueryClientProvider>,
  );
  return { onSubmit };
};

/** Every visible question's label, which is what the form asks of a reader. */
const asked = () =>
  [...document.querySelectorAll<HTMLElement>('[data-testid="booking-form"] label')]
    .filter((label) => label.offsetParent !== null || true)
    .map((label) => label.textContent?.replace("*", "").trim())
    .filter(Boolean);

/**
 * The booking form as a stakeholder meets it.
 *
 * The template asks ten questions and insists on four. The form used to show
 * all ten at once with nothing saying which was which, and started every
 * booking from blank however many times the same person had booked — so these
 * tests are about the two claims that fix: only the required questions are in
 * front of the reader, and the browser remembers.
 */
describe("the booking form", () => {
  beforeEach(() => window.localStorage.clear());

  it("asks only what it insists on, and offers the rest behind one disclosure", async () => {
    renderForm();
    await waitFor(() => expect(screen.getByTestId("booking-form")).toBeInTheDocument());
    expect(asked()).toEqual(["Your name", "Email", "What is it?", "Tell us more"]);
    // The rest is there, named as optional, and one click away.
    const toggle = screen.getByTestId("booking-optional-toggle");
    expect(toggle).toHaveTextContent("all optional");
    expect(screen.queryByLabelText(/Needed by/)).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByText("Needed by")).toBeInTheDocument();
    expect(screen.getByText("School, department or portfolio")).toBeInTheDocument();
  });

  it("opens the optional half when a message lands on a question it hides", async () => {
    renderForm();
    await waitFor(() => expect(screen.getByTestId("booking-form")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId("booking-optional-toggle"));
    await userEvent.type(screen.getByLabelText(/Link to a brief/), "not-a-link");
    // Close it again, so the bad answer is out of sight when it is judged.
    await userEvent.click(screen.getByTestId("booking-optional-toggle"));
    await userEvent.click(screen.getByTestId("booking-submit"));
    // A message under a question nobody can see is a form that refuses to
    // submit and will not say why.
    await waitFor(() => expect(screen.getByTestId("booking-optional-toggle")).toHaveAttribute("aria-expanded", "true"));
  });

  it("remembers who booked, and says so rather than asking again", async () => {
    const first = renderForm();
    await waitFor(() => expect(screen.getByTestId("booking-form")).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/Your name/), "Priya Nair");
    await userEvent.type(screen.getByLabelText(/Email/), "priya@rmit.edu.au");
    await userEvent.type(screen.getByLabelText(/What is it/), "Open Day posters");
    await userEvent.type(screen.getByLabelText(/Tell us more/), "Six A1 posters for the Brunswick campus.");
    await userEvent.click(screen.getByTestId("booking-submit"));
    await waitFor(() => expect(first.onSubmit).toHaveBeenCalled());

    // A second visit: the two questions about them are answered already.
    screen.getByTestId("booking-receipt");
    document.body.innerHTML = "";
    renderForm();
    await waitFor(() => expect(screen.getByTestId("booking-known-requester")).toBeInTheDocument());
    expect(screen.getByTestId("booking-known-requester")).toHaveTextContent("Priya Nair");
    expect(asked()).toEqual(["What is it?", "Tell us more"]);
  });

  it("hands back the form to somebody who is not them", async () => {
    window.localStorage.setItem("streamline.booking", JSON.stringify({ "portal:test": { requester: { name: "Priya Nair", email: "priya@rmit.edu.au" }, bookings: [] } }));
    renderForm();
    await waitFor(() => expect(screen.getByTestId("booking-known-requester")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId("booking-not-you"));
    expect(screen.queryByTestId("booking-known-requester")).not.toBeInTheDocument();
    expect(asked()).toEqual(["Your name", "Email", "What is it?", "Tell us more"]);
  });

  it("starts a booking from one this browser already made, minus the deadline", async () => {
    window.localStorage.setItem(
      "streamline.booking",
      JSON.stringify({
        "portal:test": {
          requester: { name: "Priya Nair", email: "priya@rmit.edu.au" },
          bookings: [
            {
              id: "item-9",
              reference: "TA-0009",
              bookedAt: "2026-08-14T02:00:00.000Z",
              title: "Open Day wayfinding posters",
              brief: "A1 posters for the Open Day route.",
              assetTypes: ["Print assets"],
              priority: "High",
              teamId: null,
              referenceUrl: "https://example.com/brief",
              assets: [{ name: "A1 poster", quantity: 6, spec: "594x841 mm" }],
            },
          ],
        },
      }),
    );
    renderForm();
    await waitFor(() => expect(screen.getByTestId("booking-history")).toBeInTheDocument());
    await userEvent.click(within(screen.getByTestId("booking-history")).getByTestId("booking-history-item"));

    expect(screen.getByLabelText(/What is it/)).toHaveValue("Open Day wayfinding posters");
    expect(screen.getByLabelText(/Tell us more/)).toHaveValue("A1 posters for the Open Day route.");
    // The optional half is filled in, so it is open: a form holding answers
    // the reader has not seen is worse than the wall it replaced.
    expect(screen.getByTestId("booking-optional-toggle")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText(/Link to a brief/)).toHaveValue("https://example.com/brief");
    // A date that has passed is the one answer nobody wants copied forward.
    expect(screen.getByLabelText(/Needed by/)).toHaveValue("");
  });

  it("keeps the deliverables of the booking it copied", async () => {
    window.localStorage.setItem(
      "streamline.booking",
      JSON.stringify({
        "portal:test": {
          requester: null,
          bookings: [
            {
              id: "item-9",
              reference: "TA-0009",
              bookedAt: "2026-08-14T02:00:00.000Z",
              title: "Open Day wayfinding posters",
              brief: "A1 posters.",
              assetTypes: [],
              priority: null,
              teamId: null,
              referenceUrl: null,
              assets: [{ name: "A1 poster", quantity: 6, spec: "594x841 mm" }],
            },
          ],
        },
      }),
    );
    const { onSubmit } = renderForm();
    await waitFor(() => expect(screen.getByTestId("booking-history")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId("booking-history-item"));
    await userEvent.type(screen.getByLabelText(/Your name/), "Priya Nair");
    await userEvent.type(screen.getByLabelText(/Email/), "priya@rmit.edu.au");
    await userEvent.click(screen.getByTestId("booking-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const request = (onSubmit.mock.calls as unknown as BookingRequest[][])[0]![0]!;
    expect(request.assets).toEqual([{ name: "A1 poster", quantity: 6, spec: "594x841 mm" }]);
  });
});
