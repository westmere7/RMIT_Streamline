import { addDays, addMinutes, addMonths, format, startOfMonth, subDays, subHours } from "date-fns";
import type {
  Activity,
  Board,
  BoardColumn,
  BoardGroup,
  BoardMember,
  BookingAssetLine,
  BookingRequest,
  ColumnValue,
  Comment,
  DirectMessage,
  Item,
  ItemAsset,
  ItemColumnValue,
  ItemLink,
  Notification,
  NotificationType,
  Team,
  TeamMember,
  Tracker,
  TrackerColumn,
  TrackerSheet,
} from "@/domain";
import { DEFAULT_COLUMN_WIDTHS, DEFAULT_TYPE_DELIVERY, defaultSettingsFor, formatAssetLine, normaliseLinkPair, recapAssets, recapColumnValue } from "@/domain";
import { buildRows, type DemoRowSpec } from "@/features/trackers/tracker-template";
import { toISODate } from "@/lib/dates/dates";
import { slugify } from "@/lib/slug";
import { describeBooking, mapBookingToColumns } from "@/services/booking";
import { taskAllocationColumns } from "@/services/booking-service";
import { SYSTEM_BOARD, SYSTEM_BOARD_GROUPS, SYSTEM_TEAM } from "@/services/workspace-service";
import type { BoardKey, ExtrasIdNamespace, SeedBundle, SeedLookups, TeamKey, UserKey } from "./seed-data";

/**
 * The second half of the demo seed: everything the newer sections need to look
 * lived-in. Task booking (the built-in Admin team, the Task Allocation board and
 * stakeholder bookings on it), direct messages, two more trackers, more updates
 * and notifications, and fresh work for the owner persona.
 *
 * Every id comes from the "extra…" namespaces, so this bundle can be added to a
 * database that already holds the base seed without colliding with it
 * (scripts/db-seed-topup.mts). Base entities are addressed only through the
 * stable ids and the lookups in the context, never by position.
 */

export interface SeedExtrasContext {
  now: Date;
  workspaceId: string;
  /** Deterministic id generator restricted to the extras namespaces. */
  sid: (ns: ExtrasIdNamespace) => string;
  users: Record<UserKey, string>;
  userNames: Record<UserKey, string>;
  teams: Record<TeamKey, string>;
  teamNameOf: Record<TeamKey, string>;
  boards: Record<BoardKey, string>;
  /** Active workspace owners and admins: they see Task Allocation and hear about bookings. */
  admins: UserKey[];
  /** Names of the ordinary teams, sorted, for the "Requested team" palette. */
  teamNames: string[];
  lookups: SeedLookups;
}

type LabelGroup = "Incoming" | "Allocated" | "Closed";

interface BookingSpec {
  title: string;
  requesterName: string;
  requesterEmail: string;
  department: string;
  brief: string;
  assetTypes: string[];
  assets: BookingAssetLine[];
  team: TeamKey | null;
  /** Due date offset in days from now. */
  due: number;
  priority: "Critical" | "High" | "Medium" | "Low";
  referenceUrl: string | null;
  group: LabelGroup;
  status: "not_started" | "working" | "done";
  /** Hours ago the booking arrived. */
  bookedHoursAgo: number;
  /** Admins who have already read their TASK_BOOKED notification. */
  readBy: UserKey[];
  /** For allocated bookings: where the manager placed it and who picked it up. */
  allocate?: { board: BoardKey; owner: UserKey; hoursAgo: number };
}

const BOOKINGS: BookingSpec[] = [
  {
    title: "Postgraduate info evening posters",
    requesterName: "Hannah Lee",
    requesterEmail: "hannah.lee@rmit.edu.au",
    department: "School of Business – Melbourne",
    brief: "Posters and a takeaway flyer for the postgraduate information evening at the Swanston Academic Building. Brand-compliant, using the new postgraduate key visual. Print-ready PDFs please; we will arrange printing through campus services.",
    assetTypes: ["Print"],
    assets: [
      { name: "A1 poster", quantity: 4, spec: "594×841 mm, CMYK, 3 mm bleed" },
      { name: "A4 flyer", quantity: 200, spec: "Double-sided, 150 gsm silk" },
    ],
    team: "melbourne",
    due: 9,
    priority: "High",
    referenceUrl: "https://example.rmit.local/briefs/pg-info-evening",
    group: "Incoming",
    status: "not_started",
    bookedHoursAgo: 3,
    readBy: [],
  },
  {
    title: "Scholarship announcement social tiles",
    requesterName: "Nguyen Thi Hoa",
    requesterEmail: "hoa.nguyen@rmit.edu.vn",
    department: "Student Recruitment – Vietnam",
    brief: "Announcing the 2027 Vietnam scholarship round across Facebook and Instagram. Bilingual copy is attached to the reference link; the amounts must be shown in VND and AUD.",
    assetTypes: ["Social"],
    assets: [
      { name: "Instagram tile", quantity: 3, spec: "1080×1080" },
      { name: "Story", quantity: 3, spec: "1080×1920, safe zones for UI" },
      { name: "Facebook cover", quantity: null, spec: "820×312" },
    ],
    team: "content",
    due: 5,
    priority: "Medium",
    referenceUrl: "https://example.rmit.local/briefs/vn-scholarships-2027",
    group: "Incoming",
    status: "not_started",
    bookedHoursAgo: 7,
    readBy: ["emily"],
  },
  {
    title: "Research impact video – 90s",
    requesterName: "Dr Marcus Webb",
    requesterEmail: "marcus.webb@rmit.edu.au",
    department: "STEM College – Research Office",
    brief: "A 90-second film on the renewable materials lab for the research showcase, plus two social cutdowns. Interviews with two researchers and b-roll of the lab; we can arrange access on any weekday morning.",
    assetTypes: ["Video", "Motion"],
    assets: [
      { name: "90s film", quantity: null, spec: "16:9, 4K master, captions" },
      { name: "30s cutdown", quantity: 2, spec: "9:16 and 1:1" },
    ],
    team: "video",
    due: 28,
    priority: "Medium",
    referenceUrl: null,
    group: "Incoming",
    status: "not_started",
    bookedHoursAgo: 22,
    readBy: ["danh", "emily"],
  },
  {
    title: "Careers Week web banners",
    requesterName: "Aisha Rahman",
    requesterEmail: "aisha.rahman@rmit.edu.au",
    department: "Careers & Employability",
    brief: "Homepage and student portal banners for Careers Week, plus an email header for the weekly student digest. Copy is final; the Careers Week colourway from last year can be reused.",
    assetTypes: ["Web", "Digital"],
    assets: [
      { name: "Homepage hero", quantity: null, spec: "1920×600, WebP under 300 KB" },
      { name: "Portal sidebar banner", quantity: null, spec: "300×600" },
      { name: "Email header", quantity: null, spec: "600×200" },
    ],
    team: "digital",
    due: 7,
    priority: "High",
    referenceUrl: "https://example.rmit.local/briefs/careers-week",
    group: "Incoming",
    status: "not_started",
    bookedHoursAgo: 30,
    readBy: ["danh", "joanne", "sarah"],
  },
  {
    title: "Industry partner lunch invitations",
    requesterName: "James O'Connor",
    requesterEmail: "james.oconnor@rmit.edu.au",
    department: "Advancement",
    brief: "Printed invitation, name badges and two pull-up banners for the industry partner lunch at the Alumni Courtyard. Guest list of 120. Not sure which team this belongs to — happy for you to decide.",
    assetTypes: ["Print", "Event"],
    assets: [
      { name: "A5 invitation", quantity: 120, spec: "Folded, uncoated 300 gsm" },
      { name: "Name badge", quantity: 120, spec: "90×55 mm, lanyard" },
      { name: "Pull-up banner", quantity: 2, spec: "850×2000 mm" },
    ],
    team: null,
    due: 12,
    priority: "Low",
    referenceUrl: null,
    group: "Incoming",
    status: "not_started",
    bookedHoursAgo: 46,
    readBy: ["danh", "emily", "joanne", "sarah", "admin"],
  },
  {
    title: "Executive MBA open lecture posters",
    requesterName: "Priyanka Desai",
    requesterEmail: "priyanka.desai@rmit.edu.au",
    department: "Graduate School of Business & Law",
    brief: "Poster series for the Executive MBA open lecture programme (six lectures, one poster each) and a slide for the campus digital screens. Speaker portraits are supplied; the series needs a consistent look that can run for the whole semester.",
    assetTypes: ["Print", "Digital"],
    assets: [
      { name: "A2 poster", quantity: 6, spec: "420×594 mm, CMYK" },
      { name: "Digital screen slide", quantity: null, spec: "1920×1080, 10 s static" },
    ],
    team: "vietnam",
    due: 6,
    priority: "High",
    referenceUrl: "https://example.rmit.local/briefs/emba-open-lectures",
    group: "Allocated",
    status: "working",
    bookedHoursAgo: 100,
    readBy: ["danh", "emily", "joanne", "sarah", "admin"],
    allocate: { board: "requests", owner: "tuyet", hoursAgo: 92 },
  },
  {
    title: "Alumni reunion social campaign",
    requesterName: "Tom Nguyen",
    requesterEmail: "tom.nguyen@rmit.edu.au",
    department: "Alumni Relations",
    brief: "A short social campaign for the 20-year reunion: one carousel telling the class-of-2006 story and two reel covers for the alumni stories we are filming. Tone is warm and nostalgic; photography from the archive is in the shared folder.",
    assetTypes: ["Social", "Copy"],
    assets: [
      { name: "Carousel", quantity: null, spec: "5 cards, 1080×1080" },
      { name: "Reel cover", quantity: 2, spec: "1080×1920" },
    ],
    team: "content",
    due: 10,
    priority: "Medium",
    referenceUrl: "https://example.rmit.local/briefs/alumni-reunion",
    group: "Allocated",
    status: "working",
    bookedHoursAgo: 140,
    readBy: ["danh", "emily", "joanne", "sarah", "admin"],
    allocate: { board: "social", owner: "linh", hoursAgo: 120 },
  },
  {
    title: "Library orientation floor decals",
    requesterName: "Sophie Grant",
    requesterEmail: "sophie.grant@rmit.edu.au",
    department: "RMIT Library",
    brief: "Floor decals guiding new students from the library entrance to the help desk and the group study rooms. Twelve decals, anti-slip laminate, to match the wayfinding refresh.",
    assetTypes: ["Print"],
    assets: [{ name: "Floor decal", quantity: 12, spec: "600 mm diameter, anti-slip laminate" }],
    team: "vietnam",
    due: -3,
    priority: "Low",
    referenceUrl: null,
    group: "Closed",
    status: "done",
    bookedHoursAgo: 20 * 24,
    readBy: ["danh", "emily", "joanne", "sarah", "admin"],
  },
];

