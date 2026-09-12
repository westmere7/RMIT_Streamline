import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { describe, expect, it, vi } from "vitest";
import type { BookingForm as BookingFormData, BookingFormTemplate, BookingReceipt, BookingRequest } from "@/domain";
import { defaultBookingFormTemplate, serviceById } from "@/domain";
import { BookingWizard } from "@/features/booking/wizard/booking-wizard";

const formWith = (template: BookingFormTemplate = defaultBookingFormTemplate()): BookingFormData => ({
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
  teams: [{ id: "team-1", name: "Digital", description: null, color: "blue", icon: "Shapes", boardName: "Digital board" }],
  template,
});

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

const renderWizard = (props: Partial<React.ComponentProps<typeof BookingWizard>> = {}) => {
  const onSubmit = vi.fn(async () => receipt());
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TooltipPrimitive.Provider>
        <BookingWizard form={formWith()} onSubmit={onSubmit} {...props} />
      </TooltipPrimitive.Provider>
    </QueryClientProvider>,
  );
  return { onSubmit, user: userEvent.setup() };
};

/** Fill in step one to the point where it will let somebody through. */
async function fillBasics(user: ReturnType<typeof userEvent.setup>, service = "design") {
  // The three about the requester are one block, and all three are required.
  await user.type(screen.getByTestId("booking-name"), "Priya Nair");
  await user.type(screen.getByTestId("booking-email"), "priya.nair@rmit.edu.au");
  await user.type(screen.getByTestId("booking-department"), "School of Design");
  await user.type(screen.getByTestId("booking-title"), "Open Day wayfinding posters");
  // Both of the "when" questions are required now.
  await user.click(screen.getByTestId("booking-priority"));
  await user.click(await screen.findByTestId("booking-priority-high"));
  fireEvent.change(screen.getByTestId("booking-due"), { target: { value: "2026-12-01" } });
  await user.click(screen.getByTestId(`booking-service-${service}`));
  // A service that offers sub-services wants at least one of them.
  const sub = document.querySelector('[data-testid^="booking-sub-"]');
  if (sub) await user.click(sub);
}

/**
 * The booking wizard as a stakeholder meets it: four steps, a bar that says
 * where they are, and questions that change with the kind of work they picked.
 */
