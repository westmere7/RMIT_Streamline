import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { BoardColumn, BookingRequest, ColumnValue, PortalBoardPayload, StakeholderDepartment } from "@/domain";
import { createServices, type ResolvedPortal, type Services } from "@/services";

/**
 * The portal shows what the task holds, read-only: the brief as the board has
 * it, the faces of the people on it, and every column the team switched on,
 * whether or not anything is in it yet.
 */

let counter = 0;
const WS = SEED_WORKSPACE_ID;
const BOARD = SEED_BOARD_IDS.rmitinerary;

const request = (overrides: Partial<BookingRequest> = {}): BookingRequest => ({
  requesterName: "Priya Nair",
  requesterEmail: "priya@rmit.edu.au",
  department: "Comm.",
  title: "Open Day wayfinding posters",
  brief: "Six A1 posters.",
  assetTypes: [],
  assets: [],
  serviceTypeId: "svc-design",
  subServices: [],
  answers: {
    "design-what": { kind: "text", text: "Six A1 posters for the Brunswick campus, print ready." },
    "design-specs": { kind: "text", text: "A1 portrait, CMYK." },
    "design-copy": { kind: "choice", values: ["Yes, final and approved"] },
  },
  teamId: null,
  dueDate: "2026-10-01",
  priority: "High",
  referenceUrl: null,
  ...overrides,
});

describe("the portal shows the task's own data", () => {
  let services: Services;
  let department: StakeholderDepartment;
  let resolved: ResolvedPortal;

  beforeEach(async () => {
    counter += 1;
    services = createServices(createLocalRepositories({ databaseName: `portal-data-${Date.now()}-${counter}` }));
    department = (await services.portals.ensureDepartments(WS))[0]!;
    const portal = await services.portals.setEnabled(WS, true);
    resolved = await services.portals.resolve({ token: portal.token, password: null });
  });

  const columnOfType = async (boardId: string, type: BoardColumn["type"]) => (await services.repos.boards.listColumns(boardId)).find((c) => c.type === type)!;
  const valueIn = (payload: PortalBoardPayload, itemId: string, columnName: string): ColumnValue | undefined => {
    const column = payload.columns.find((c) => c.name === columnName);
    return column ? payload.values.find((v) => v.itemId === itemId && v.columnId === column.id)?.value : undefined;
  };

  it("reads the brief from the board's Brief column, not the copy saved at booking", async () => {
    const receipt = await services.portals.book(resolved, { submissionKey: "key-data-0001", departmentId: department.id, request: request(), booking: services.booking });
    const item = (await services.repos.items.getById(receipt.itemId))!;
    const brief = await columnOfType(item.boardId, "BRIEF");
    await services.repos.items.setValue(item.id, brief.id, { type: "RICH_TEXT", text: "**Service:** Production\n\n## 1. What type of service do you require?\nEvent coverage videography" });

    const payload = await services.portals.board(resolved);
    const shown = valueIn(payload, item.id, "Brief");
    expect(shown?.type).toBe("RICH_TEXT");
    expect(shown && shown.type === "RICH_TEXT" ? shown.text : "").toContain("Event coverage videography");
    // The opened request says the same, in plain words.
    const detail = await services.portals.task(resolved, item.id, null);
    expect(detail.brief).toContain("Event coverage videography");
    expect(detail.brief).not.toContain("**");
  });

  it("shows a brief for a task that was never booked through the portal", async () => {
    // Labelled for the department on a team board, with its brief written there.
    const item = await services.items.createItem({ boardId: BOARD, groupId: (await services.repos.boards.listGroups(BOARD))[0]!.id, name: "Made on the board" }, DANH);
    await services.repos.items.setValue(item.id, (await columnOfType(BOARD, "STAKEHOLDER")).id, { type: "STAKEHOLDER", group: department.name });
    await services.repos.items.setValue(item.id, (await columnOfType(BOARD, "BRIEF")).id, { type: "RICH_TEXT", text: "Testing 123" });

    const payload = await services.portals.board(resolved);
    expect(payload.items.map((i) => i.id)).toContain(item.id);
    const shown = valueIn(payload, item.id, "Brief");
    expect(shown && shown.type === "RICH_TEXT" ? shown.text : "").toContain("Testing 123");
  });

  it("carries the photo of the person in charge", async () => {
    const receipt = await services.portals.book(resolved, { submissionKey: "key-data-0002", departmentId: department.id, request: request(), booking: services.booking });
    const item = (await services.repos.items.getById(receipt.itemId))!;
    const photo = "https://example.test/storage/v1/object/public/avatars/danh.png";
    await services.repos.users.update(DANH, { avatarUrl: photo });
    await services.repos.items.setValue(item.id, (await columnOfType(item.boardId, "PERSON")).id, { type: "PERSON", userIds: [DANH] });

    const payload = await services.portals.board(resolved);
    expect(payload.users.find((u) => u.id === DANH)?.avatarUrl).toBe(photo);
    // Still nothing else about them.
    expect(payload.users.find((u) => u.id === DANH)?.email).toBe("");
  });

  it("draws every column the team switched on, filled or not", async () => {
    await services.portals.book(resolved, { submissionKey: "key-data-0003", departmentId: department.id, request: request(), booking: services.booking });
    const payload = await services.portals.board(resolved);
    for (const name of ["Requested", "Department", "Status", "Priority", "PIC", "Due date", "Timeline", "Assets recap", "Asset type", "Brief"]) {
      expect(payload.columns.map((c) => c.name), name).toContain(name);
    }
  });
});

const DANH = SEED_USER_IDS.danh;