interface ExtraItemSpec {
  board: BoardKey;
  group: string;
  name: string;
  owner?: UserKey[];
  requester?: UserKey[];
  status?: string;
  priority?: string;
  due?: number;
  timeline?: [number, number];
  tags?: string[];
  text?: Record<string, string>;
  number?: Record<string, number>;
  checkbox?: Record<string, boolean>;
  link?: Record<string, { url: string; text: string }>;
  description?: string;
  createdBy: UserKey;
  createdDaysAgo: number;
}

/** Fresh work: the owner persona's week, plus a few things for other people so My Work is not all one name. */
const FRESH_ITEMS: ExtraItemSpec[] = [
  { board: "rmitinerary", group: "Design", name: "RMITinerary Global Citizen", owner: ["danh"], status: "working", priority: "high", due: 1, timeline: [-3, 1], text: { notes: "Exchange pathway spread; photography from Barcelona partner in." }, createdBy: "danh", createdDaysAgo: 3, description: "Persona spread for the Global Citizen pathway. 4pp with the exchange map and partner logos." },
  { board: "rmitinerary", group: "Stakeholder Review", name: "Back cover partner logos", owner: ["danh"], status: "waiting", priority: "medium", due: 0, timeline: [-2, 0], text: { notes: "Waiting on the updated Deakin Co lockup." }, createdBy: "joanne", createdDaysAgo: 2 },
  { board: "masterclass", group: "Design", name: "Masterclass social asset – Speaker 4", owner: ["danh"], status: "working", priority: "high", due: 2, text: { format: "1080x1080, 1080x1920" }, tags: ["Vietnam", "Melbourne"], createdBy: "emily", createdDaysAgo: 1 },
  { board: "masterclass", group: "Briefing", name: "Masterclass thank-you email header", owner: ["admin"], status: "not_started", priority: "low", due: 8, text: { format: "600x200" }, tags: ["Global"], createdBy: "grace", createdDaysAgo: 0 },
  { board: "requests", group: "Triaged", name: "Vietnam campus map refresh", requester: ["thao"], owner: ["danh"], status: "working", priority: "medium", due: 4, link: { brief: { url: "https://example.rmit.local/briefs/vn-campus-map", text: "Brief" } }, number: { estimate: 5 }, createdBy: "thao", createdDaysAgo: 2 },
  { board: "requests", group: "New Requests", name: "Staff induction slide template", requester: ["admin"], owner: ["admin"], status: "not_started", priority: "medium", due: 6, number: { estimate: 3 }, createdBy: "admin", createdDaysAgo: 0 },
  { board: "openday", group: "Production", name: "Sponsor acknowledgement board", owner: ["danh"], status: "not_started", priority: "medium", due: 5, timeline: [1, 5], tags: ["City"], number: { budget: 900 }, createdBy: "priya", createdDaysAgo: 1 },
  { board: "social", group: "Design", name: "Open Day highlights carousel", owner: ["danh"], status: "not_started", priority: "high", due: 9, tags: ["Instagram", "LinkedIn"], checkbox: { approved: false }, createdBy: "chloe", createdDaysAgo: 1 },
  // Other people's week.
  { board: "openday", group: "Planning", name: "Volunteer briefing pack", owner: ["thao"], status: "working", priority: "medium", due: 2, timeline: [-1, 2], tags: ["City", "Brunswick"], number: { budget: 0 }, createdBy: "priya", createdDaysAgo: 3 },
  { board: "social", group: "Writing", name: "Exam period wellbeing tips", owner: ["jane"], status: "working", priority: "medium", due: 3, tags: ["Instagram", "Facebook"], checkbox: { approved: false }, createdBy: "chloe", createdDaysAgo: 2 },
  { board: "masterclass", group: "Internal Review", name: "Masterclass certificate of attendance", owner: ["linh"], status: "waiting", priority: "low", due: 1, text: { format: "A4 PDF" }, tags: ["Global"], createdBy: "danh", createdDaysAgo: 4 },
  { board: "requests", group: "In Progress", name: "Student union election posters", requester: ["grace"], owner: ["tuyet"], status: "working", priority: "high", due: 2, number: { estimate: 4 }, createdBy: "grace", createdDaysAgo: 3 },
];

interface CommentSpec {
  /** Either an item on a base board, or a booking on Task Allocation by title. */
  on: { board: BoardKey; name: string } | { booking: string };
  author: UserKey;
  body: string;
  mentions?: UserKey[];
  hoursAgo: number;
  /** Which mentioned people have already read their notification. */
  readBy?: UserKey[];
  /** Also tell this person (the item's owner) with a read COMMENT notification. */
  ownerNotified?: UserKey;
}