describe("the booking wizard", () => {
  it("shows one segment per step and starts on the first", () => {
    renderWizard();
    const bar = screen.getByTestId("booking-progress");
    expect(within(bar).getAllByRole("button")).toHaveLength(4);
    expect(bar).toHaveAccessibleName("Step 1 of 4: Details");
    expect(screen.getByTestId("booking-step-basics")).toBeInTheDocument();
    // Nothing ahead is reachable until it is earned.
    expect(screen.getByTestId("booking-progress-brief")).toBeDisabled();
  });

  it("will not go past step one until the required answers and a service are in", async () => {
    const { user } = renderWizard();
    await user.click(screen.getByTestId("booking-next"));
    expect(screen.getByTestId("booking-step-basics")).toBeInTheDocument();
    expect(screen.getByText("Your name is required")).toBeInTheDocument();
    expect(screen.getByText("Pick the kind of work this is")).toBeInTheDocument();

    await fillBasics(user);
    await user.click(screen.getByTestId("booking-next"));
    expect(await screen.findByTestId("booking-step-brief")).toBeInTheDocument();
    expect(screen.getByTestId("booking-progress")).toHaveAccessibleName("Step 2 of 4: Brief");
  });

  it("asks the questions of the service that was picked, and nobody else's", async () => {
    const { user } = renderWizard();
    await fillBasics(user, "production");
    await user.click(screen.getByTestId("booking-next"));

    const brief = await screen.findByTestId("booking-step-brief");
    expect(within(brief).getByText("About the shoot")).toBeInTheDocument();
    expect(screen.getByTestId("booking-answer-prod-where")).toBeInTheDocument();
    expect(screen.queryByTestId("booking-answer-design-specs")).not.toBeInTheDocument();

    // Back a step, a different service, and the second step is a different form.
    await user.click(screen.getByTestId("booking-back"));
    await user.click(screen.getByTestId("booking-service-brand"));
    // Brand offers its own sub-services, and wants one of them.
    await user.click(screen.getByTestId("booking-sub-approval"));
    await user.click(screen.getByTestId("booking-next"));
    expect(await screen.findByTestId("booking-answer-brand-audience")).toBeInTheDocument();
    expect(screen.queryByTestId("booking-answer-prod-where")).not.toBeInTheDocument();
  });

  it("offers the chosen service's sub-services as chips, and drops them when the service changes", async () => {
    const { user } = renderWizard();
    await user.click(screen.getByTestId("booking-service-design"));
    await user.click(screen.getByTestId("booking-sub-print"));
    expect(screen.getByTestId("booking-sub-print")).toHaveAttribute("aria-pressed", "true");
    // Production offers neither Print nor anything else Design offered.
    await user.click(screen.getByTestId("booking-service-production"));
    expect(screen.queryByTestId("booking-sub-print")).not.toBeInTheDocument();
    expect(screen.getByTestId("booking-sub-photography")).toHaveAttribute("aria-pressed", "false");
  });

  it("numbers the questions of a brief and skips the furniture", async () => {
    const { user } = renderWizard();
    await fillBasics(user);
    await user.click(screen.getByTestId("booking-next"));
    await screen.findByTestId("booking-step-brief");
    // Design: two long questions, a single choice, a separator, then a link —
    // so the link is the fourth question, not the fifth block.
    const link = screen.getByTestId("booking-answer-design-assets").closest("div.grid")!.parentElement!;
    expect(within(link).getByText("4")).toBeInTheDocument();
  });

  it("puts help text under the question, and asks a dropdown single choice as a select", async () => {
    const template = defaultBookingFormTemplate();
    serviceById(template, "svc-design")!.blocks = [
      { id: "b-help", kind: "short", label: "With help", description: "Shown under the question", required: false },
      {
        id: "b-drop",
        kind: "single",
        label: "How many?",
        description: null,
        required: true,
        display: "dropdown",
        options: [
          { name: "Just the one", color: "blue" },
          { name: "A whole series of them", color: "violet" },
        ],
      },
    ];
    const { user } = renderWizard({ form: formWith(template) });
    await fillBasics(user);
    await user.click(screen.getByTestId("booking-next"));
    await screen.findByTestId("booking-step-brief");

    expect(screen.getByText("Shown under the question")).toBeInTheDocument();
    // A dropdown, not chips: no pressed buttons, one trigger asking for a pick.
    expect(screen.queryByRole("button", { name: "Just the one" })).not.toBeInTheDocument();
    expect(screen.getByTestId("booking-answer-b-drop")).toHaveTextContent("Pick one");
    await user.click(screen.getByTestId("booking-answer-b-drop"));
    await user.click(await screen.findByTestId("booking-answer-b-drop-a-whole-series-of-them"));
    expect(screen.getByTestId("booking-answer-b-drop")).toHaveTextContent("A whole series of them");
  });

  it("keeps every answer when two controls change in the same tick", async () => {
    // The two boxes of a link question are one answer written by two controls.
    // Both used to build the next answers map from the render's own copy of the
    // request, so whichever fired second threw the other away.
    const template = defaultBookingFormTemplate();
    serviceById(template, "svc-design")!.blocks = [
      { id: "l", kind: "link", label: "A link", description: null, required: false },
      { id: "q", kind: "short", label: "And a question", description: null, required: false },
    ];
    const { onSubmit, user } = renderWizard({ form: formWith(template) });
    await fillBasics(user);
    await user.click(screen.getByTestId("booking-next"));
    await screen.findByTestId("booking-step-brief");

    const url = screen.getByTestId("booking-answer-l") as HTMLInputElement;
    const label = screen.getByTestId("booking-answer-l-label") as HTMLInputElement;
    const other = screen.getByTestId("booking-answer-q") as HTMLInputElement;
    // Fired together, the way a paste or a fast typist gets them there.
    await act(async () => {
      fireEvent.change(url, { target: { value: "https://rmit.test/folder" } });
      fireEvent.change(label, { target: { value: "The folder" } });
      fireEvent.change(other, { target: { value: "An answer" } });
    });
    expect(url).toHaveValue("https://rmit.test/folder");
    expect(label).toHaveValue("The folder");
    expect(other).toHaveValue("An answer");

    await user.click(screen.getByTestId("booking-next"));
    await screen.findByTestId("booking-step-assets");
    await user.click(screen.getByTestId("booking-next"));
    await screen.findByTestId("booking-step-review");
    await user.click(screen.getByTestId("booking-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const sent = (onSubmit.mock.calls as unknown as BookingRequest[][])[0]![0]!;
    expect(sent.answers.l).toEqual({ kind: "link", url: "https://rmit.test/folder", label: "The folder" });
    expect(sent.answers.q).toEqual({ kind: "text", text: "An answer" });
  });

  it("holds a stakeholder on the brief until its required questions are answered", async () => {
    const { user } = renderWizard();
    await fillBasics(user);
    await user.click(screen.getByTestId("booking-next"));
    await screen.findByTestId("booking-step-brief");

    await user.click(screen.getByTestId("booking-next"));
    expect(screen.getByText("What are you asking for? is required")).toBeInTheDocument();
    expect(screen.getByTestId("booking-step-brief")).toBeInTheDocument();

    await user.type(screen.getByTestId("booking-answer-design-what"), "Six A1 posters.");
    await user.type(screen.getByTestId("booking-answer-design-specs"), "A1 portrait, CMYK.");
    await user.click(screen.getByTestId("booking-answer-design-copy-yes-final-and-approved"));
    await user.click(screen.getByTestId("booking-next"));
    expect(await screen.findByTestId("booking-step-assets")).toBeInTheDocument();
  });

  it("takes deliverables one line each, with a type of their own", async () => {
    const { user, onSubmit } = renderWizard();
    await fillBasics(user);
    await user.click(screen.getByTestId("booking-next"));
    await screen.findByTestId("booking-step-brief");
    await user.type(screen.getByTestId("booking-answer-design-what"), "Six A1 posters.");
    await user.type(screen.getByTestId("booking-answer-design-specs"), "A1 portrait, CMYK.");
    await user.click(screen.getByTestId("booking-answer-design-copy-yes-final-and-approved"));
    await user.click(screen.getByTestId("booking-next"));
    await screen.findByTestId("booking-step-assets");

    // Naming it makes the row; everything else is filled in on the row itself.
    await user.type(screen.getByTestId("asset-add-input"), "A1 poster{Enter}");
    const line = screen.getByTestId("asset-line");
    expect(line).toHaveAttribute("data-asset-name", "A1 poster");
    fireEvent.change(within(line).getByTestId("asset-quantity"), { target: { value: "6" } });
    await user.type(within(line).getByTestId("asset-notes"), "594×841 mm");
    await user.click(within(line).getByTestId("asset-type"));
    await user.click(await screen.findByRole("option", { name: "Print assets" }));

    await user.click(screen.getByTestId("booking-next"));
    await screen.findByTestId("booking-step-review");
    await user.click(screen.getByTestId("booking-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const sent = (onSubmit.mock.calls as unknown as BookingRequest[][])[0]![0]!;
    expect(sent.assets).toEqual([{ name: "A1 poster", quantity: 6, spec: "594×841 mm", assetType: "Print assets" }]);
  });

  it("lets the deliverables step be skipped outright", async () => {
    const { user } = renderWizard();
    await fillBasics(user);
    await user.click(screen.getByTestId("booking-next"));
    await screen.findByTestId("booking-step-brief");
    await user.type(screen.getByTestId("booking-answer-design-what"), "Six A1 posters.");
    await user.type(screen.getByTestId("booking-answer-design-specs"), "A1 portrait, CMYK.");
    await user.click(screen.getByTestId("booking-answer-design-copy-yes-final-and-approved"));
    await user.click(screen.getByTestId("booking-next"));

    await screen.findByTestId("booking-step-assets");
    await user.click(screen.getByTestId("booking-skip-assets"));
    expect(await screen.findByTestId("booking-step-review")).toBeInTheDocument();
    expect(screen.getByText(/Skipped/)).toBeInTheDocument();
  });

  it("recaps what will be sent, goes back to the step that owns it, and books the composed brief", async () => {
    const { onSubmit, user } = renderWizard();
    await fillBasics(user);
    await user.click(screen.getByTestId("booking-sub-print"));
    await user.click(screen.getByTestId("booking-next"));

    await screen.findByTestId("booking-step-brief");
    await user.type(screen.getByTestId("booking-answer-design-what"), "Six A1 posters for Brunswick.");
    await user.type(screen.getByTestId("booking-answer-design-specs"), "A1 portrait, CMYK.");
    await user.click(screen.getByTestId("booking-answer-design-copy-yes-final-and-approved"));
    await user.click(screen.getByTestId("booking-next"));

    await screen.findByTestId("booking-step-assets");
    await user.click(screen.getByTestId("booking-next"));

    const review = await screen.findByTestId("booking-step-review");
    expect(within(review).getByText("Open Day wayfinding posters")).toBeInTheDocument();
    expect(within(review).getByText(/^Design — /)).toHaveTextContent("Print");
    expect(within(review).getByText("Six A1 posters for Brunswick.")).toBeInTheDocument();

    // Every card on the recap goes back to the step it came from.
    await user.click(screen.getByTestId("booking-recap-edit-the-brief"));
    expect(await screen.findByTestId("booking-step-brief")).toBeInTheDocument();
    await user.click(screen.getByTestId("booking-progress-review"));
    await screen.findByTestId("booking-step-review");

    await user.click(screen.getByTestId("booking-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const sent = (onSubmit.mock.calls as unknown as BookingRequest[][])[0]![0]!;
    expect(sent.serviceTypeId).toBe("svc-design");
    expect(sent.subServices).toEqual(["Digital / Social", "Print"]);
    expect(sent.answers["design-copy"]).toEqual({ kind: "choice", values: ["Yes, final and approved"] });
    expect(sent.brief).toContain("Service: Design");
    expect(sent.brief).toContain("Involves: Digital / Social, Print");
    expect(sent.brief).toContain("1. What are you asking for?");
    expect(sent.brief).toContain("Six A1 posters for Brunswick.");
  });

  it("hands back the reference and whatever the team wrote as its reply", async () => {
    const template = defaultBookingFormTemplate();
    template.review.autoReply = "Thanks — a producer reads every booking.";
    const { user } = renderWizard({ form: formWith(template) });
    await fillBasics(user);
    await user.click(screen.getByTestId("booking-next"));
    await screen.findByTestId("booking-step-brief");
    await user.type(screen.getByTestId("booking-answer-design-what"), "Six A1 posters.");
    await user.type(screen.getByTestId("booking-answer-design-specs"), "A1 portrait.");
    await user.click(screen.getByTestId("booking-answer-design-copy-yes-final-and-approved"));
    await user.click(screen.getByTestId("booking-next"));
    await screen.findByTestId("booking-step-assets");
    await user.click(screen.getByTestId("booking-next"));
    await screen.findByTestId("booking-step-review");
    await user.click(screen.getByTestId("booking-submit"));

    const ticket = await screen.findByTestId("booking-receipt");
    expect(within(ticket).getByTestId("booking-reference")).toHaveTextContent("TA-7C3F");
    expect(screen.getByTestId("booking-auto-reply")).toHaveTextContent("Thanks — a producer reads every booking.");
  });

  it("fills the requester in from the account without taking the questions off the form", async () => {
    const { user } = renderWizard({ account: { name: "Danh Nguyen", email: "danh@rmit.edu.au" } });
    // Filled in, and still there to be changed: somebody booking for a
    // colleague needs the boxes, not a banner telling them whose name it is.
    expect(screen.getByTestId("booking-name")).toHaveValue("Danh Nguyen");
    expect(screen.getByTestId("booking-email")).toHaveValue("danh@rmit.edu.au");
    expect(screen.getByTestId("booking-known-requester")).toHaveTextContent("Danh Nguyen");

    await user.click(screen.getByTestId("booking-not-you"));
    expect(screen.getByTestId("booking-name")).toHaveValue("");
    // And the way back to the account is offered as soon as it is not in use.
    await user.click(screen.getByTestId("booking-book-as-me"));
    expect(screen.getByTestId("booking-name")).toHaveValue("Danh Nguyen");
  });

  it("offers signing in to anybody who has not, without insisting on it", () => {
    renderWizard({ signInHref: "/login?next=%2Fbook" });
    expect(screen.getByTestId("booking-sign-in")).toHaveAttribute("href", "/login?next=%2Fbook");
    // The questions are on the form either way.
    expect(screen.getByTestId("booking-name")).toBeInTheDocument();
    expect(screen.getByTestId("booking-department")).toBeInTheDocument();
  });

  it("does not ask — or insist on — a question the caller has already answered for itself", async () => {
    const { user } = renderWizard({ omit: ["department"], defaults: { department: "Comm." } });
    expect(screen.queryByTestId("booking-department")).not.toBeInTheDocument();
    expect(screen.getByTestId("booking-title")).toBeInTheDocument();
    // Required, but not of anybody who is never shown the box.
    await user.type(screen.getByTestId("booking-name"), "Priya Nair");
    await user.type(screen.getByTestId("booking-email"), "priya.nair@rmit.edu.au");
    await user.type(screen.getByTestId("booking-title"), "Open Day wayfinding posters");
    await user.click(screen.getByTestId("booking-priority"));
    await user.click(await screen.findByTestId("booking-priority-high"));
    fireEvent.change(screen.getByTestId("booking-due"), { target: { value: "2026-12-01" } });
    await user.click(screen.getByTestId("booking-service-design"));
    await user.click(screen.getByTestId("booking-sub-print"));
    await user.click(screen.getByTestId("booking-next"));
    expect(await screen.findByTestId("booking-step-brief")).toBeInTheDocument();
  });

  it("asks who the request is for when the caller serves several, and will not move on without it", async () => {
    const stakeholders = [
      { id: "d1", name: "Comm.", color: "blue" as const },
      { id: "d2", name: "Events", color: "orange" as const },
    ];
    let chosen: string | null = null;
    const { user } = renderWizard({ omit: ["department"], stakeholders, stakeholderId: null, onStakeholder: (id) => (chosen = id) });
    await user.type(screen.getByTestId("booking-name"), "Priya Nair");
    await user.type(screen.getByTestId("booking-email"), "priya.nair@rmit.edu.au");
    await user.type(screen.getByTestId("booking-title"), "Open Day wayfinding posters");
    await user.click(screen.getByTestId("booking-service-design"));
    await user.click(screen.getByTestId("booking-next"));
    expect(screen.getByText("Say who this request is for")).toBeInTheDocument();
    expect(screen.getByTestId("booking-step-basics")).toBeInTheDocument();
    // It is a question of step one, not a gate in front of the form.
    expect(screen.getByTestId("booking-stakeholder")).toBeInTheDocument();
  });

  it("drops the deliverables step altogether when the form turns it off", () => {
    const template = defaultBookingFormTemplate();
    template.assets.enabled = false;
    renderWizard({ form: formWith(template) });
    const bar = screen.getByTestId("booking-progress");
    expect(within(bar).getAllByRole("button")).toHaveLength(3);
    expect(bar).toHaveAccessibleName("Step 1 of 3: Details");
  });
});