const COMMENTS: CommentSpec[] = [
  { on: { booking: "Executive MBA open lecture posters" }, author: "emily", body: "@Danh Nguyen this one is a good fit for the Vietnam studio — can you place it with Creative Requests? Portraits are already in the shared folder.", mentions: ["danh"], hoursAgo: 96, readBy: ["danh"] },
  { on: { booking: "Careers Week web banners" }, author: "joanne", body: "@Admin Account can you confirm the Careers team have budget approval before we allocate? Last year this came back to us twice.", mentions: ["admin"], hoursAgo: 26 },
  { on: { booking: "Library orientation floor decals" }, author: "admin", body: "Delivered and installed on the ground floor. Library confirmed they are happy — closing this one.", hoursAgo: 60 },
  { on: { board: "rmitinerary", name: "RMITinerary Pragmatist" }, author: "tuyet", body: "Persona illustration v2 is in the shared folder. @Danh Nguyen keen for your eyes before Jane proofs the copy.", mentions: ["danh"], hoursAgo: 2 },
  { on: { board: "openday", name: "Stage backdrop concept" }, author: "priya", body: "Stage supplier confirmed 12 m × 4 m, so the concept can go full-bleed. No more measurement changes after this, promise.", hoursAgo: 8, ownerNotified: "danh" },
  { on: { board: "brand", name: "Typography system – secondary typeface" }, author: "sarah", body: "Leaning towards the humanist option — it pairs better with the wordmark at small sizes. @Danh Nguyen thoughts before Friday's review?", mentions: ["danh"], hoursAgo: 5 },
  { on: { board: "social", name: "Campus in spring – reel" }, author: "chloe", body: "Trimmed to 22 s and music is cleared. Scheduling for Thursday 5 pm unless anyone objects.", hoursAgo: 11 },
  { on: { board: "video", name: "Scholarship campaign 30s TVC" }, author: "joanne", body: "Client wants the scholarship amount larger on the end frame. Otherwise approved — nice work, team.", hoursAgo: 27 },
  { on: { board: "requests", name: "Research showcase LinkedIn carousel" }, author: "grace", body: "Copy for all five cards attached. @Admin Account could you check the research office sign-off is on file before we publish?", mentions: ["admin"], hoursAgo: 9 },
  { on: { board: "website", name: "Course page hero redesign" }, author: "tom", body: "Variant B tested better with prospective students, so we are going with the full-width image and the shorter headline.", hoursAgo: 14 },
  { on: { board: "masterclass", name: "Masterclass social asset – Speaker 1" }, author: "danh", body: "Speaker 1 approved by the events team. Exporting all sizes now. @Emily Carter over to you for the Melbourne push.", mentions: ["emily"], hoursAgo: 1 },
];

interface MessageSpec {
  from: UserKey;
  to: UserKey;
  body: string;
  hoursAgo: number;
  /** Left unread by the recipient (the sidebar badge). */
  unread?: true;
}

const MESSAGES: MessageSpec[] = [
  // Danh ↔ Emily
  { from: "emily", to: "danh", body: "Morning Danh — did the Masterclass hero crop get sorted? Jun wants to publish the landing page on Thursday.", hoursAgo: 70 },
  { from: "danh", to: "emily", body: "Yes, re-cropped at 1280 and 1920. Hil is dropping it into the template this afternoon.", hoursAgo: 69 },
  { from: "emily", to: "danh", body: "Perfect. And the Sem 1 storyboard — can we lock frames 4–7 tomorrow?", hoursAgo: 68.5 },
  { from: "danh", to: "emily", body: "Tomorrow 10am your time works. I'll bring the Saigon South options.", hoursAgo: 68 },
  { from: "emily", to: "danh", body: "Two more bookings came in for Vietnam overnight — the EMBA posters look urgent. Can you place them today?", hoursAgo: 5, unread: true },
  { from: "emily", to: "danh", body: "Also, the DVC office loved the key visual round 2. Nice work.", hoursAgo: 4.5, unread: true },
  // Danh ↔ Joanne
  { from: "joanne", to: "danh", body: "Printer came back on the RMITinerary cover — spot UV is fine but they need the final by Friday.", hoursAgo: 50 },
  { from: "danh", to: "joanne", body: "Noted. Cover artwork is with the stakeholder round now; I'll push the export Thursday night.", hoursAgo: 49 },
  { from: "joanne", to: "danh", body: "Thanks. Budget for the media plan is still stuck with the Director, FYI.", hoursAgo: 48 },
  { from: "danh", to: "joanne", body: "Do you want me to hold the DOOH adaptation until the media plan clears?", hoursAgo: 30 },
  { from: "joanne", to: "danh", body: "No — keep going on DOOH, the network booking is separate. Sign-off should land this week.", hoursAgo: 3 },
  // Danh ↔ Duc
  { from: "duc", to: "danh", body: "Hero film colour grade v2 uploaded. Interviews are warmer now.", hoursAgo: 26 },
  { from: "danh", to: "duc", body: "Looks great. Emily flagged the interviews felt green — should be fixed in this pass.", hoursAgo: 25.5 },
  { from: "duc", to: "danh", body: "Yep, pulled the green out of the skin tones. Also: two of the shopping centre sites are 1080×1350, I've asked Jun for the sheet.", hoursAgo: 25 },
  { from: "danh", to: "duc", body: "Good. Can you also take the persona illustration for the Pragmatist spread? Tuyet needs it by Wednesday.", hoursAgo: 24 },
  { from: "duc", to: "danh", body: "Pragmatist illustration v2 is in the shared folder. Let me know if the colours sit too close to High Achiever.", hoursAgo: 2, unread: true },
  // Danh ↔ Tuyet
  { from: "tuyet", to: "danh", body: "Pull-up banners are in internal review — 850×2000 with 100 mm bleed at the bottom.", hoursAgo: 44 },
  { from: "danh", to: "tuyet", body: "Thanks Tuyet. Leave the bottom 300 mm clear for the stand mechanism.", hoursAgo: 43 },
  { from: "tuyet", to: "danh", body: "Done. Also started the Vietnamese adaptation outline so we're ready when High Achiever is final.", hoursAgo: 42.5 },
  { from: "danh", to: "tuyet", body: "Great — that's next week's priority once the cover is off my desk.", hoursAgo: 42 },
  // Danh ↔ Hil
  { from: "hil", to: "danh", body: "Landing page hero animation is waiting on the approved speaker photos. Placeholders in for now.", hoursAgo: 20 },
  { from: "danh", to: "hil", body: "Emily says photos land Wednesday. Keep the placeholder crop at 16:9 so we don't re-layout.", hoursAgo: 19 },
  { from: "hil", to: "danh", body: "Registration form fix is deployed — can you retest the Vietnam number format when you have a minute?", hoursAgo: 1.5, unread: true },
  // Admin ↔ Danh
  { from: "admin", to: "danh", body: "Hi Danh — the booking link is live on the intranet page. Bookings should start arriving this week.", hoursAgo: 72 },
  { from: "danh", to: "admin", body: "Thanks. I'll allocate from Task Allocation each morning; Emily has the Melbourne ones.", hoursAgo: 71 },
  { from: "danh", to: "admin", body: "Five new requests in the queue this morning. Can you check the Careers Week one has budget approval before I place it?", hoursAgo: 6, unread: true },
  { from: "danh", to: "admin", body: "Also the library decals job is delivered — I've closed it.", hoursAgo: 0.5, unread: true },
];

const PRODUCTION_STATUS_COLORS: Record<string, string> = {
  Briefed: "DDEBF7",
  "In progress": "FFEB9C",
  "Internal review": "EBB5DB",
  "With client": "D9E1F2",
  Delivered: "C6EFCE",
  "On hold": "FFC7CE",
};

/** Asset lines for a few of the fresh items, so the Assets tab and recap column have examples outside Task Allocation. */
const FRESH_ASSETS: Record<string, Array<{ name: string; type: string | null; quantity: number | null; owner?: UserKey; due?: number; notes?: string }>> = {
  "masterclass:Masterclass social asset – Speaker 4": [
    { name: "Instagram tile", type: "Social", quantity: 3, owner: "danh", due: 2, notes: "1080×1080" },
    { name: "Story", type: "Social", quantity: 3, owner: "danh", due: 2, notes: "1080×1920, safe zones" },
    { name: "LinkedIn banner", type: "Digital", quantity: 1, owner: "tuyet", due: 3, notes: "1584×396" },
  ],
  "openday:Sponsor acknowledgement board": [
    { name: "Foamboard panel", type: "Print", quantity: 2, owner: "danh", due: 5, notes: "A0, 5 mm foamboard" },
    { name: "Digital screen slide", type: "Digital", quantity: 1, owner: "duc", due: 4, notes: "1920×1080" },
  ],
  "requests:Vietnam campus map refresh": [
    { name: "Campus map (print)", type: "Print", quantity: 1, owner: "danh", due: 4, notes: "A3, CMYK" },
    { name: "Campus map (web)", type: "Web", quantity: 1, owner: "hil", due: 4, notes: "SVG + PNG @2x" },
    { name: "Wayfinding icons", type: "Brand", quantity: 12, due: 6 },
  ],
  "social:Open Day highlights carousel": [
    { name: "Carousel card", type: "Social", quantity: 6, owner: "danh", due: 9, notes: "1080×1080" },
    { name: "Reel cover", type: "Social", quantity: 1, owner: "chloe", due: 9 },
  ],
};

export function buildSeedExtras(ctx: SeedExtrasContext): SeedBundle {
  const { now, workspaceId, sid, users, userNames, teams, teamNameOf, boards, admins, teamNames, lookups } = ctx;
  const iso = (d: Date) => d.toISOString();
  const day = (offset: number) => toISODate(addDays(now, offset));
  const firstName = (key: UserKey) => userNames[key].split(" ")[0]!;
  const deliveryFor = (type: NotificationType) => (DEFAULT_TYPE_DELIVERY[type] === "UPDATE" ? "UPDATE" : "NOTIFICATION") as Notification["delivery"];

  const teamRows: Team[] = [];
  const teamMembers: TeamMember[] = [];
  const boardRows: Board[] = [];
  const boardMembers: BoardMember[] = [];
  const boardGroups: BoardGroup[] = [];
  const boardColumns: BoardColumn[] = [];
  const items: Item[] = [];
  const itemColumnValues: ItemColumnValue[] = [];
  const itemAssets: ItemAsset[] = [];
  const itemLinks: ItemLink[] = [];
  const trackers: Tracker[] = [];
  const trackerSheets: TrackerSheet[] = [];
  const comments: Comment[] = [];
  const activities: Activity[] = [];
  const notifications: Notification[] = [];
  const directMessages: DirectMessage[] = [];

  const pushValue = (itemId: string, column: BoardColumn | null | undefined, value: ColumnValue | null, at: Date) => {
    if (!column || value === null) return;
    itemColumnValues.push({ id: sid("extraValue"), itemId, columnId: column.id, value, updatedAt: iso(at) });
  };
  const activity = (a: Omit<Activity, "id" | "workspaceId">) => activities.push({ ...a, id: sid("extraActivity"), workspaceId });
  const notify = (n: Omit<Notification, "id" | "delivery">) => notifications.push({ ...n, id: sid("extraNotification"), delivery: deliveryFor(n.type) });

  // ---- a. Task booking: the built-in Admin team and Task Allocation board ---
  const systemCreated = subDays(now, 30);
  const adminTeamId = sid("extra");
  teamRows.push({
    id: adminTeamId,
    workspaceId,
    name: SYSTEM_TEAM.name,
    description: SYSTEM_TEAM.description,
    color: SYSTEM_TEAM.color,
    icon: SYSTEM_TEAM.icon,
    archivedAt: null,
    system: "ADMIN",
    bookingBoardId: null,
    createdAt: iso(systemCreated),
    updatedAt: iso(systemCreated),
  });
  for (const key of admins) teamMembers.push({ id: sid("extraMember"), teamId: adminTeamId, userId: users[key], role: key === "danh" ? "LEAD" : "MEMBER" });

  const allocationBoardId = sid("extra");
  const allocationBoard: Board = {
    id: allocationBoardId,
    workspaceId,
    teamId: adminTeamId,
    name: SYSTEM_BOARD.name,
    slug: slugify(SYSTEM_BOARD.name),
    description: SYSTEM_BOARD.description,
    type: "MAIN",
    visibility: "TEAM",
    ownerId: users.danh,
    color: SYSTEM_BOARD.color,
    icon: SYSTEM_BOARD.icon,
    archivedAt: null,
    system: "TASK_ALLOCATION",
    createdAt: iso(systemCreated),
    updatedAt: iso(subHours(now, 3)),
  };
  boardRows.push(allocationBoard);
  for (const key of admins) boardMembers.push({ id: sid("extraMember"), boardId: allocationBoardId, userId: users[key], role: key === "danh" ? "OWNER" : "EDITOR" });

  const allocationGroups = new Map<LabelGroup, BoardGroup>();
  SYSTEM_BOARD_GROUPS.forEach((g, index) => {
    const group: BoardGroup = { id: sid("extra"), boardId: allocationBoardId, name: g.name, color: g.color, position: index, collapsed: false, createdAt: iso(systemCreated) };
    allocationGroups.set(g.name, group);
    boardGroups.push(group);
  });
  const allocationColumns: BoardColumn[] = taskAllocationColumns(teamNames).map((c, index) => ({
    id: sid("extra"),
    boardId: allocationBoardId,
    name: c.name,
    type: c.type,
    settings: c.settings ?? defaultSettingsFor(c.type),
    position: index,
    width: DEFAULT_COLUMN_WIDTHS[c.type],
    hidden: false,
    createdAt: iso(systemCreated),
  }));
  boardColumns.push(...allocationColumns);
  activity({ boardId: allocationBoardId, itemId: null, actorId: users.danh, eventType: "BOARD_CREATED", metadata: { boardName: allocationBoard.name }, createdAt: iso(systemCreated) });

  const allocationStatus = allocationColumns.find((c) => c.type === "STATUS")!;
  const allocatedTo = allocationColumns.find((c) => c.type === "TEXT" && c.name.toLowerCase().includes("allocated"))!;
  const allocationRecap = allocationColumns.find((c) => c.type === "ASSETS_RECAP") ?? null;

  // ---- a. Stakeholder bookings -----------------------------------------------
  const bookingItemByTitle = new Map<string, Item>();
  const positionInGroup = new Map<string, number>();
  const nextPosition = (groupId: string, start = 0) => {
    const position = positionInGroup.get(groupId) ?? start;
    positionInGroup.set(groupId, position + 1);
    return position;
  };

  for (const spec of BOOKINGS) {
    const booked = subHours(now, spec.bookedHoursAgo);
    const team = spec.team ? { id: teams[spec.team], name: teamNameOf[spec.team] } : null;
    const request: BookingRequest = {
      requesterName: spec.requesterName,
      requesterEmail: spec.requesterEmail,
      department: spec.department,
      title: spec.title,
      brief: spec.brief,
      assetTypes: spec.assetTypes,
      assets: spec.assets,
      teamId: team?.id ?? null,
      dueDate: day(spec.due),
      priority: spec.priority,
      referenceUrl: spec.referenceUrl,
      extra: {},
    };
    const group = allocationGroups.get(spec.group)!;
    const placement = mapBookingToColumns(request, allocationColumns, { team });
    const item: Item = {
      id: sid("extraItem"),
      boardId: allocationBoardId,
      groupId: group.id,
      parentItemId: null,
      name: spec.title,
      description: describeBooking(request, placement),
      position: nextPosition(group.id),
      createdBy: users.danh,
      archivedAt: null,
      createdAt: iso(booked),
      updatedAt: iso(spec.allocate ? subHours(now, spec.allocate.hoursAgo) : booked),
    };
    items.push(item);
    bookingItemByTitle.set(spec.title, item);
    for (const v of placement.values) pushValue(item.id, allocationColumns.find((c) => c.id === v.columnId), v.value, booked);
    pushValue(item.id, allocationStatus, { type: "STATUS", labelId: spec.status }, booked);

    spec.assets.forEach((asset, index) => {
      const sub: Item = {
        id: sid("extraItem"),
        boardId: allocationBoardId,
        groupId: group.id,
        parentItemId: item.id,
        name: formatAssetLine({ ...asset, spec: null }),
        description: asset.spec?.trim() || null,
        position: index,
        createdBy: users.danh,
        archivedAt: null,
        createdAt: iso(booked),
        updatedAt: iso(booked),
      };
      items.push(sub);
      pushValue(sub.id, allocationStatus, { type: "STATUS", labelId: spec.status === "done" ? "done" : "not_started" }, booked);
    });

    // The same deliverables as lines on the item's Assets tab — type, quantity,
    // who is on it once allocated, due date — and the recap the board shows.
    const lineType = spec.assetTypes.length === 1 ? spec.assetTypes[0]! : null;
    const bookingLines: ItemAsset[] = spec.assets.map((asset, index) => ({
      id: sid("extraAsset"),
      itemId: item.id,
      boardId: allocationBoardId,
      name: asset.name,
      assetType: lineType,
      quantity: asset.quantity,
      assigneeId: spec.allocate ? users[spec.allocate.owner] : null,
      dueDate: request.dueDate,
      notes: asset.spec?.trim() || null,
      position: index,
      createdBy: users.danh,
      createdAt: iso(booked),
      updatedAt: iso(spec.allocate ? subHours(now, spec.allocate.hoursAgo) : booked),
    }));
    itemAssets.push(...bookingLines);
    pushValue(item.id, allocationRecap, recapColumnValue(recapAssets(bookingLines, day(0))), booked);

    activity({ boardId: allocationBoardId, itemId: item.id, actorId: users.danh, eventType: "ITEM_CREATED", metadata: { itemName: spec.title, boardName: allocationBoard.name, groupName: "Incoming" }, createdAt: iso(booked) });

    const where = team ? `for ${team.name}` : "to Task Allocation";
    for (const key of admins) {
      notify({
        userId: users[key],
        type: "TASK_BOOKED",
        title: `${spec.requesterName} booked “${spec.title}” ${where}`,
        body: `Due ${request.dueDate}. Open it on ${allocationBoard.name} to review and allocate.`,
        entityType: "ITEM",
        entityId: item.id,
        boardId: allocationBoardId,
        actorId: users.danh,
        readAt: spec.readBy.includes(key) ? iso(addMinutes(booked, 90)) : null,
        createdAt: iso(booked),
      });
    }

    if (spec.allocate) {
      const { board: targetKey, owner: targetOwner } = spec.allocate;
      const allocatedAt = subHours(now, spec.allocate.hoursAgo);
      const targetBoardId = boards[targetKey];
      const targetName = lookups.boardName(targetKey);
      const targetGroup = lookups.groups(targetKey)[0]!;
      const targetColumns = lookups.columns(targetKey);
      const mirror: Item = {
        id: sid("extraItem"),
        boardId: targetBoardId,
        groupId: targetGroup.id,
        parentItemId: null,
        name: spec.title,
        description: item.description,
        position: 40 + nextPosition(`mirror:${targetGroup.id}`),
        createdBy: users.danh,
        archivedAt: null,
        createdAt: iso(allocatedAt),
        updatedAt: iso(allocatedAt),
      };
      items.push(mirror);
      const mirrored = mapBookingToColumns(request, targetColumns, { team });
      for (const v of mirrored.values) pushValue(mirror.id, targetColumns.find((c) => c.id === v.columnId), v.value, allocatedAt);
      pushValue(mirror.id, lookups.column(targetKey, "status"), { type: "STATUS", labelId: spec.status }, allocatedAt);
      pushValue(mirror.id, lookups.column(targetKey, "owner"), { type: "PERSON", userIds: [users[targetOwner]] }, allocatedAt);
      spec.assets.forEach((asset, index) => {
        const copy: Item = {
          id: sid("extraItem"),
          boardId: targetBoardId,
          groupId: targetGroup.id,
          parentItemId: mirror.id,
          name: formatAssetLine({ ...asset, spec: null }),
          description: asset.spec?.trim() || null,
          position: index,
          createdBy: users.danh,
          archivedAt: null,
          createdAt: iso(allocatedAt),
          updatedAt: iso(allocatedAt),
        };
        items.push(copy);
        pushValue(copy.id, lookups.column(targetKey, "status"), { type: "STATUS", labelId: "not_started" }, allocatedAt);
      });
      pushValue(item.id, allocatedTo, { type: "TEXT", text: targetName }, allocatedAt);
      const mirrorLines = bookingLines.map((line, index) => ({ ...line, id: sid("extraAsset"), itemId: mirror.id, boardId: targetBoardId, assigneeId: users[targetOwner], position: index, createdAt: iso(allocatedAt), updatedAt: iso(allocatedAt) }));
      itemAssets.push(...mirrorLines);
      pushValue(mirror.id, targetColumns.find((c) => c.type === "ASSETS_RECAP"), recapColumnValue(recapAssets(mirrorLines, day(0))), allocatedAt);

      const [itemAId, itemBId] = normaliseLinkPair(item.id, mirror.id);
      itemLinks.push({ id: sid("extraLink"), workspaceId, itemAId, itemBId, excluded: [], createdBy: users.danh, createdAt: iso(allocatedAt) });
      activity({ boardId: targetBoardId, itemId: mirror.id, actorId: users.danh, eventType: "ITEM_CREATED", metadata: { itemName: spec.title, boardName: targetName, groupName: targetGroup.name }, createdAt: iso(allocatedAt) });
      activity({ boardId: allocationBoardId, itemId: item.id, actorId: users.danh, eventType: "ITEM_LINKED", metadata: { itemName: spec.title, linkedItemName: spec.title, linkedBoardName: targetName }, createdAt: iso(allocatedAt) });
      activity({ boardId: targetBoardId, itemId: mirror.id, actorId: users.danh, eventType: "ITEM_LINKED", metadata: { itemName: spec.title, linkedItemName: spec.title, linkedBoardName: allocationBoard.name }, createdAt: iso(allocatedAt) });
      notify({
        userId: users[targetOwner],
        type: "ASSIGNED",
        title: `Danh assigned you to ${spec.title}`,
        body: `${targetName} · ${targetGroup.name}`,
        entityType: "ITEM",
        entityId: mirror.id,
        boardId: targetBoardId,
        actorId: users.danh,
        readAt: null,
        createdAt: iso(allocatedAt),
      });
    }
  }

  // ---- e. Fresh work on the existing boards ----------------------------------
  const freshItemByName = new Map<string, Item>();
  FRESH_ITEMS.forEach((spec, index) => {
    const created = subDays(now, spec.createdDaysAgo);
    const groupId = lookups.groupId(spec.board, spec.group);
    const item: Item = {
      id: sid("extraItem"),
      boardId: boards[spec.board],
      groupId,
      parentItemId: null,
      name: spec.name,
      description: spec.description ?? null,
      position: 60 + index,
      createdBy: users[spec.createdBy],
      archivedAt: null,
      createdAt: iso(created),
      updatedAt: iso(subHours(now, 4)),
    };
    items.push(item);
    freshItemByName.set(`${spec.board}:${spec.name}`, item);
    (FRESH_ASSETS[`${spec.board}:${spec.name}`] ?? []).forEach((line, lineIndex) => {
      itemAssets.push({
        id: sid("extraAsset"),
        itemId: item.id,
        boardId: item.boardId,
        name: line.name,
        assetType: line.type,
        quantity: line.quantity,
        assigneeId: line.owner ? users[line.owner] : null,
        dueDate: line.due === undefined ? null : day(line.due),
        notes: line.notes ?? null,
        position: lineIndex,
        createdBy: users[spec.createdBy],
        createdAt: iso(created),
        updatedAt: iso(created),
      });
    });
    const column = (key: string) => lookups.column(spec.board, key);
    const at = subHours(now, 4);
    if (spec.owner) pushValue(item.id, column("owner"), { type: "PERSON", userIds: spec.owner.map((k) => users[k]) }, at);
    if (spec.requester) pushValue(item.id, column("requester"), { type: "PERSON", userIds: spec.requester.map((k) => users[k]) }, at);
    if (spec.status) pushValue(item.id, column("status"), { type: "STATUS", labelId: spec.status }, at);
    if (spec.priority) pushValue(item.id, column("priority"), { type: "PRIORITY", labelId: spec.priority }, at);
    if (spec.due !== undefined) pushValue(item.id, column("due"), { type: "DATE", date: day(spec.due) }, at);
    if (spec.timeline) pushValue(item.id, column("timeline"), { type: "TIMELINE", start: day(spec.timeline[0]), end: day(spec.timeline[1]) }, at);
    if (spec.tags) pushValue(item.id, column("channel") ?? column("market"), { type: "TAGS", tags: spec.tags }, at);
    for (const [key, text] of Object.entries(spec.text ?? {})) {
      const target = column(key);
      pushValue(item.id, target, target?.type === "LONG_TEXT" ? { type: "LONG_TEXT", text } : { type: "TEXT", text }, at);
    }
    for (const [key, number] of Object.entries(spec.number ?? {})) pushValue(item.id, column(key), { type: "NUMBER", number }, at);
    for (const [key, checked] of Object.entries(spec.checkbox ?? {})) pushValue(item.id, column(key), { type: "CHECKBOX", checked }, at);
    for (const [key, link] of Object.entries(spec.link ?? {})) pushValue(item.id, column(key), { type: "LINK", url: link.url, text: link.text }, at);
    activity({ boardId: item.boardId, itemId: item.id, actorId: item.createdBy, eventType: "ITEM_CREATED", metadata: { itemName: spec.name, boardName: lookups.boardName(spec.board), groupName: spec.group }, createdAt: iso(created) });
  });

  // ---- d. Updates and the notifications they raise ---------------------------
  const resolve = (on: CommentSpec["on"]): { itemId: string; boardId: string; itemName: string } => {
    if ("booking" in on) {
      const item = bookingItemByTitle.get(on.booking);
      if (!item) throw new Error(`Seed booking ${on.booking} missing`);
      return { itemId: item.id, boardId: allocationBoardId, itemName: item.name };
    }
    return { itemId: lookups.itemId(on.board, on.name), boardId: boards[on.board], itemName: on.name };
  };
  for (const spec of COMMENTS) {
    const target = resolve(spec.on);
    const at = subHours(now, spec.hoursAgo);
    const comment: Comment = {
      id: sid("extraComment"),
      itemId: target.itemId,
      authorId: users[spec.author],
      body: spec.body,
      mentionUserIds: (spec.mentions ?? []).map((k) => users[k]),
      sharedId: null,
      createdAt: iso(at),
      updatedAt: iso(at),
    };
    comments.push(comment);
    activity({ boardId: target.boardId, itemId: target.itemId, actorId: comment.authorId, eventType: "COMMENT_ADDED", metadata: { itemName: target.itemName }, createdAt: iso(at) });
    const snippet = spec.body.replace(/@[A-Z][a-z]+ [A-Z][a-z]+ ?/g, "").trim();
    for (const key of spec.mentions ?? []) {
      notify({
        userId: users[key],
        type: "MENTION",
        title: `${firstName(spec.author)} mentioned you in ${target.itemName}`,
        body: snippet.length > 140 ? `${snippet.slice(0, 137)}…` : snippet,
        entityType: "ITEM",
        entityId: target.itemId,
        boardId: target.boardId,
        actorId: comment.authorId,
        readAt: spec.readBy?.includes(key) ? iso(addMinutes(at, 45)) : null,
        createdAt: iso(at),
      });
    }
    if (spec.ownerNotified) {
      notify({
        userId: users[spec.ownerNotified],
        type: "COMMENT",
        title: `${firstName(spec.author)} commented on ${target.itemName}`,
        body: snippet.length > 140 ? `${snippet.slice(0, 137)}…` : snippet,
        entityType: "ITEM",
        entityId: target.itemId,
        boardId: target.boardId,
        actorId: comment.authorId,
        readAt: iso(addMinutes(at, 30)),
        createdAt: iso(at),
      });
    }
  }

  // Sarah brings Danh onto the brand board for the typography work.
  const invitedAt = subHours(now, 7);
  boardMembers.push({ id: sid("extraMember"), boardId: boards.brand, userId: users.danh, role: "EDITOR" });
  activity({ boardId: boards.brand, itemId: null, actorId: users.sarah, eventType: "MEMBER_ADDED", metadata: { boardName: lookups.boardName("brand"), memberName: userNames.danh }, createdAt: iso(invitedAt) });
  notify({ userId: users.danh, type: "BOARD_INVITE", title: `Sarah added you to ${lookups.boardName("brand")}`, body: "You can now edit items on this board.", entityType: "BOARD", entityId: boards.brand, boardId: boards.brand, actorId: users.sarah, readAt: null, createdAt: iso(invitedAt) });

  // A few already-read ones, so "Unread only" has something to hide.
  const globalCitizen = freshItemByName.get("rmitinerary:RMITinerary Global Citizen")!;
  notify({ userId: users.danh, type: "STATUS_CHANGED", title: "Volunteer briefing pack is now Working On It", body: "Thao changed the status from Not Started", entityType: "ITEM", entityId: freshItemByName.get("openday:Volunteer briefing pack")!.id, boardId: boards.openday, actorId: users.thao, readAt: iso(subHours(now, 20)), createdAt: iso(subHours(now, 21)) });
  notify({ userId: users.danh, type: "DUE_DATE_CHANGED", title: "Due date changed for RMITinerary Global Citizen", body: `Joanne moved the due date to ${day(1)}`, entityType: "ITEM", entityId: globalCitizen.id, boardId: boards.rmitinerary, actorId: users.joanne, readAt: iso(subHours(now, 26)), createdAt: iso(subHours(now, 28)) });
  notify({ userId: users.admin, type: "ASSIGNED", title: "Grace assigned you to Masterclass thank-you email header", body: "Masterclass Assets · Briefing", entityType: "ITEM", entityId: freshItemByName.get("masterclass:Masterclass thank-you email header")!.id, boardId: boards.masterclass, actorId: users.grace, readAt: iso(subHours(now, 2)), createdAt: iso(subHours(now, 3)) });
  notify({ userId: users.admin, type: "STATUS_CHANGED", title: "Library orientation floor decals is now Done", body: "Danh changed the status from Working On It", entityType: "ITEM", entityId: bookingItemByTitle.get("Library orientation floor decals")!.id, boardId: allocationBoardId, actorId: users.danh, readAt: iso(subHours(now, 58)), createdAt: iso(subHours(now, 61)) });

  // ---- b. Direct messages ----------------------------------------------------
  for (const spec of MESSAGES) {
    const at = subHours(now, spec.hoursAgo);
    directMessages.push({
      id: sid("extraMessage"),
      workspaceId,
      senderId: users[spec.from],
      recipientId: users[spec.to],
      body: spec.body,
      readAt: spec.unread ? null : iso(addMinutes(at, 20)),
      createdAt: iso(at),
    });
  }

  // ---- c. Trackers -----------------------------------------------------------
  const monthStart = startOfMonth(now);
  const productionColumns: Array<{ key: string } & Omit<TrackerColumn, "id">> = [
    { key: "job", name: "Job", type: "text", width: 230 },
    { key: "client", name: "Client / School", type: "text", width: 190 },
    { key: "channel", name: "Channel", type: "list", width: 120, options: ["Print", "Social", "Web", "Video", "DOOH", "Email", "Event"] },
    { key: "sizes", name: "Sizes / Format", type: "text", width: 180 },
    { key: "designer", name: "Designer", type: "list", width: 120, options: ["Danh", "Duc", "Tuyet", "Hil", "Linh", "Minh", "Thao"] },
    { key: "status", name: "Status", type: "list", width: 150, options: Object.keys(PRODUCTION_STATUS_COLORS), optionColors: PRODUCTION_STATUS_COLORS },
    { key: "briefed", name: "Briefed", type: "date", width: 120 },
    { key: "due", name: "Due", type: "date", width: 120 },
    { key: "delivered", name: "Delivered", type: "checkbox", width: 100, summary: "percentChecked" },
    { key: "hours", name: "Hours", type: "number", width: 100, numberFormat: "decimal", summary: "sum" },
    { key: "notes", name: "Notes", type: "longText", width: 280 },
  ];
  const trackerColumns = (specs: typeof productionColumns): { columns: TrackerColumn[]; ids: Record<string, string> } => {
    const ids: Record<string, string> = {};
    const columns = specs.map(({ key, ...column }) => {
      const id = sid("extraTracker");
      ids[key] = id;
      return { id, ...column } as TrackerColumn;
    });
    return { columns, ids };
  };

  const productionLog: Tracker = {
    id: sid("extraTracker"),
    workspaceId,
    teamId: teams.vietnam,
    name: "Vietnam Studio Production Log",
    description: "Every job through the Ho Chi Minh City studio — one row per job, a sheet per month, hours logged for the monthly report.",
    createdBy: users.danh,
    createdAt: iso(subDays(now, 40)),
    updatedAt: iso(subHours(now, 2)),
  };
  trackers.push(productionLog);
  const weekLabel = (start: Date) => `Week of ${format(start, "d MMM")}`;
  const monthDay = (base: Date, offset: number) => toISODate(addDays(base, offset));
  const thisMonth: DemoRowSpec[] = [
    { section: weekLabel(monthStart) },
    { cells: { job: "Masterclass social tiles – Speaker 1", client: "Events – Masterclass series", channel: "Social", sizes: "1080×1080, 1080×1920", designer: "Danh", status: "Delivered", briefed: monthDay(monthStart, 0), due: monthDay(monthStart, 4), delivered: true, hours: 6.5, notes: "Approved first round." } },
    { cells: { job: "Pull-up banners – Masterclass", client: "Events – Masterclass series", channel: "Print", sizes: "850×2000 mm", designer: "Tuyet", status: "Internal review", briefed: monthDay(monthStart, 1), due: monthDay(monthStart, 9), delivered: false, hours: 4, notes: "Keep bottom 300 mm clear for the stand." } },
    { cells: { job: "Airport lounge screen – arrivals", client: "Campaigns – Sem 1", channel: "DOOH", sizes: "3840×1080 @ 15 s", designer: "Duc", status: "In progress", briefed: monthDay(monthStart, 2), due: monthDay(monthStart, 12), delivered: false, hours: 3, notes: "Specs still unconfirmed for the arrivals wall." } },
    { section: weekLabel(addDays(monthStart, 7)) },
    { cells: { job: "RMITinerary High Achiever – final export", client: "Student Recruitment", channel: "Print", sizes: "A4 4pp", designer: "Danh", status: "Delivered", briefed: monthDay(monthStart, 7), due: monthDay(monthStart, 11), delivered: true, hours: 5, notes: "" } },
    { cells: { job: "Scholarship info session slides", client: "Student Recruitment", channel: "Event", sizes: "16:9 PowerPoint", designer: "Linh", status: "Briefed", briefed: monthDay(monthStart, 8), due: monthDay(monthStart, 15), delivered: false, hours: 0, notes: "Template from Brand refresh." } },
    { cells: { job: "Student services icon set", client: "Digital – Website", channel: "Web", sizes: "24 icons, SVG", designer: "Hil", status: "In progress", briefed: monthDay(monthStart, 8), due: monthDay(monthStart, 14), delivered: false, hours: 7.5, notes: "" } },
    { section: weekLabel(addDays(monthStart, 14)) },
    { cells: { job: "Executive MBA open lecture posters", client: "Graduate School of Business & Law", channel: "Print", sizes: "A2 ×6, 1920×1080 slide", designer: "Tuyet", status: "In progress", briefed: monthDay(monthStart, 14), due: monthDay(monthStart, 20), delivered: false, hours: 2, notes: "Booked through the intake form; six speakers." } },
    { cells: { job: "Hero film – colour grade", client: "Campaigns – Sem 1", channel: "Video", sizes: "Master + 6 cutdowns", designer: "Duc", status: "With client", briefed: monthDay(monthStart, 15), due: monthDay(monthStart, 21), delivered: false, hours: 12, notes: "v2 warmer on the interviews." } },
    { cells: { job: "Campus in spring – reel", client: "Content – Social Q4", channel: "Social", sizes: "1080×1920, 22 s", designer: "Minh", status: "With client", briefed: monthDay(monthStart, 16), due: monthDay(monthStart, 19), delivered: false, hours: 3.5, notes: "" } },
    { section: weekLabel(addDays(monthStart, 21)) },
    { cells: { job: "Vietnam campus map refresh", client: "Studio Coordination", channel: "Print", sizes: "A3 + web tile", designer: "Danh", status: "In progress", briefed: monthDay(monthStart, 21), due: monthDay(monthStart, 27), delivered: false, hours: 1.5, notes: "New building names from Facilities." } },
    { cells: { job: "Faculty stall kits", client: "Events – Open Day", channel: "Event", sizes: "Tablecloth, A-frame, badges", designer: "Thao", status: "Briefed", briefed: monthDay(monthStart, 22), due: monthDay(monthStart, 29), delivered: false, hours: 0, notes: "" } },
    { cells: { job: "Vietnamese language adaptation – RMITinerary", client: "Student Recruitment – Vietnam", channel: "Print", sizes: "A4 4pp ×4", designer: "Tuyet", status: "On hold", briefed: monthDay(monthStart, 23), due: monthDay(monthStart, 30), delivered: false, hours: 0, notes: "Waits on the English masters." } },
  ];
  const nextMonthStart = addMonths(monthStart, 1);
  const nextMonth: DemoRowSpec[] = [
    { section: weekLabel(nextMonthStart) },
    { cells: { job: "Open Day directional signage", client: "Events – Open Day", channel: "Print", sizes: "120 units, A1 + A2", designer: "Tuyet", status: "Briefed", briefed: monthDay(nextMonthStart, 0), due: monthDay(nextMonthStart, 9), delivered: false, hours: 0, notes: "Facilities to confirm frame sizes." } },
    { cells: { job: "Welcome video loop – 60s", client: "Events – Open Day", channel: "Video", sizes: "1920×1080, no audio", designer: "Minh", status: "Briefed", briefed: monthDay(nextMonthStart, 1), due: monthDay(nextMonthStart, 10), delivered: false, hours: 0, notes: "" } },
    { cells: { job: "Chinese language adaptation – RMITinerary", client: "Student Recruitment – International", channel: "Print", sizes: "A4 4pp ×4", designer: "Duc", status: "Briefed", briefed: monthDay(nextMonthStart, 2), due: monthDay(nextMonthStart, 16), delivered: false, hours: 0, notes: "Typesetting vendor booked." } },
    { section: weekLabel(addDays(nextMonthStart, 7)) },
    { cells: { job: "Alumni quote tiles – 6 pack", client: "Content – Social Q4", channel: "Social", sizes: "1080×1080 ×6", designer: "Linh", status: "Briefed", briefed: monthDay(nextMonthStart, 7), due: monthDay(nextMonthStart, 12), delivered: false, hours: 0, notes: "" } },
    { cells: { job: "Metro station wall – Ben Thanh", client: "Campaigns – Sem 1", channel: "DOOH", sizes: "1920×1080 @ 8 s", designer: "Duc", status: "Briefed", briefed: monthDay(nextMonthStart, 8), due: monthDay(nextMonthStart, 15), delivered: false, hours: 0, notes: "" } },
    { cells: { job: "Research impact video – 90s", client: "STEM College", channel: "Video", sizes: "16:9 4K + 2 cutdowns", designer: "Minh", status: "Briefed", briefed: monthDay(nextMonthStart, 9), due: monthDay(nextMonthStart, 28), delivered: false, hours: 0, notes: "Lab access weekday mornings." } },
    { section: weekLabel(addDays(nextMonthStart, 14)) },
    { cells: { job: "PowerPoint and Word templates", client: "Brand", channel: "Print", sizes: "16:9 + A4", designer: "Linh", status: "On hold", briefed: monthDay(nextMonthStart, 14), due: monthDay(nextMonthStart, 25), delivered: false, hours: 0, notes: "Needs the secondary typeface decision." } },
    { cells: { job: "Volunteer t-shirt design", client: "Events – Open Day", channel: "Event", sizes: "Front + back, 2 colours", designer: "Linh", status: "Briefed", briefed: monthDay(nextMonthStart, 15), due: monthDay(nextMonthStart, 22), delivered: false, hours: 0, notes: "" } },
    { cells: { job: "Sponsor acknowledgement board", client: "Events – Open Day", channel: "Print", sizes: "2400×1200 mm foamboard", designer: "Danh", status: "Briefed", briefed: monthDay(nextMonthStart, 16), due: monthDay(nextMonthStart, 24), delivered: false, hours: 0, notes: "" } },
    { cells: {} },
    { cells: {} },
    { cells: {} },
  ];
  const sheetA = trackerColumns(productionColumns);
  const sheetB = trackerColumns(productionColumns);
  trackerSheets.push(
    { id: sid("extraTracker"), trackerId: productionLog.id, name: format(monthStart, "MMMM"), position: 0, columns: sheetA.columns, rows: buildRows(thisMonth, sheetA.ids, () => sid("extraTracker")), frozenColumns: 2, createdAt: iso(subDays(now, 40)), updatedAt: iso(subHours(now, 2)) },
    { id: sid("extraTracker"), trackerId: productionLog.id, name: format(nextMonthStart, "MMMM"), position: 1, columns: sheetB.columns, rows: buildRows(nextMonth, sheetB.ids, () => sid("extraTracker")), frozenColumns: 2, createdAt: iso(subDays(now, 6)), updatedAt: iso(subDays(now, 1)) },
  );

  const runSheetColumns: typeof productionColumns = [
    { key: "time", name: "Time", type: "text", width: 90 },
    { key: "activity", name: "Activity", type: "text", width: 260 },
    { key: "location", name: "Location", type: "list", width: 190, options: ["Main Stage", "Building 80 Foyer", "Alumni Courtyard", "Library Lawn", "Swanston Academic Building", "Registration Tent"] },
    { key: "owner", name: "Owner", type: "list", width: 130, options: ["Priya", "Joanne", "Thao", "Tuyet", "Volunteers", "AV crew"] },
    { key: "collateral", name: "Collateral needed", type: "text", width: 240 },
    { key: "ready", name: "Ready", type: "checkbox", width: 90, summary: "percentChecked" },
    { key: "notes", name: "Notes", type: "longText", width: 260 },
  ];
  const runSheet: Tracker = {
    id: sid("extraTracker"),
    workspaceId,
    teamId: teams.events,
    name: "Open Day 2026 Run Sheet",
    description: "Minute-by-minute plan for Open Day across the City campus, with the collateral each moment needs.",
    createdBy: users.priya,
    createdAt: iso(subDays(now, 12)),
    updatedAt: iso(subHours(now, 6)),
  };
  trackers.push(runSheet);
  const runRows: DemoRowSpec[] = [
    { section: "Morning" },
    { cells: { time: "07:00", activity: "Crew call, radios and lanyards issued", location: "Registration Tent", owner: "Thao", collateral: "Volunteer t-shirts ×80, lanyards, run sheet printouts", ready: true, notes: "" } },
    { cells: { time: "07:30", activity: "Signage and wayfinding walk-through", location: "Building 80 Foyer", owner: "Tuyet", collateral: "Directional signage – 120 units, campus map A0 ×6", ready: false, notes: "Contrast check on the black-on-red arrows pending." } },
    { cells: { time: "08:00", activity: "Stage sound check and welcome loop test", location: "Main Stage", owner: "AV crew", collateral: "Welcome video loop 60 s, stage backdrop 12 × 4 m", ready: false, notes: "Backdrop artwork still in review." } },
    { cells: { time: "08:30", activity: "Faculty stalls set up", location: "Alumni Courtyard", owner: "Volunteers", collateral: "Faculty stall kits ×14, table talkers", ready: false, notes: "" } },
    { cells: { time: "09:00", activity: "Gates open, registration", location: "Registration Tent", owner: "Priya", collateral: "Programme booklet A5 ×3000, wristbands", ready: true, notes: "" } },
    { cells: { time: "09:30", activity: "Welcome address – Vice-Chancellor", location: "Main Stage", owner: "Joanne", collateral: "Slides 16:9, lectern sign", ready: true, notes: "" } },
    { cells: { time: "10:00", activity: "Campus tours depart every 20 minutes", location: "Building 80 Foyer", owner: "Volunteers", collateral: "Tour route cards, flags ×12", ready: true, notes: "" } },
    { cells: { time: "11:00", activity: "Course information sessions – block 1", location: "Swanston Academic Building", owner: "Joanne", collateral: "Room signage, session slides ×9", ready: false, notes: "Two decks still with the schools." } },
    { section: "Afternoon" },
    { cells: { time: "12:00", activity: "Student life showcase and food trucks", location: "Library Lawn", owner: "Priya", collateral: "Feather flags ×10, social story templates", ready: true, notes: "" } },
    { cells: { time: "13:00", activity: "Scholarships and pathways talk", location: "Main Stage", owner: "Joanne", collateral: "Slides 16:9, scholarship flyer A5 ×1000", ready: false, notes: "Flyer copy awaiting the 2027 amounts." } },
    { cells: { time: "14:00", activity: "Course information sessions – block 2", location: "Swanston Academic Building", owner: "Joanne", collateral: "Room signage, session slides ×9", ready: false, notes: "" } },
    { cells: { time: "15:00", activity: "Alumni panel", location: "Alumni Courtyard", owner: "Priya", collateral: "Panel backdrop, name tents ×5", ready: true, notes: "" } },
    { cells: { time: "16:00", activity: "Closing set and prize draw", location: "Main Stage", owner: "AV crew", collateral: "Prize draw slide, sponsor acknowledgement board", ready: false, notes: "Sponsor board booked with the Vietnam studio." } },
    { section: "Pack down" },
    { cells: { time: "17:00", activity: "Stalls and signage collected", location: "Alumni Courtyard", owner: "Volunteers", collateral: "Storage crates, signage inventory sheet", ready: true, notes: "" } },
    { cells: { time: "18:00", activity: "Debrief and lost property", location: "Registration Tent", owner: "Thao", collateral: "", ready: false, notes: "Photographer's card handover." } },
    { cells: {} },
    { cells: {} },
  ];
  const runColumns = trackerColumns(runSheetColumns);
  trackerSheets.push({ id: sid("extraTracker"), trackerId: runSheet.id, name: "Run sheet", position: 0, columns: runColumns.columns, rows: buildRows(runRows, runColumns.ids, () => sid("extraTracker")), frozenColumns: 2, createdAt: iso(subDays(now, 12)), updatedAt: iso(subHours(now, 6)) });

  return {
    users: [],
    workspaces: [],
    workspaceMembers: [],
    workspaceInvitations: [],
    teams: teamRows,
    teamMembers,
    boards: boardRows,
    boardMembers,
    boardFavourites: [],
    boardGroups,
    boardColumns,
    items,
    itemColumnValues,
    itemLinks,
    itemAssets,
    trackers,
    trackerSheets,
    comments,
    activities,
    notifications,
    directMessages,
    boardVisits: [],
  };
}
