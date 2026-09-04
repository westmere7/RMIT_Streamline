import { addDays, subDays, subHours, subMinutes } from "date-fns";
import type {
  Activity,
  AttachmentMeta,
  Board,
  BoardColumn,
  BoardFavourite,
  BoardGroup,
  BoardMember,
  ColorToken,
  ColumnType,
  ColumnValue,
  Comment,
  Item,
  ItemColumnValue,
  ItemLink,
  Notification,
  Team,
  TeamMember,
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from "@/domain";
import { defaultSettingsFor, DEFAULT_COLUMN_WIDTHS, normaliseLinkPair } from "@/domain";
import type { BoardVisit } from "@/data/local/database";
import { toISODate } from "@/lib/dates/dates";
import { slugify } from "@/lib/slug";

/**
 * Deterministic seed. IDs are stable pseudo-UUIDs so tests and deep links are
 * predictable, while dates are relative to `now` so My Work always has content.
 */

export interface SeedBundle {
  users: User[];
  workspaces: Workspace[];
  workspaceMembers: WorkspaceMember[];
  teams: Team[];
  teamMembers: TeamMember[];
  boards: Board[];
  boardMembers: BoardMember[];
  boardFavourites: BoardFavourite[];
  boardGroups: BoardGroup[];
  boardColumns: BoardColumn[];
  items: Item[];
  itemColumnValues: ItemColumnValue[];
  itemLinks: ItemLink[];
  comments: Comment[];
  activities: Activity[];
  notifications: Notification[];
  boardVisits: BoardVisit[];
}

const ID_NAMESPACES = {
  workspace: "0",
  user: "1",
  team: "2",
  board: "3",
  group: "4",
  column: "5",
  item: "6",
  value: "7",
  comment: "8",
  activity: "9",
  notification: "a",
  member: "b",
  link: "c",
} as const;

type IdNamespace = keyof typeof ID_NAMESPACES;

const counters = new Map<IdNamespace, number>();

function sid(ns: IdNamespace, explicit?: number): string {
  const n = explicit ?? (counters.get(ns) ?? 0) + 1;
  if (explicit === undefined) counters.set(ns, n);
  return `0000000${ID_NAMESPACES[ns]}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export const SEED_WORKSPACE_ID = sid("workspace", 1);
export const SEED_WORKSPACE_SLUG = "rmit";

// ---- Users -----------------------------------------------------------------

type UserKey =
  | "danh" | "emily" | "jun" | "joanne" | "duc" | "tuyet" | "hil" | "grace" | "jane"
  | "minh" | "linh" | "sarah" | "tom" | "priya" | "chloe" | "ravi" | "thao" | "ben";

interface SeedUserSpec {
  key: UserKey;
  firstName: string;
  lastName: string;
  jobTitle: string;
  department: string;
  timezone: string;
  role: WorkspaceRole;
}

const USER_SPECS: SeedUserSpec[] = [
  { key: "danh", firstName: "Danh", lastName: "Nguyen", jobTitle: "Senior Designer", department: "Creative", timezone: "Asia/Ho_Chi_Minh", role: "OWNER" },
  { key: "emily", firstName: "Emily", lastName: "Carter", jobTitle: "Creative Lead", department: "Marketing", timezone: "Australia/Melbourne", role: "ADMIN" },
  { key: "jun", firstName: "Jun", lastName: "Tanaka", jobTitle: "Digital Producer", department: "Digital", timezone: "Australia/Melbourne", role: "MEMBER" },
  { key: "joanne", firstName: "Joanne", lastName: "Walsh", jobTitle: "Campaign Manager", department: "Marketing", timezone: "Australia/Melbourne", role: "ADMIN" },
  { key: "duc", firstName: "Duc", lastName: "Tran", jobTitle: "Motion Designer", department: "Creative", timezone: "Asia/Ho_Chi_Minh", role: "MEMBER" },
  { key: "tuyet", firstName: "Tuyet", lastName: "Le", jobTitle: "Graphic Designer", department: "Creative", timezone: "Asia/Ho_Chi_Minh", role: "MEMBER" },
  { key: "hil", firstName: "Hil", lastName: "Pham", jobTitle: "Web Designer", department: "Digital", timezone: "Asia/Ho_Chi_Minh", role: "MEMBER" },
  { key: "grace", firstName: "Grace", lastName: "Kim", jobTitle: "Content Strategist", department: "Content", timezone: "Australia/Melbourne", role: "MEMBER" },
  { key: "jane", firstName: "Jane", lastName: "Morrison", jobTitle: "Copywriter", department: "Content", timezone: "Australia/Melbourne", role: "GUEST" },
  { key: "minh", firstName: "Minh", lastName: "Hoang", jobTitle: "Video Editor", department: "Creative", timezone: "Asia/Ho_Chi_Minh", role: "MEMBER" },
  { key: "linh", firstName: "Linh", lastName: "Vo", jobTitle: "Junior Designer", department: "Creative", timezone: "Asia/Ho_Chi_Minh", role: "MEMBER" },
  { key: "sarah", firstName: "Sarah", lastName: "Mitchell", jobTitle: "Brand Manager", department: "Marketing", timezone: "Australia/Melbourne", role: "ADMIN" },
  { key: "tom", firstName: "Tom", lastName: "Hartley", jobTitle: "UX Designer", department: "Digital", timezone: "Australia/Melbourne", role: "MEMBER" },
  { key: "priya", firstName: "Priya", lastName: "Nair", jobTitle: "Marketing Coordinator", department: "Marketing", timezone: "Australia/Melbourne", role: "MEMBER" },
  { key: "chloe", firstName: "Chloe", lastName: "Bennett", jobTitle: "Social Media Manager", department: "Content", timezone: "Australia/Melbourne", role: "MEMBER" },
  { key: "ravi", firstName: "Ravi", lastName: "Sharma", jobTitle: "Front-end Developer", department: "Digital", timezone: "Australia/Melbourne", role: "MEMBER" },
  { key: "thao", firstName: "Thao", lastName: "Dang", jobTitle: "Studio Coordinator", department: "Creative", timezone: "Asia/Ho_Chi_Minh", role: "MEMBER" },
  { key: "ben", firstName: "Ben", lastName: "Walker", jobTitle: "Agency Partner", department: "External", timezone: "Australia/Melbourne", role: "GUEST" },
];

export const SEED_USER_IDS: Record<UserKey, string> = {
  danh: sid("user", 1),
  emily: sid("user", 2),
  jun: sid("user", 3),
  joanne: sid("user", 4),
  duc: sid("user", 5),
  tuyet: sid("user", 6),
  hil: sid("user", 7),
  grace: sid("user", 8),
  jane: sid("user", 9),
  minh: sid("user", 10),
  linh: sid("user", 11),
  sarah: sid("user", 12),
  tom: sid("user", 13),
  priya: sid("user", 14),
  chloe: sid("user", 15),
  ravi: sid("user", 16),
  thao: sid("user", 17),
  ben: sid("user", 18),
};

export const SEED_ACCOUNTS = USER_SPECS.map((u) => ({
  id: SEED_USER_IDS[u.key],
  email: `${u.key}@rmit.local`,
  name: `${u.firstName} ${u.lastName}`,
  jobTitle: u.jobTitle,
  role: u.role,
}));

// ---- Teams -----------------------------------------------------------------

type TeamKey = "vietnam" | "melbourne" | "campaigns" | "digital" | "brand" | "content" | "video" | "events";

interface SeedTeamSpec {
  key: TeamKey;
  name: string;
  description: string;
  color: ColorToken;
  icon: string;
  lead: UserKey;
  members: UserKey[];
}

const TEAM_SPECS: SeedTeamSpec[] = [
  { key: "vietnam", name: "Vietnam Creative", description: "Design and production studio based in Ho Chi Minh City.", color: "red", icon: "palette", lead: "danh", members: ["duc", "tuyet", "hil", "linh", "thao", "minh"] },
  { key: "melbourne", name: "Melbourne Creative", description: "Campaign creative and brand design for the Melbourne campuses.", color: "navy", icon: "paintbrush", lead: "emily", members: ["jun", "grace", "jane", "sarah", "tom", "priya"] },
  { key: "campaigns", name: "Campaigns", description: "Integrated campaign planning and delivery.", color: "orange", icon: "megaphone", lead: "joanne", members: ["emily", "danh", "jun", "priya", "ben"] },
  { key: "digital", name: "Digital", description: "Web, landing pages and digital out-of-home.", color: "cyan", icon: "monitor", lead: "jun", members: ["hil", "grace", "tom", "ravi"] },
  { key: "brand", name: "Brand", description: "Brand governance, guidelines and identity assets.", color: "purple", icon: "sparkles", lead: "sarah", members: ["joanne", "emily", "duc"] },
  { key: "content", name: "Content", description: "Always-on social and editorial content.", color: "green", icon: "newspaper", lead: "grace", members: ["jane", "tuyet", "chloe"] },
  { key: "video", name: "Video & Motion", description: "Film, motion graphics and post-production.", color: "pink", icon: "film", lead: "minh", members: ["duc", "linh", "chloe"] },
  { key: "events", name: "Events", description: "Open days, ceremonies and campus activations.", color: "amber", icon: "calendar-days", lead: "priya", members: ["joanne", "thao", "tuyet"] },
];

export const SEED_TEAM_IDS: Record<TeamKey, string> = {
  vietnam: sid("team", 1),
  melbourne: sid("team", 2),
  campaigns: sid("team", 3),
  digital: sid("team", 4),
  brand: sid("team", 5),
  content: sid("team", 6),
  video: sid("team", 7),
  events: sid("team", 8),
};

// ---- Boards ----------------------------------------------------------------

type BoardKey = "sem1" | "masterclass" | "rmitinerary" | "dooh" | "requests" | "alwayson" | "openday" | "video" | "brand" | "website" | "social" | "sem2archive";

interface SeedColumnSpec {
  key: string;
  name: string;
  type: ColumnType;
  width?: number;
}

interface SeedItemSpec {
  group: string;
  name: string;
  owner?: UserKey[];
  status?: string;
  priority?: string;
  /** Due date offset in days from now. */
  due?: number;
  /** Timeline as [startOffset, endOffset] in days. */
  timeline?: [number, number];
  tags?: string[];
  text?: Record<string, string>;
  number?: Record<string, number>;
  checkbox?: Record<string, boolean>;
  link?: Record<string, { url: string; text: string }>;
  requester?: UserKey[];
  files?: string[];
  description?: string;
  subitems?: Array<Pick<SeedItemSpec, "name" | "owner" | "status" | "priority" | "due">>;
  /** Item names (on the same board) this item depends on. */
  dependsOn?: string[];
  createdBy?: UserKey;
  /** Days ago the item was created. */
  createdDaysAgo?: number;
}

interface SeedBoardSpec {
  key: BoardKey;
  name: string;
  description: string;
  team: TeamKey;
  owner: UserKey;
  visibility: Board["visibility"];
  type: Board["type"];
  color: ColorToken;
  icon: string;
  groups: Array<{ name: string; color: ColorToken }>;
  columns: SeedColumnSpec[];
  items: SeedItemSpec[];
  viewers?: UserKey[];
  archived?: boolean;
}

export const SEED_BOARD_IDS: Record<BoardKey, string> = {
  sem1: sid("board", 1),
  masterclass: sid("board", 2),
  rmitinerary: sid("board", 3),
  dooh: sid("board", 4),
  requests: sid("board", 5),
  alwayson: sid("board", 6),
  openday: sid("board", 7),
  video: sid("board", 8),
  brand: sid("board", 9),
  website: sid("board", 10),
  social: sid("board", 11),
  sem2archive: sid("board", 12),
};

const BOARD_SPECS: SeedBoardSpec[] = [
  {
    key: "sem1",
    name: "Semester 1 Campaign",
    description: "Integrated Semester 1 recruitment campaign across Melbourne and Vietnam.",
    team: "melbourne",
    owner: "emily",
    visibility: "WORKSPACE",
    type: "MAIN",
    color: "orange",
    icon: "megaphone",
    groups: [
      { name: "Planning", color: "sky" },
      { name: "Production", color: "orange" },
      { name: "Review", color: "violet" },
      { name: "Live", color: "green" },
      { name: "Completed", color: "gray" },
    ],
    columns: [
      { key: "owner", name: "Owner", type: "PERSON" },
      { key: "status", name: "Status", type: "STATUS" },
      { key: "priority", name: "Priority", type: "PRIORITY" },
      { key: "timeline", name: "Timeline", type: "TIMELINE" },
      { key: "due", name: "Due Date", type: "DATE" },
      { key: "channel", name: "Channel", type: "TAGS" },
    ],
    items: [
      { group: "Planning", name: "Sem 1 campaign storyboard", owner: ["emily", "danh"], status: "working", priority: "critical", due: 2, timeline: [-6, 2], tags: ["Video", "Social"], createdBy: "emily", createdDaysAgo: 12, description: "Storyboard for the 30s hero film and 15s social cutdowns. Align with the new brand platform." },
      { group: "Planning", name: "Prepare campaign image selections", owner: ["joanne"], status: "waiting", priority: "high", due: 1, timeline: [-3, 1], tags: ["Photography"], createdBy: "joanne", createdDaysAgo: 10 },
      { group: "Planning", name: "Media plan sign-off", owner: ["joanne"], status: "stuck", priority: "high", due: -2, timeline: [-9, -2], tags: ["Media"], createdBy: "joanne", createdDaysAgo: 14, description: "Blocked pending budget confirmation from the Marketing Director." },
      { group: "Planning", name: "Campus open day messaging matrix", owner: ["grace"], status: "not_started", priority: "medium", due: 9, tags: ["Copy"], createdBy: "emily", createdDaysAgo: 3 },
      { group: "Production", name: "Sem 1 DOOH adaptation", owner: ["danh"], status: "working", priority: "high", due: 0, timeline: [-2, 0], tags: ["DOOH"], createdBy: "jun", createdDaysAgo: 5, description: "Adapt hero key visual to the Melbourne CBD DOOH network. Portrait and landscape formats." },
      { group: "Production", name: "Hero film edit v2", owner: ["duc"], status: "working", priority: "critical", due: 3, timeline: [-4, 3], tags: ["Video"], createdBy: "emily", createdDaysAgo: 8 },
      { group: "Production", name: "Social cutdowns – 15s x 6", owner: ["duc", "tuyet"], status: "not_started", priority: "medium", due: 6, timeline: [3, 6], tags: ["Social", "Video"], createdBy: "emily", createdDaysAgo: 8, dependsOn: ["Hero film edit v2"] },
      { group: "Production", name: "Print ad – The Age full page", owner: ["tuyet"], status: "working", priority: "medium", due: 4, timeline: [0, 4], tags: ["Print"], createdBy: "joanne", createdDaysAgo: 4 },
      { group: "Production", name: "Landing page hero animation", owner: ["hil"], status: "waiting", priority: "medium", due: 5, timeline: [-1, 5], tags: ["Web"], createdBy: "jun", createdDaysAgo: 6 },
      { group: "Review", name: "Radio script – 30s", owner: ["jane"], status: "waiting", priority: "low", due: 1, tags: ["Radio", "Copy"], createdBy: "grace", createdDaysAgo: 9 },
      { group: "Review", name: "Key visual – stakeholder round 2", owner: ["emily"], status: "working", priority: "critical", due: -1, timeline: [-5, -1], tags: ["Brand"], createdBy: "emily", createdDaysAgo: 11, description: "Second round of feedback from the Deputy Vice-Chancellor's office." },
      { group: "Live", name: "Paid social – phase 1", owner: ["jun"], status: "done", priority: "high", due: -4, timeline: [-10, -4], tags: ["Social", "Media"], createdBy: "jun", createdDaysAgo: 16 },
      { group: "Live", name: "Search ads copy refresh", owner: ["grace"], status: "done", priority: "low", due: -6, tags: ["Search", "Copy"], createdBy: "grace", createdDaysAgo: 15 },
      { group: "Completed", name: "Campaign brief and objectives", owner: ["joanne"], status: "done", priority: "high", due: -20, timeline: [-30, -20], tags: ["Strategy"], createdBy: "joanne", createdDaysAgo: 32 },
      { group: "Completed", name: "Creative territory exploration", owner: ["emily", "danh"], status: "done", priority: "high", due: -14, timeline: [-24, -14], tags: ["Brand"], createdBy: "emily", createdDaysAgo: 26 },
    ],
  },
  {
    key: "masterclass",
    name: "Masterclass Assets",
    description: "Speaker assets, social tiles and the landing page for the Masterclass series.",
    team: "vietnam",
    owner: "danh",
    visibility: "TEAM",
    type: "MAIN",
    color: "violet",
    icon: "sparkles",
    viewers: ["emily", "jun"],
    groups: [
      { name: "Briefing", color: "gray" },
      { name: "Design", color: "violet" },
      { name: "Internal Review", color: "sky" },
      { name: "Stakeholder Review", color: "amber" },
      { name: "Approved", color: "green" },
      { name: "Delivered", color: "teal" },
    ],
    columns: [
      { key: "owner", name: "Designer", type: "PERSON" },
      { key: "status", name: "Status", type: "STATUS" },
      { key: "priority", name: "Priority", type: "PRIORITY" },
      { key: "due", name: "Due Date", type: "DATE" },
      { key: "format", name: "Format", type: "TEXT" },
      { key: "market", name: "Market", type: "TAGS" },
    ],
    items: [
      { group: "Briefing", name: "Masterclass social asset – Speaker 3", owner: [], status: "not_started", priority: "medium", due: 8, text: { format: "1080x1080, 1080x1920" }, tags: ["Vietnam"], createdBy: "emily", createdDaysAgo: 1 },
      { group: "Design", name: "Masterclass social asset – Speaker 1", owner: ["danh"], status: "working", priority: "high", due: 1, text: { format: "1080x1080, 1080x1920" }, tags: ["Vietnam", "Melbourne"], createdBy: "emily", createdDaysAgo: 6 },
      { group: "Design", name: "Masterclass social asset – Dual speaker", owner: ["tuyet"], status: "working", priority: "high", due: 2, text: { format: "1080x1080" }, tags: ["Vietnam"], createdBy: "emily", createdDaysAgo: 6 },
      { group: "Design", name: "Masterclass landing page hero", owner: ["hil", "danh"], status: "stuck", priority: "critical", due: 0, text: { format: "1920x800 web" }, tags: ["Global"], createdBy: "jun", createdDaysAgo: 7, description: "Hero for the Masterclass landing page. Waiting on approved speaker photography from the Melbourne team." },
      { group: "Design", name: "Email header – registration reminder", owner: ["tuyet"], status: "not_started", priority: "low", due: 5, text: { format: "600x200" }, tags: ["Global"], createdBy: "grace", createdDaysAgo: 2 },
      { group: "Internal Review", name: "Masterclass social asset – Speaker 2", owner: ["duc"], status: "waiting", priority: "medium", due: 1, text: { format: "1080x1080, 1080x1920" }, tags: ["Melbourne"], createdBy: "emily", createdDaysAgo: 5 },
      { group: "Internal Review", name: "Event signage – pull-up banners", owner: ["tuyet"], status: "waiting", priority: "medium", due: 3, text: { format: "850x2000 print" }, tags: ["Vietnam"], createdBy: "danh", createdDaysAgo: 4 },
      { group: "Stakeholder Review", name: "Masterclass programme booklet", owner: ["danh"], status: "waiting", priority: "high", due: -1, text: { format: "A5, 12pp" }, tags: ["Vietnam"], createdBy: "danh", createdDaysAgo: 9 },
      { group: "Approved", name: "Speaker photography retouching", owner: ["duc"], status: "done", priority: "medium", due: -2, text: { format: "RAW → TIFF" }, tags: ["Global"], createdBy: "emily", createdDaysAgo: 10 },
      { group: "Delivered", name: "Masterclass series logo lockup", owner: ["danh"], status: "done", priority: "high", due: -12, text: { format: "SVG, PNG" }, tags: ["Global"], createdBy: "danh", createdDaysAgo: 20 },
      { group: "Delivered", name: "Save-the-date social tile", owner: ["tuyet"], status: "done", priority: "medium", due: -9, text: { format: "1080x1080" }, tags: ["Vietnam", "Melbourne"], createdBy: "danh", createdDaysAgo: 18 },
    ],
  },
  {
    key: "rmitinerary",
    name: "RMITinerary 2026",
    description: "Publication production tracking and creative approvals.",
    team: "vietnam",
    owner: "danh",
    visibility: "WORKSPACE",
    type: "MAIN",
    color: "red",
    icon: "compass",
    groups: [
      { name: "Backlog", color: "gray" },
      { name: "Design", color: "red" },
      { name: "Production", color: "orange" },
      { name: "Stakeholder Review", color: "amber" },
      { name: "Completed", color: "green" },
    ],
    columns: [
      { key: "owner", name: "Owner", type: "PERSON" },
      { key: "status", name: "Status", type: "STATUS" },
      { key: "priority", name: "Priority", type: "PRIORITY" },
      { key: "due", name: "Due Date", type: "DATE" },
      { key: "timeline", name: "Timeline", type: "TIMELINE" },
      { key: "dependency", name: "Dependency", type: "DEPENDENCY" },
      { key: "files", name: "Files", type: "FILES" },
      { key: "notes", name: "Notes", type: "TEXT", width: 220 },
    ],
    items: [
      { group: "Backlog", name: "RMITinerary 2027 planning kick-off", owner: ["danh", "joanne"], status: "not_started", priority: "low", due: 40, createdBy: "joanne", createdDaysAgo: 2 },
      { group: "Backlog", name: "Accessibility review of PDF export", owner: ["hil"], status: "not_started", priority: "medium", due: 18, createdBy: "danh", createdDaysAgo: 3 },
      { group: "Design", name: "RMITinerary High Achiever", owner: ["danh"], status: "done", priority: "high", due: 4, timeline: [-6, 4], text: { notes: "Approved by Joanne. Final export pending." }, createdBy: "danh", createdDaysAgo: 12, description: "Persona spread for the High Achiever pathway. 4pp including map and timeline.", subitems: [
        { name: "Persona illustration", owner: ["duc"], status: "done", priority: "high", due: -1 },
        { name: "Copy proofread", owner: ["jane"], status: "done", priority: "medium", due: 1 },
        { name: "Final export", owner: ["danh"], status: "working", priority: "medium", due: 4 },
      ] },
      { group: "Design", name: "RMITinerary Pragmatist", owner: ["tuyet"], status: "working", priority: "high", due: 6, timeline: [-2, 6], createdBy: "danh", createdDaysAgo: 11, subitems: [
        { name: "Persona illustration", owner: ["duc"], status: "working", priority: "high", due: 2 },
        { name: "Copy proofread", owner: ["jane"], status: "not_started", priority: "medium", due: 5 },
      ] },
      { group: "Design", name: "RMITinerary Explorer", owner: ["danh"], status: "waiting", priority: "medium", due: 7, timeline: [0, 7], text: { notes: "Waiting on photography from Hanoi campus." }, createdBy: "danh", createdDaysAgo: 11 },
      { group: "Design", name: "RMITinerary Independent", owner: ["tuyet"], status: "not_started", priority: "medium", due: 11, timeline: [5, 11], createdBy: "danh", createdDaysAgo: 11 },
      { group: "Design", name: "Cover concept – final artwork", owner: ["danh"], status: "working", priority: "critical", due: 3, timeline: [-4, 3], files: ["RMITinerary_Cover_v3.pdf"], createdBy: "danh", createdDaysAgo: 9, description: "Final cover artwork. Spot UV on the RMIT wordmark; confirm with printer." },
      { group: "Production", name: "Chinese language adaptation", owner: ["duc"], status: "not_started", priority: "low", due: 18, timeline: [12, 18], createdBy: "danh", createdDaysAgo: 5, dependsOn: ["RMITinerary High Achiever", "RMITinerary Pragmatist"] },
      { group: "Production", name: "Vietnamese language adaptation", owner: ["tuyet"], status: "not_started", priority: "medium", due: 16, timeline: [10, 16], createdBy: "danh", createdDaysAgo: 5, dependsOn: ["RMITinerary High Achiever"] },
      { group: "Production", name: "Upload final production files", owner: ["danh"], status: "not_started", priority: "high", due: 12, createdBy: "danh", createdDaysAgo: 5, dependsOn: ["Review stakeholder feedback", "Cover concept – final artwork"] },
      { group: "Production", name: "Printer quote and paper stock", owner: ["duc"], status: "waiting", priority: "medium", due: 5, text: { notes: "Two quotes received; waiting on third." }, createdBy: "danh", createdDaysAgo: 8 },
      { group: "Stakeholder Review", name: "Review stakeholder feedback", owner: ["joanne", "danh"], status: "working", priority: "high", due: 2, timeline: [-1, 2], createdBy: "joanne", createdDaysAgo: 4, description: "Consolidate feedback from Student Recruitment and the Vietnam Marketing team." },
      { group: "Stakeholder Review", name: "Map illustration – Saigon South campus", owner: ["duc"], status: "waiting", priority: "medium", due: -1, timeline: [-8, -1], createdBy: "danh", createdDaysAgo: 10 },
      { group: "Completed", name: "Content outline and pagination", owner: ["grace"], status: "done", priority: "high", due: -18, timeline: [-28, -18], createdBy: "grace", createdDaysAgo: 30 },
      { group: "Completed", name: "Typography and grid system", owner: ["danh"], status: "done", priority: "high", due: -15, timeline: [-22, -15], createdBy: "danh", createdDaysAgo: 24 },
      { group: "Completed", name: "Photography shortlist", owner: ["tuyet"], status: "done", priority: "medium", due: -10, createdBy: "danh", createdDaysAgo: 19 },
    ],
  },
  {
    key: "dooh",
    name: "DOOH Production",
    description: "Digital out-of-home artwork production and network specifications.",
    team: "vietnam",
    owner: "duc",
    visibility: "TEAM",
    type: "MAIN",
    color: "teal",
    icon: "monitor",
    viewers: ["jun", "joanne"],
    groups: [
      { name: "This Fortnight", color: "teal" },
      { name: "In Progress", color: "orange" },
      { name: "Internal Review", color: "sky" },
      { name: "Approved", color: "green" },
      { name: "Completed", color: "gray" },
    ],
    columns: [
      { key: "owner", name: "Owner", type: "PERSON" },
      { key: "status", name: "Status", type: "STATUS" },
      { key: "priority", name: "Priority", type: "PRIORITY" },
      { key: "due", name: "Due Date", type: "DATE" },
      { key: "format", name: "Format", type: "TEXT" },
      { key: "specs", name: "Specs confirmed", type: "CHECKBOX" },
    ],
    items: [
      { group: "This Fortnight", name: "Sem 1 DOOH adaptation", owner: ["danh"], status: "working", priority: "high", due: 0, text: { format: "1080x1920 @ 10s" }, checkbox: { specs: true }, createdBy: "duc", createdDaysAgo: 4, description: "Adapt hero key visual to the Melbourne CBD DOOH network. Portrait and landscape formats." },
      { group: "This Fortnight", name: "Airport lounge screen – arrivals", owner: ["duc"], status: "not_started", priority: "medium", due: 6, text: { format: "3840x1080 @ 15s" }, checkbox: { specs: false }, createdBy: "duc", createdDaysAgo: 2 },
      { group: "This Fortnight", name: "Metro station wall – Ben Thanh", owner: ["tuyet"], status: "not_started", priority: "medium", due: 8, text: { format: "1920x1080 @ 8s" }, checkbox: { specs: true }, createdBy: "duc", createdDaysAgo: 2 },
      { group: "In Progress", name: "Bourke St Mall large format", owner: ["danh", "duc"], status: "working", priority: "critical", due: 1, text: { format: "2160x3840 @ 10s" }, checkbox: { specs: true }, createdBy: "jun", createdDaysAgo: 7 },
      { group: "In Progress", name: "Shopping centre network – 6 sites", owner: ["duc"], status: "stuck", priority: "high", due: -1, text: { format: "1080x1920 @ 6s" }, checkbox: { specs: false }, createdBy: "jun", createdDaysAgo: 8, description: "Two sites have non-standard aspect ratios. Waiting on the media agency for updated specs." },
      { group: "Internal Review", name: "Motion test – logo reveal", owner: ["duc"], status: "waiting", priority: "low", due: 3, text: { format: "1080x1920 @ 10s" }, checkbox: { specs: true }, createdBy: "duc", createdDaysAgo: 5 },
      { group: "Approved", name: "Campus wayfinding screens", owner: ["hil"], status: "done", priority: "medium", due: -3, text: { format: "1920x1080 static" }, checkbox: { specs: true }, createdBy: "duc", createdDaysAgo: 12 },
      { group: "Completed", name: "Tram wrap key visual", owner: ["danh"], status: "done", priority: "high", due: -9, text: { format: "Vector, scale 1:10" }, checkbox: { specs: true }, createdBy: "jun", createdDaysAgo: 20 },
      { group: "Completed", name: "Network spec sheet compilation", owner: ["jun"], status: "done", priority: "medium", due: -14, text: { format: "Spreadsheet" }, checkbox: { specs: true }, createdBy: "jun", createdDaysAgo: 22 },
    ],
  },
  {
    key: "requests",
    name: "Creative Requests",
    description: "Incoming requests from across the university, triaged by the Vietnam studio.",
    team: "vietnam",
    owner: "danh",
    visibility: "WORKSPACE",
    type: "MAIN",
    color: "blue",
    icon: "inbox",
    groups: [
      { name: "New Requests", color: "blue" },
      { name: "Triaged", color: "sky" },
      { name: "In Progress", color: "orange" },
      { name: "Delivered", color: "green" },
    ],
    columns: [
      { key: "requester", name: "Requester", type: "PERSON" },
      { key: "owner", name: "Owner", type: "PERSON" },
      { key: "status", name: "Status", type: "STATUS" },
      { key: "priority", name: "Priority", type: "PRIORITY" },
      { key: "due", name: "Due Date", type: "DATE" },
      { key: "brief", name: "Brief", type: "LINK" },
      { key: "estimate", name: "Estimate (h)", type: "NUMBER" },
    ],
    items: [
      { group: "New Requests", name: "Alumni newsletter banner", requester: ["grace"], owner: [], status: "not_started", priority: "low", due: 10, link: { brief: { url: "https://example.rmit.local/briefs/alumni-banner", text: "Brief" } }, number: { estimate: 2 }, createdBy: "grace", createdDaysAgo: 1 },
      { group: "New Requests", name: "Scholarship info session slides", requester: ["joanne"], owner: [], status: "not_started", priority: "medium", due: 7, link: { brief: { url: "https://example.rmit.local/briefs/scholarship-slides", text: "Brief" } }, number: { estimate: 4 }, createdBy: "joanne", createdDaysAgo: 0 },
      { group: "New Requests", name: "Library opening hours poster", requester: ["jane"], owner: [], status: "not_started", priority: "low", due: 14, number: { estimate: 1 }, createdBy: "jane", createdDaysAgo: 0 },
      { group: "Triaged", name: "Careers fair pull-up banner", requester: ["joanne"], owner: ["tuyet"], status: "not_started", priority: "medium", due: 5, link: { brief: { url: "https://example.rmit.local/briefs/careers-fair", text: "Brief" } }, number: { estimate: 3 }, createdBy: "joanne", createdDaysAgo: 3 },
      { group: "Triaged", name: "Research showcase LinkedIn carousel", requester: ["grace"], owner: ["danh"], status: "not_started", priority: "medium", due: 4, number: { estimate: 3 }, createdBy: "grace", createdDaysAgo: 2 },
      { group: "In Progress", name: "Graduation ceremony programme", requester: ["emily"], owner: ["tuyet"], status: "working", priority: "high", due: 3, link: { brief: { url: "https://example.rmit.local/briefs/graduation", text: "Brief" } }, number: { estimate: 8 }, createdBy: "emily", createdDaysAgo: 9 },
      { group: "In Progress", name: "Student services icon set", requester: ["jun"], owner: ["hil"], status: "working", priority: "medium", due: 0, number: { estimate: 6 }, createdBy: "jun", createdDaysAgo: 6 },
      { group: "In Progress", name: "Industry partner certificate template", requester: ["joanne"], owner: ["danh"], status: "waiting", priority: "low", due: -2, number: { estimate: 2 }, createdBy: "joanne", createdDaysAgo: 8 },
      { group: "Delivered", name: "Orientation week wristband artwork", requester: ["grace"], owner: ["duc"], status: "done", priority: "medium", due: -5, number: { estimate: 1 }, createdBy: "grace", createdDaysAgo: 12 },
      { group: "Delivered", name: "Exam timetable social tile", requester: ["jane"], owner: ["tuyet"], status: "done", priority: "high", due: -7, number: { estimate: 2 }, createdBy: "jane", createdDaysAgo: 13 },
    ],
  },
  {
    key: "alwayson",
    name: "Always-On Content",
    description: "Evergreen social and editorial content calendar.",
    team: "melbourne",
    owner: "grace",
    visibility: "WORKSPACE",
    type: "MAIN",
    color: "green",
    icon: "newspaper",
    groups: [
      { name: "Ideas", color: "gray" },
      { name: "This Week", color: "green" },
      { name: "Drafting", color: "orange" },
      { name: "Scheduled", color: "sky" },
      { name: "Published", color: "teal" },
    ],
    columns: [
      { key: "owner", name: "Owner", type: "PERSON" },
      { key: "status", name: "Status", type: "STATUS" },
      { key: "priority", name: "Priority", type: "PRIORITY" },
      { key: "due", name: "Publish Date", type: "DATE" },
      { key: "channel", name: "Channel", type: "TAGS" },
      { key: "copy", name: "Copy", type: "LONG_TEXT" },
    ],
    items: [
      { group: "Ideas", name: "Student spotlight – exchange to Barcelona", owner: ["jane"], status: "not_started", priority: "low", tags: ["Instagram"], createdBy: "grace", createdDaysAgo: 2 },
      { group: "Ideas", name: "Behind the scenes – Vietnam studio", owner: ["tuyet"], status: "not_started", priority: "low", tags: ["TikTok", "Instagram"], createdBy: "grace", createdDaysAgo: 1 },
      { group: "This Week", name: "Campus life reel – Brunswick", owner: ["jane", "duc"], status: "working", priority: "medium", due: 2, tags: ["Instagram", "TikTok"], createdBy: "grace", createdDaysAgo: 4 },
      { group: "This Week", name: "Research news – renewable materials", owner: ["grace"], status: "working", priority: "high", due: 1, tags: ["LinkedIn"], text: { copy: "RMIT researchers have developed a new bio-based composite..." }, createdBy: "grace", createdDaysAgo: 3 },
      { group: "Drafting", name: "Alumni story – design graduate at Atlassian", owner: ["jane"], status: "waiting", priority: "medium", due: 4, tags: ["LinkedIn", "Web"], createdBy: "grace", createdDaysAgo: 6 },
      { group: "Drafting", name: "Study tips carousel – exam season", owner: ["grace", "tuyet"], status: "working", priority: "medium", due: 3, tags: ["Instagram"], createdBy: "grace", createdDaysAgo: 5 },
      { group: "Scheduled", name: "Weekly events roundup", owner: ["jane"], status: "done", priority: "low", due: 1, tags: ["Instagram", "Facebook"], createdBy: "jane", createdDaysAgo: 3 },
      { group: "Scheduled", name: "Scholarship deadline reminder", owner: ["grace"], status: "done", priority: "high", due: 0, tags: ["Facebook", "LinkedIn", "Instagram"], createdBy: "grace", createdDaysAgo: 4 },
      { group: "Published", name: "Welcome week highlights", owner: ["jane", "duc"], status: "done", priority: "medium", due: -5, tags: ["Instagram", "TikTok"], createdBy: "grace", createdDaysAgo: 12 },
      { group: "Published", name: "Open day countdown series", owner: ["grace"], status: "done", priority: "medium", due: -8, tags: ["Instagram", "Facebook"], createdBy: "grace", createdDaysAgo: 15 },
    ],
  },
  {
    key: "openday",
    name: "Open Day 2026",
    description: "Campus Open Day: signage, wayfinding, stage content and social coverage across three campuses.",
    team: "events",
    owner: "priya",
    visibility: "WORKSPACE",
    type: "MAIN",
    color: "amber",
    icon: "calendar-days",
    groups: [
      { name: "Planning", color: "sky" },
      { name: "Production", color: "orange" },
      { name: "Review", color: "violet" },
      { name: "Live", color: "green" },
      { name: "Completed", color: "gray" },
    ],
    columns: [
      { key: "owner", name: "Owner", type: "PERSON" },
      { key: "status", name: "Status", type: "STATUS" },
      { key: "priority", name: "Priority", type: "PRIORITY" },
      { key: "timeline", name: "Timeline", type: "TIMELINE" },
      { key: "due", name: "Due Date", type: "DATE" },
      { key: "channel", name: "Campus", type: "TAGS" },
      { key: "budget", name: "Budget (AUD)", type: "NUMBER" },
    ],
    items: [
      { group: "Planning", name: "Open Day run sheet v3", owner: ["priya"], status: "working", priority: "critical", due: 3, timeline: [-4, 3], tags: ["City", "Brunswick", "Bundoora"], number: { budget: 0 }, createdBy: "priya", createdDaysAgo: 9, description: "Master run sheet covering stage program, tours and volunteer briefings." },
      { group: "Planning", name: "Volunteer t-shirt design", owner: ["linh"], status: "not_started", priority: "medium", due: 12, timeline: [6, 12], tags: ["City"], number: { budget: 4200 }, createdBy: "priya", createdDaysAgo: 3 },
      { group: "Planning", name: "Campus wayfinding map update", owner: ["tuyet", "thao"], status: "working", priority: "high", due: 6, timeline: [-2, 6], tags: ["City", "Brunswick"], number: { budget: 1800 }, createdBy: "priya", createdDaysAgo: 6 },
      { group: "Planning", name: "Stage backdrop concept", owner: ["danh"], status: "waiting", priority: "high", due: 4, timeline: [-6, 4], tags: ["City"], number: { budget: 6500 }, createdBy: "joanne", createdDaysAgo: 8 },
      { group: "Production", name: "Directional signage – 120 units", owner: ["tuyet"], status: "working", priority: "high", due: 9, timeline: [2, 9], tags: ["City", "Brunswick", "Bundoora"], number: { budget: 9800 }, createdBy: "priya", createdDaysAgo: 5 },
      { group: "Production", name: "Faculty stall kits", owner: ["linh", "thao"], status: "not_started", priority: "medium", due: 14, timeline: [8, 14], tags: ["Bundoora"], number: { budget: 3200 }, createdBy: "priya", createdDaysAgo: 2 },
      { group: "Production", name: "Welcome video loop – 60s", owner: ["minh"], status: "working", priority: "high", due: 7, timeline: [-1, 7], tags: ["City"], number: { budget: 2500 }, createdBy: "priya", createdDaysAgo: 5 },
      { group: "Production", name: "Social story templates", owner: ["chloe"], status: "not_started", priority: "low", due: 10, tags: ["Global"], number: { budget: 0 }, createdBy: "chloe", createdDaysAgo: 1 },
      { group: "Review", name: "Accessibility check – signage contrast", owner: ["tom"], status: "waiting", priority: "medium", due: 2, tags: ["Global"], number: { budget: 0 }, createdBy: "priya", createdDaysAgo: 4 },
      { group: "Review", name: "Campus banner artwork – round 2", owner: ["danh", "linh"], status: "stuck", priority: "critical", due: -1, timeline: [-7, -1], tags: ["City"], number: { budget: 7400 }, createdBy: "joanne", createdDaysAgo: 10, description: "Facilities flagged the new banner sizes; waiting on final measurements for the Building 80 frontage." },
      { group: "Live", name: "Save-the-date email", owner: ["priya"], status: "done", priority: "high", due: -8, tags: ["Global"], number: { budget: 0 }, createdBy: "priya", createdDaysAgo: 16 },
      { group: "Completed", name: "Open Day brief and objectives", owner: ["joanne"], status: "done", priority: "high", due: -25, timeline: [-35, -25], tags: ["Global"], number: { budget: 0 }, createdBy: "joanne", createdDaysAgo: 36 },
      { group: "Completed", name: "Venue and stage booking", owner: ["thao"], status: "done", priority: "critical", due: -20, tags: ["City"], number: { budget: 15000 }, createdBy: "priya", createdDaysAgo: 30 },
    ],
  },
  {
    key: "video",
    name: "Video Production Pipeline",
    description: "Every film and motion job from brief to delivery, with client approvals.",
    team: "video",
    owner: "minh",
    visibility: "TEAM",
    type: "MAIN",
    color: "pink",
    icon: "film",
    viewers: ["emily", "joanne", "danh"],
    groups: [
      { name: "Briefed", color: "gray" },
      { name: "Pre-production", color: "sky" },
      { name: "Shooting", color: "pink" },
      { name: "Post-production", color: "violet" },
      { name: "Client Review", color: "amber" },
      { name: "Delivered", color: "green" },
    ],
    columns: [
      { key: "owner", name: "Editor", type: "PERSON" },
      { key: "status", name: "Status", type: "STATUS" },
      { key: "priority", name: "Priority", type: "PRIORITY" },
      { key: "timeline", name: "Timeline", type: "TIMELINE" },
      { key: "due", name: "Delivery", type: "DATE" },
      { key: "format", name: "Deliverables", type: "TEXT", width: 200 },
      { key: "approved", name: "Client approved", type: "CHECKBOX" },
      { key: "files", name: "Files", type: "FILES" },
    ],
    items: [
      { group: "Briefed", name: "Alumni testimonial series – 4 films", owner: [], status: "not_started", priority: "medium", due: 30, timeline: [10, 30], text: { format: "4 x 90s, 16:9 + 9:16" }, checkbox: { approved: false }, createdBy: "emily", createdDaysAgo: 2 },
      { group: "Briefed", name: "Research impact explainer", owner: ["minh"], status: "not_started", priority: "low", due: 24, text: { format: "1 x 2min animated" }, checkbox: { approved: false }, createdBy: "grace", createdDaysAgo: 1 },
      { group: "Pre-production", name: "Sem 1 hero film – shot list", owner: ["minh", "duc"], status: "working", priority: "critical", due: 1, timeline: [-3, 1], text: { format: "Shot list + call sheet" }, checkbox: { approved: true }, createdBy: "emily", createdDaysAgo: 6 },
      { group: "Pre-production", name: "Casting – student talent", owner: ["thao"], status: "waiting", priority: "high", due: 2, timeline: [-5, 2], text: { format: "6 talent, release forms" }, checkbox: { approved: false }, createdBy: "minh", createdDaysAgo: 7 },
      { group: "Shooting", name: "Saigon South campus b-roll", owner: ["minh"], status: "working", priority: "high", due: 3, timeline: [1, 3], text: { format: "4K, 2 days" }, checkbox: { approved: true }, createdBy: "minh", createdDaysAgo: 4 },
      { group: "Shooting", name: "Masterclass speaker interviews", owner: ["minh", "linh"], status: "not_started", priority: "medium", due: 8, timeline: [7, 8], text: { format: "3 interviews, 2 cam" }, checkbox: { approved: true }, createdBy: "danh", createdDaysAgo: 3 },
      { group: "Post-production", name: "Hero film – colour grade", owner: ["duc"], status: "working", priority: "critical", due: 5, timeline: [2, 5], text: { format: "Master + 6 cutdowns" }, checkbox: { approved: false }, files: ["HeroFilm_v2_offline.mp4"], createdBy: "minh", createdDaysAgo: 5 },
      { group: "Post-production", name: "DOOH motion loops – 10s", owner: ["duc"], status: "stuck", priority: "high", due: 0, timeline: [-4, 0], text: { format: "6 formats" }, checkbox: { approved: false }, createdBy: "jun", createdDaysAgo: 8, description: "Blocked on final network specs from the media agency." },
      { group: "Post-production", name: "Welcome video loop – 60s", owner: ["minh"], status: "working", priority: "high", due: 7, timeline: [-1, 7], text: { format: "60s loop, no audio" }, checkbox: { approved: false }, createdBy: "priya", createdDaysAgo: 3 },
      { group: "Client Review", name: "Scholarship campaign 30s TVC", owner: ["minh"], status: "waiting", priority: "high", due: 2, timeline: [-9, 2], text: { format: "30s + 15s" }, checkbox: { approved: false }, createdBy: "joanne", createdDaysAgo: 12 },
      { group: "Client Review", name: "Campus tour 360° video", owner: ["duc", "ravi"], status: "waiting", priority: "medium", due: -2, timeline: [-12, -2], text: { format: "360°, web embed" }, checkbox: { approved: false }, createdBy: "jun", createdDaysAgo: 14 },
      { group: "Delivered", name: "Graduation highlights reel", owner: ["minh"], status: "done", priority: "medium", due: -11, timeline: [-18, -11], text: { format: "2min + 30s social" }, checkbox: { approved: true }, createdBy: "emily", createdDaysAgo: 22 },
      { group: "Delivered", name: "Welcome week recap", owner: ["linh"], status: "done", priority: "low", due: -16, text: { format: "45s vertical" }, checkbox: { approved: true }, createdBy: "chloe", createdDaysAgo: 24 },
    ],
  },
  {
    key: "brand",
    name: "Brand Guidelines Refresh",
    description: "Refreshing the visual identity system: typography, colour, photography and templates.",
    team: "brand",
    owner: "sarah",
    visibility: "WORKSPACE",
    type: "MAIN",
    color: "purple",
    icon: "sparkles",
    groups: [
      { name: "Discovery", color: "gray" },
      { name: "Design", color: "purple" },
      { name: "Internal Review", color: "sky" },
      { name: "Stakeholder Review", color: "amber" },
      { name: "Approved", color: "green" },
    ],
    columns: [
      { key: "owner", name: "Owner", type: "PERSON" },
      { key: "status", name: "Status", type: "STATUS" },
      { key: "priority", name: "Priority", type: "PRIORITY" },
      { key: "due", name: "Due Date", type: "DATE" },
      { key: "dependency", name: "Dependency", type: "DEPENDENCY" },
      { key: "brief", name: "Reference", type: "LINK" },
      { key: "notes", name: "Notes", type: "LONG_TEXT", width: 240 },
    ],
    items: [
      { group: "Discovery", name: "Audit of current brand assets", owner: ["sarah"], status: "done", priority: "high", due: -12, link: { brief: { url: "https://example.rmit.local/brand/audit", text: "Audit deck" } }, createdBy: "sarah", createdDaysAgo: 20 },
      { group: "Discovery", name: "Stakeholder interviews – 8 faculties", owner: ["sarah", "priya"], status: "working", priority: "medium", due: 5, text: { notes: "5 of 8 complete. Business and Design remaining." }, createdBy: "sarah", createdDaysAgo: 12 },
      { group: "Design", name: "Typography system – secondary typeface", owner: ["danh"], status: "working", priority: "high", due: 4, createdBy: "sarah", createdDaysAgo: 8, dependsOn: ["Audit of current brand assets"] },
      { group: "Design", name: "Colour palette extension", owner: ["duc"], status: "not_started", priority: "medium", due: 9, createdBy: "sarah", createdDaysAgo: 4, dependsOn: ["Typography system – secondary typeface"] },
      { group: "Design", name: "Photography style guide", owner: ["emily"], status: "waiting", priority: "medium", due: 7, text: { notes: "Waiting on sample shoot from Video & Motion." }, createdBy: "sarah", createdDaysAgo: 6 },
      { group: "Design", name: "PowerPoint and Word templates", owner: ["linh"], status: "not_started", priority: "low", due: 18, createdBy: "sarah", createdDaysAgo: 2, dependsOn: ["Typography system – secondary typeface", "Colour palette extension"] },
      { group: "Internal Review", name: "Logo clear-space rules", owner: ["danh"], status: "waiting", priority: "medium", due: 1, createdBy: "sarah", createdDaysAgo: 9 },
      { group: "Stakeholder Review", name: "Co-branding guidance for partners", owner: ["sarah", "ben"], status: "waiting", priority: "high", due: -3, link: { brief: { url: "https://example.rmit.local/brand/cobrand", text: "Draft v2" } }, createdBy: "joanne", createdDaysAgo: 15 },
      { group: "Approved", name: "Brand refresh objectives", owner: ["sarah"], status: "done", priority: "critical", due: -22, createdBy: "sarah", createdDaysAgo: 30 },
      { group: "Approved", name: "Accessibility colour contrast matrix", owner: ["tom"], status: "done", priority: "high", due: -6, createdBy: "sarah", createdDaysAgo: 14 },
    ],
  },
  {
    key: "website",
    name: "Website Redesign",
    description: "Course pages, navigation and landing templates for the 2027 intake.",
    team: "digital",
    owner: "tom",
    visibility: "TEAM",
    type: "MAIN",
    color: "cyan",
    icon: "monitor",
    viewers: ["emily", "sarah"],
    groups: [
      { name: "Backlog", color: "gray" },
      { name: "This Sprint", color: "cyan" },
      { name: "In Progress", color: "orange" },
      { name: "QA", color: "violet" },
      { name: "Done", color: "green" },
    ],
    columns: [
      { key: "owner", name: "Assignee", type: "PERSON" },
      { key: "status", name: "Status", type: "STATUS" },
      { key: "priority", name: "Priority", type: "PRIORITY" },
      { key: "due", name: "Due Date", type: "DATE" },
      { key: "points", name: "Story points", type: "NUMBER" },
      { key: "channel", name: "Area", type: "TAGS" },
      { key: "brief", name: "Design", type: "LINK" },
    ],
    items: [
      { group: "Backlog", name: "Dark mode for course finder", owner: [], status: "not_started", priority: "low", number: { points: 5 }, tags: ["Course finder"], createdBy: "tom", createdDaysAgo: 1 },
      { group: "Backlog", name: "Compare courses side by side", owner: [], status: "not_started", priority: "medium", number: { points: 8 }, tags: ["Course finder"], createdBy: "tom", createdDaysAgo: 2 },
      { group: "Backlog", name: "Alumni stories hub", owner: ["grace"], status: "not_started", priority: "low", due: 28, number: { points: 8 }, tags: ["Content"], createdBy: "grace", createdDaysAgo: 3 },
      { group: "This Sprint", name: "Course page hero redesign", owner: ["tom"], status: "working", priority: "high", due: 4, number: { points: 5 }, tags: ["Course pages"], link: { brief: { url: "https://example.rmit.local/figma/course-hero", text: "Figma" } }, createdBy: "tom", createdDaysAgo: 6 },
      { group: "This Sprint", name: "Mega menu navigation", owner: ["tom", "ravi"], status: "working", priority: "critical", due: 3, number: { points: 13 }, tags: ["Navigation"], link: { brief: { url: "https://example.rmit.local/figma/mega-menu", text: "Figma" } }, createdBy: "jun", createdDaysAgo: 9 },
      { group: "This Sprint", name: "Fee calculator component", owner: ["ravi"], status: "not_started", priority: "high", due: 6, number: { points: 8 }, tags: ["Course pages"], createdBy: "jun", createdDaysAgo: 4 },
      { group: "In Progress", name: "Landing page template – campaigns", owner: ["hil"], status: "working", priority: "high", due: 2, number: { points: 8 }, tags: ["Templates"], link: { brief: { url: "https://example.rmit.local/figma/landing", text: "Figma" } }, createdBy: "jun", createdDaysAgo: 10 },
      { group: "In Progress", name: "Masterclass registration form", owner: ["ravi", "hil"], status: "stuck", priority: "critical", due: 0, number: { points: 5 }, tags: ["Forms"], createdBy: "jun", createdDaysAgo: 7, description: "CRM endpoint keeps timing out for international phone formats." },
      { group: "In Progress", name: "Image optimisation pipeline", owner: ["ravi"], status: "working", priority: "medium", due: 5, number: { points: 3 }, tags: ["Performance"], createdBy: "ravi", createdDaysAgo: 5 },
      { group: "QA", name: "Accessibility audit – course pages", owner: ["tom"], status: "waiting", priority: "high", due: 1, number: { points: 5 }, tags: ["Course pages", "Accessibility"], createdBy: "jun", createdDaysAgo: 8 },
      { group: "QA", name: "Cross-browser test – navigation", owner: ["hil"], status: "waiting", priority: "medium", due: -1, number: { points: 2 }, tags: ["Navigation"], createdBy: "jun", createdDaysAgo: 9 },
      { group: "Done", name: "Design tokens exported to CSS", owner: ["ravi"], status: "done", priority: "high", due: -5, number: { points: 3 }, tags: ["Design system"], createdBy: "tom", createdDaysAgo: 12 },
      { group: "Done", name: "Analytics events spec", owner: ["jun"], status: "done", priority: "medium", due: -9, number: { points: 3 }, tags: ["Analytics"], createdBy: "jun", createdDaysAgo: 15 },
      { group: "Done", name: "Component library kickoff", owner: ["tom", "ravi"], status: "done", priority: "high", due: -18, number: { points: 5 }, tags: ["Design system"], createdBy: "tom", createdDaysAgo: 25 },
    ],
  },
  {
    key: "social",
    name: "Social Content Calendar Q4",
    description: "Planned posts across Instagram, TikTok, LinkedIn and Facebook for October–December.",
    team: "content",
    owner: "chloe",
    visibility: "WORKSPACE",
    type: "MAIN",
    color: "teal",
    icon: "message-square",
    groups: [
      { name: "Ideas", color: "gray" },
      { name: "Writing", color: "orange" },
      { name: "Design", color: "teal" },
      { name: "Scheduled", color: "sky" },
      { name: "Published", color: "green" },
    ],
    columns: [
      { key: "owner", name: "Owner", type: "PERSON" },
      { key: "status", name: "Status", type: "STATUS" },
      { key: "priority", name: "Priority", type: "PRIORITY" },
      { key: "due", name: "Publish Date", type: "DATE" },
      { key: "channel", name: "Channel", type: "TAGS" },
      { key: "copy", name: "Caption", type: "LONG_TEXT", width: 260 },
      { key: "approved", name: "Approved", type: "CHECKBOX" },
    ],
    items: [
      { group: "Ideas", name: "Day in the life – exchange student", owner: ["chloe"], status: "not_started", priority: "low", tags: ["TikTok", "Instagram"], checkbox: { approved: false }, createdBy: "chloe", createdDaysAgo: 1 },
      { group: "Ideas", name: "Meet the makers – fashion studio", owner: ["jane"], status: "not_started", priority: "low", due: 21, tags: ["Instagram"], checkbox: { approved: false }, createdBy: "grace", createdDaysAgo: 2 },
      { group: "Ideas", name: "Graduate outcomes infographic", owner: ["grace"], status: "not_started", priority: "medium", due: 19, tags: ["LinkedIn"], checkbox: { approved: false }, createdBy: "grace", createdDaysAgo: 3 },
      { group: "Writing", name: "Scholarship applications open", owner: ["jane"], status: "working", priority: "critical", due: 2, tags: ["Facebook", "Instagram", "LinkedIn"], text: { copy: "Applications for 2027 scholarships are now open. Find out if you're eligible…" }, checkbox: { approved: false }, createdBy: "chloe", createdDaysAgo: 4 },
      { group: "Writing", name: "Open Day countdown – 2 weeks", owner: ["chloe"], status: "working", priority: "high", due: 3, tags: ["Instagram", "TikTok"], checkbox: { approved: false }, createdBy: "chloe", createdDaysAgo: 3 },
      { group: "Writing", name: "Research spotlight – urban water", owner: ["grace"], status: "waiting", priority: "medium", due: 6, tags: ["LinkedIn"], text: { copy: "Draft with the research office for fact check." }, checkbox: { approved: false }, createdBy: "grace", createdDaysAgo: 5 },
      { group: "Design", name: "Study tips carousel – part 2", owner: ["tuyet"], status: "working", priority: "medium", due: 4, tags: ["Instagram"], checkbox: { approved: true }, createdBy: "chloe", createdDaysAgo: 6 },
      { group: "Design", name: "Alumni quote tiles – 6 pack", owner: ["linh"], status: "not_started", priority: "low", due: 9, tags: ["LinkedIn", "Instagram"], checkbox: { approved: true }, createdBy: "chloe", createdDaysAgo: 2 },
      { group: "Design", name: "Campus in spring – reel", owner: ["minh"], status: "working", priority: "medium", due: 1, tags: ["Instagram", "TikTok"], checkbox: { approved: true }, createdBy: "chloe", createdDaysAgo: 5 },
      { group: "Scheduled", name: "Library extended hours", owner: ["jane"], status: "done", priority: "low", due: 1, tags: ["Facebook", "Instagram"], checkbox: { approved: true }, createdBy: "jane", createdDaysAgo: 4 },
      { group: "Scheduled", name: "Masterclass registration reminder", owner: ["chloe"], status: "done", priority: "high", due: 0, tags: ["LinkedIn", "Facebook"], checkbox: { approved: true }, createdBy: "chloe", createdDaysAgo: 3 },
      { group: "Published", name: "Welcome to semester – campus tour", owner: ["chloe", "minh"], status: "done", priority: "medium", due: -6, tags: ["TikTok", "Instagram"], checkbox: { approved: true }, createdBy: "chloe", createdDaysAgo: 13 },
      { group: "Published", name: "Industry partner announcement", owner: ["grace"], status: "done", priority: "high", due: -9, tags: ["LinkedIn"], checkbox: { approved: true }, createdBy: "grace", createdDaysAgo: 16 },
    ],
  },
  {
    key: "sem2archive",
    name: "Semester 2 2025 Campaign",
    description: "Archived: last year's Semester 2 recruitment campaign.",
    team: "campaigns",
    owner: "joanne",
    visibility: "WORKSPACE",
    type: "MAIN",
    color: "gray",
    icon: "megaphone",
    archived: true,
    groups: [
      { name: "Live", color: "green" },
      { name: "Completed", color: "gray" },
    ],
    columns: [
      { key: "owner", name: "Owner", type: "PERSON" },
      { key: "status", name: "Status", type: "STATUS" },
      { key: "priority", name: "Priority", type: "PRIORITY" },
      { key: "due", name: "Due Date", type: "DATE" },
    ],
    items: [
      { group: "Completed", name: "Sem 2 key visual", owner: ["danh"], status: "done", priority: "high", due: -120, createdBy: "joanne", createdDaysAgo: 150 },
      { group: "Completed", name: "Sem 2 paid social", owner: ["jun"], status: "done", priority: "high", due: -100, createdBy: "jun", createdDaysAgo: 140 },
      { group: "Completed", name: "Sem 2 campaign wrap report", owner: ["joanne"], status: "done", priority: "medium", due: -80, createdBy: "joanne", createdDaysAgo: 120 },
    ],
  },
];

// ---- Builder ---------------------------------------------------------------

function iso(date: Date): string {
  return date.toISOString();
}

export function buildSeed(now: Date = new Date()): SeedBundle {
  counters.clear();
  const createdBase = subDays(now, 45);

  const users: User[] = USER_SPECS.map((spec) => ({
    id: SEED_USER_IDS[spec.key],
    email: `${spec.key}@rmit.local`,
    firstName: spec.firstName,
    lastName: spec.lastName,
    displayName: `${spec.firstName} ${spec.lastName}`,
    avatarUrl: null,
    jobTitle: spec.jobTitle,
    department: spec.department,
    timezone: spec.timezone,
    deactivatedAt: null,
    createdAt: iso(createdBase),
    updatedAt: iso(createdBase),
  }));

  const workspace: Workspace = {
    id: SEED_WORKSPACE_ID,
    name: "RMIT Creative Team",
    slug: SEED_WORKSPACE_SLUG,
    logoUrl: null,
    createdAt: iso(createdBase),
    updatedAt: iso(createdBase),
  };

  const workspaceMembers: WorkspaceMember[] = USER_SPECS.map((spec) => ({
    id: sid("member"),
    workspaceId: workspace.id,
    userId: SEED_USER_IDS[spec.key],
    role: spec.role,
    status: "ACTIVE",
    joinedAt: iso(createdBase),
  }));

  const teams: Team[] = TEAM_SPECS.map((spec) => ({
    id: SEED_TEAM_IDS[spec.key],
    workspaceId: workspace.id,
    name: spec.name,
    description: spec.description,
    color: spec.color,
    icon: spec.icon,
    archivedAt: null,
    createdAt: iso(createdBase),
    updatedAt: iso(createdBase),
  }));

  const teamMembers: TeamMember[] = TEAM_SPECS.flatMap((spec) => [
    { id: sid("member"), teamId: SEED_TEAM_IDS[spec.key], userId: SEED_USER_IDS[spec.lead], role: "LEAD" as const },
    ...spec.members.map((m) => ({
      id: sid("member"),
      teamId: SEED_TEAM_IDS[spec.key],
      userId: SEED_USER_IDS[m],
      role: "MEMBER" as const,
    })),
  ]);

  const boards: Board[] = [];
  const boardMembers: BoardMember[] = [];
  const boardGroups: BoardGroup[] = [];
  const boardColumns: BoardColumn[] = [];
  const items: Item[] = [];
  const itemColumnValues: ItemColumnValue[] = [];
  const activities: Activity[] = [];
  const itemIdByBoardAndName = new Map<string, string>();

  for (const spec of BOARD_SPECS) {
    const boardId = SEED_BOARD_IDS[spec.key];
    const boardCreated = subDays(now, 40);
    boards.push({
      id: boardId,
      workspaceId: workspace.id,
      teamId: SEED_TEAM_IDS[spec.team],
      name: spec.name,
      slug: slugify(spec.name),
      description: spec.description,
      type: spec.type,
      visibility: spec.visibility,
      ownerId: SEED_USER_IDS[spec.owner],
      color: spec.color,
      icon: spec.icon,
      archivedAt: spec.archived ? iso(subDays(now, 60)) : null,
      createdAt: iso(boardCreated),
      updatedAt: iso(subDays(now, spec.archived ? 60 : 1)),
    });

    // Members: owner + team members as editors, optional viewers.
    const teamSpec = TEAM_SPECS.find((t) => t.key === spec.team);
    const editorKeys = new Set<UserKey>([spec.owner, ...(teamSpec ? [teamSpec.lead, ...teamSpec.members] : [])]);
    for (const key of editorKeys) {
      boardMembers.push({
        id: sid("member"),
        boardId,
        userId: SEED_USER_IDS[key],
        role: key === spec.owner ? "OWNER" : "EDITOR",
      });
    }
    for (const key of spec.viewers ?? []) {
      if (editorKeys.has(key)) continue;
      boardMembers.push({ id: sid("member"), boardId, userId: SEED_USER_IDS[key], role: "VIEWER" });
    }

    const groupIdByName = new Map<string, string>();
    spec.groups.forEach((g, index) => {
      const id = sid("group");
      groupIdByName.set(g.name, id);
      boardGroups.push({
        id,
        boardId,
        name: g.name,
        color: g.color,
        position: index,
        collapsed: false,
        createdAt: iso(boardCreated),
      });
    });

    const columnByKey = new Map<string, BoardColumn>();
    spec.columns.forEach((c, index) => {
      const column: BoardColumn = {
        id: sid("column"),
        boardId,
        name: c.name,
        type: c.type,
        settings: defaultSettingsFor(c.type),
        position: index,
        width: c.width ?? DEFAULT_COLUMN_WIDTHS[c.type],
        hidden: false,
        createdAt: iso(boardCreated),
      };
      columnByKey.set(c.key, column);
      boardColumns.push(column);
    });

    const pushValue = (itemId: string, columnKey: string, value: ColumnValue | null): void => {
      const column = columnByKey.get(columnKey);
      if (!column || value === null) return;
      itemColumnValues.push({ id: sid("value"), itemId, columnId: column.id, value, updatedAt: iso(subDays(now, 1)) });
    };

    const applyItemValues = (
      itemId: string,
      itemSpec: Pick<SeedItemSpec, "owner" | "status" | "priority" | "due" | "timeline" | "tags" | "text" | "number" | "checkbox" | "link" | "requester" | "files">,
      creatorId: string,
    ): void => {
      if (itemSpec.owner) pushValue(itemId, "owner", { type: "PERSON", userIds: itemSpec.owner.map((k) => SEED_USER_IDS[k]) });
      if (itemSpec.requester) pushValue(itemId, "requester", { type: "PERSON", userIds: itemSpec.requester.map((k) => SEED_USER_IDS[k]) });
      if (itemSpec.status) pushValue(itemId, "status", { type: "STATUS", labelId: itemSpec.status });
      if (itemSpec.priority) pushValue(itemId, "priority", { type: "PRIORITY", labelId: itemSpec.priority });
      if (itemSpec.due !== undefined) pushValue(itemId, "due", { type: "DATE", date: toISODate(addDays(now, itemSpec.due)) });
      if (itemSpec.timeline) {
        pushValue(itemId, "timeline", {
          type: "TIMELINE",
          start: toISODate(addDays(now, itemSpec.timeline[0])),
          end: toISODate(addDays(now, itemSpec.timeline[1])),
        });
      }
      if (itemSpec.tags) {
        const tagsColumn = columnByKey.get("channel") ? "channel" : "market";
        pushValue(itemId, tagsColumn, { type: "TAGS", tags: itemSpec.tags });
      }
      for (const [key, text] of Object.entries(itemSpec.text ?? {})) {
        const column = columnByKey.get(key);
        if (!column) continue;
        pushValue(itemId, key, column.type === "LONG_TEXT" ? { type: "LONG_TEXT", text } : { type: "TEXT", text });
      }
      for (const [key, number] of Object.entries(itemSpec.number ?? {})) pushValue(itemId, key, { type: "NUMBER", number });
      for (const [key, checked] of Object.entries(itemSpec.checkbox ?? {})) pushValue(itemId, key, { type: "CHECKBOX", checked });
      for (const [key, link] of Object.entries(itemSpec.link ?? {})) pushValue(itemId, key, { type: "LINK", url: link.url, text: link.text });
      if (itemSpec.files) {
        const files: AttachmentMeta[] = itemSpec.files.map((filename, index) => ({
          id: `${itemId}-file-${index}`,
          filename,
          size: 2_400_000 + index * 10_000,
          mimeType: filename.endsWith(".pdf") ? "application/pdf" : "application/octet-stream",
          url: `local://attachments/${filename}`,
          uploadedBy: creatorId,
          uploadedAt: iso(subDays(now, 2)),
        }));
        pushValue(itemId, "files", { type: "FILES", files });
      }
    };

    const positionByGroup = new Map<string, number>();
    for (const itemSpec of spec.items) {
      const groupId = groupIdByName.get(itemSpec.group);
      if (!groupId) throw new Error(`Seed group ${itemSpec.group} missing on ${spec.name}`);
      const position = positionByGroup.get(groupId) ?? 0;
      positionByGroup.set(groupId, position + 1);
      const creatorId = SEED_USER_IDS[itemSpec.createdBy ?? spec.owner];
      const created = subDays(now, itemSpec.createdDaysAgo ?? 7);
      const itemId = sid("item");
      itemIdByBoardAndName.set(`${boardId}:${itemSpec.name}`, itemId);
      items.push({
        id: itemId,
        boardId,
        groupId,
        parentItemId: null,
        name: itemSpec.name,
        description: itemSpec.description ?? null,
        position,
        createdBy: creatorId,
        archivedAt: null,
        createdAt: iso(created),
        updatedAt: iso(subHours(now, 6)),
      });
      applyItemValues(itemId, itemSpec, creatorId);
      activities.push({
        id: sid("activity"),
        workspaceId: workspace.id,
        boardId,
        itemId,
        actorId: creatorId,
        eventType: "ITEM_CREATED",
        metadata: { itemName: itemSpec.name, boardName: spec.name, groupName: itemSpec.group },
        createdAt: iso(created),
      });

      itemSpec.subitems?.forEach((sub, index) => {
        const subId = sid("item");
        items.push({
          id: subId,
          boardId,
          groupId,
          parentItemId: itemId,
          name: sub.name,
          description: null,
          position: index,
          createdBy: creatorId,
          archivedAt: null,
          createdAt: iso(addDays(created, 1)),
          updatedAt: iso(subHours(now, 8)),
        });
        applyItemValues(subId, sub, creatorId);
      });
    }

    // Dependencies (second pass so referenced items exist).
    for (const itemSpec of spec.items) {
      if (!itemSpec.dependsOn) continue;
      const itemId = itemIdByBoardAndName.get(`${boardId}:${itemSpec.name}`);
      if (!itemId) continue;
      const dependencyIds = itemSpec.dependsOn
        .map((name) => itemIdByBoardAndName.get(`${boardId}:${name}`))
        .filter((id): id is string => Boolean(id));
      if (columnByKey.has("dependency")) {
        pushValue(itemId, "dependency", { type: "DEPENDENCY", itemIds: dependencyIds });
      }
    }
  }

  // ---- Curated recent activity (human-readable history) ---------------------
  const itemId = (board: BoardKey, name: string): string => {
    const id = itemIdByBoardAndName.get(`${SEED_BOARD_IDS[board]}:${name}`);
    if (!id) throw new Error(`Seed item ${name} missing on ${board}`);
    return id;
  };

  const recent: Array<Omit<Activity, "id" | "workspaceId">> = [
    { boardId: SEED_BOARD_IDS.rmitinerary, itemId: itemId("rmitinerary", "RMITinerary High Achiever"), actorId: SEED_USER_IDS.danh, eventType: "ITEM_COLUMN_VALUE_UPDATED", metadata: { itemName: "RMITinerary High Achiever", columnName: "Status", columnType: "STATUS", from: "Working On It", to: "Done" }, createdAt: iso(subMinutes(now, 35)) },
    { boardId: SEED_BOARD_IDS.sem1, itemId: itemId("sem1", "Sem 1 DOOH adaptation"), actorId: SEED_USER_IDS.jun, eventType: "ITEM_COLUMN_VALUE_UPDATED", metadata: { itemName: "Sem 1 DOOH adaptation", columnName: "Owner", columnType: "PERSON", addedUserIds: [SEED_USER_IDS.danh], removedUserIds: [] }, createdAt: iso(subHours(now, 2)) },
    { boardId: SEED_BOARD_IDS.rmitinerary, itemId: itemId("rmitinerary", "Cover concept – final artwork"), actorId: SEED_USER_IDS.joanne, eventType: "ITEM_COLUMN_VALUE_UPDATED", metadata: { itemName: "Cover concept – final artwork", columnName: "Due Date", columnType: "DATE", from: toISODate(addDays(now, 1)), to: toISODate(addDays(now, 3)) }, createdAt: iso(subHours(now, 3)) },
    { boardId: SEED_BOARD_IDS.masterclass, itemId: itemId("masterclass", "Masterclass landing page hero"), actorId: SEED_USER_IDS.hil, eventType: "ITEM_COLUMN_VALUE_UPDATED", metadata: { itemName: "Masterclass landing page hero", columnName: "Status", columnType: "STATUS", from: "Working On It", to: "Stuck" }, createdAt: iso(subHours(now, 5)) },
    { boardId: SEED_BOARD_IDS.rmitinerary, itemId: itemId("rmitinerary", "Review stakeholder feedback"), actorId: SEED_USER_IDS.joanne, eventType: "ITEM_MOVED", metadata: { itemName: "Review stakeholder feedback", fromGroupName: "Design", toGroupName: "Stakeholder Review" }, createdAt: iso(subHours(now, 20)) },
    { boardId: SEED_BOARD_IDS.sem1, itemId: itemId("sem1", "Paid social – phase 1"), actorId: SEED_USER_IDS.jun, eventType: "ITEM_COLUMN_VALUE_UPDATED", metadata: { itemName: "Paid social – phase 1", columnName: "Status", columnType: "STATUS", from: "Working On It", to: "Done" }, createdAt: iso(subDays(now, 1)) },
    { boardId: SEED_BOARD_IDS.dooh, itemId: itemId("dooh", "Shopping centre network – 6 sites"), actorId: SEED_USER_IDS.duc, eventType: "ITEM_COLUMN_VALUE_UPDATED", metadata: { itemName: "Shopping centre network – 6 sites", columnName: "Status", columnType: "STATUS", from: "Working On It", to: "Stuck" }, createdAt: iso(subDays(now, 1)) },
    { boardId: SEED_BOARD_IDS.requests, itemId: itemId("requests", "Scholarship info session slides"), actorId: SEED_USER_IDS.joanne, eventType: "ITEM_CREATED", metadata: { itemName: "Scholarship info session slides", boardName: "Creative Requests", groupName: "New Requests" }, createdAt: iso(subHours(now, 1)) },
  ];
  for (const a of recent) activities.push({ ...a, id: sid("activity"), workspaceId: workspace.id });

  // ---- Task links (cross-team pairs kept in sync) ---------------------------
  const linkPair = (a: [BoardKey, string], b: [BoardKey, string], createdBy: UserKey, daysAgo: number): ItemLink => {
    const [itemAId, itemBId] = normaliseLinkPair(itemId(a[0], a[1]), itemId(b[0], b[1]));
    return { id: sid("link"), workspaceId: workspace.id, itemAId, itemBId, createdBy: SEED_USER_IDS[createdBy], createdAt: iso(subDays(now, daysAgo)) };
  };
  const itemLinks: ItemLink[] = [
    // Melbourne campaign task mirrored on the Vietnam studio's production board.
    linkPair(["sem1", "Sem 1 DOOH adaptation"], ["dooh", "Sem 1 DOOH adaptation"], "jun", 4),
    // Events brief mirrored on the video pipeline.
    linkPair(["openday", "Welcome video loop – 60s"], ["video", "Welcome video loop – 60s"], "priya", 3),
  ];
  for (const link of itemLinks) {
    const a = items.find((i) => i.id === link.itemAId)!;
    const b = items.find((i) => i.id === link.itemBId)!;
    for (const [from, to] of [[a, b], [b, a]] as const) {
      activities.push({
        id: sid("activity"),
        workspaceId: workspace.id,
        boardId: from.boardId,
        itemId: from.id,
        actorId: link.createdBy,
        eventType: "ITEM_LINKED",
        metadata: { itemName: from.name, linkedItemName: to.name, linkedBoardName: boards.find((bd) => bd.id === to.boardId)?.name },
        createdAt: link.createdAt,
      });
    }
  }

  // ---- Comments -------------------------------------------------------------
  const comments: Comment[] = [
    { id: sid("comment"), itemId: itemId("masterclass", "Masterclass landing page hero"), authorId: SEED_USER_IDS.emily, body: "@Danh Nguyen can you check the crop on the hero for the Vietnam version? The speaker's name is being cut off at 1280px.", mentionUserIds: [SEED_USER_IDS.danh], createdAt: iso(subHours(now, 4)), updatedAt: iso(subHours(now, 4)) },
    { id: sid("comment"), itemId: itemId("masterclass", "Masterclass landing page hero"), authorId: SEED_USER_IDS.hil, body: "Still blocked on the approved photography from Melbourne. Using placeholders for now so we can review layout.", mentionUserIds: [], createdAt: iso(subHours(now, 5)), updatedAt: iso(subHours(now, 5)) },
    { id: sid("comment"), itemId: itemId("rmitinerary", "Review stakeholder feedback"), authorId: SEED_USER_IDS.joanne, body: "Student Recruitment want the High Achiever spread to lead with the scholarship pathway. I've added their notes to the shared folder.", mentionUserIds: [], createdAt: iso(subHours(now, 22)), updatedAt: iso(subHours(now, 22)) },
    { id: sid("comment"), itemId: itemId("rmitinerary", "Review stakeholder feedback"), authorId: SEED_USER_IDS.danh, body: "Thanks @Joanne Walsh. I'll rework the opening spread tomorrow and push the export.", mentionUserIds: [SEED_USER_IDS.joanne], createdAt: iso(subHours(now, 19)), updatedAt: iso(subHours(now, 19)) },
    { id: sid("comment"), itemId: itemId("rmitinerary", "Cover concept – final artwork"), authorId: SEED_USER_IDS.joanne, body: "Moved the due date out two days so the printer can confirm the spot UV area first.", mentionUserIds: [], createdAt: iso(subHours(now, 3)), updatedAt: iso(subHours(now, 3)) },
    { id: sid("comment"), itemId: itemId("sem1", "Media plan sign-off"), authorId: SEED_USER_IDS.joanne, body: "Budget still not confirmed. Escalating to the Director this afternoon.", mentionUserIds: [], createdAt: iso(subDays(now, 1)), updatedAt: iso(subDays(now, 1)) },
    { id: sid("comment"), itemId: itemId("dooh", "Shopping centre network – 6 sites"), authorId: SEED_USER_IDS.duc, body: "Two of the six sites use 1080x1350. @Jun Tanaka can you chase the agency for the full spec sheet?", mentionUserIds: [SEED_USER_IDS.jun], createdAt: iso(subDays(now, 1)), updatedAt: iso(subDays(now, 1)) },
    { id: sid("comment"), itemId: itemId("sem1", "Sem 1 campaign storyboard"), authorId: SEED_USER_IDS.emily, body: "Frames 4–7 need to show the Saigon South campus. Let's review together on Thursday.", mentionUserIds: [], createdAt: iso(subDays(now, 2)), updatedAt: iso(subDays(now, 2)) },
    { id: sid("comment"), itemId: itemId("openday", "Campus banner artwork – round 2"), authorId: SEED_USER_IDS.priya, body: "@Danh Nguyen Facilities have sent revised measurements for Building 80 – 3.2m x 9m, not 3m x 8m. Can we adjust before Friday?", mentionUserIds: [SEED_USER_IDS.danh], createdAt: iso(subHours(now, 6)), updatedAt: iso(subHours(now, 6)) },
    { id: sid("comment"), itemId: itemId("website", "Masterclass registration form"), authorId: SEED_USER_IDS.ravi, body: "Root cause found: the CRM rejects +84 numbers with spaces. Normalising on submit. @Hil Pham can you retest the Vietnam flow after the deploy?", mentionUserIds: [SEED_USER_IDS.hil], createdAt: iso(subHours(now, 3)), updatedAt: iso(subHours(now, 3)) },
    { id: sid("comment"), itemId: itemId("video", "Hero film – colour grade"), authorId: SEED_USER_IDS.emily, body: "Loving the warmer look on the campus exteriors. Interviews still feel a touch green.", mentionUserIds: [], createdAt: iso(subHours(now, 9)), updatedAt: iso(subHours(now, 9)) },
    { id: sid("comment"), itemId: itemId("brand", "Co-branding guidance for partners"), authorId: SEED_USER_IDS.ben, body: "From the agency side this reads well. One request: a minimum size rule for the partner logo when the lockup is stacked.", mentionUserIds: [], createdAt: iso(subDays(now, 1)), updatedAt: iso(subDays(now, 1)) },
  ];
  for (const c of comments) {
    activities.push({
      id: sid("activity"),
      workspaceId: workspace.id,
      boardId: items.find((i) => i.id === c.itemId)?.boardId ?? null,
      itemId: c.itemId,
      actorId: c.authorId,
      eventType: "COMMENT_ADDED",
      metadata: { itemName: items.find((i) => i.id === c.itemId)?.name },
      createdAt: c.createdAt,
    });
  }

  // ---- Notifications --------------------------------------------------------
  const notifications: Notification[] = [
    { id: sid("notification"), userId: SEED_USER_IDS.danh, type: "MENTION", title: "Emily mentioned you in Masterclass landing page hero", body: "can you check the crop on the hero for the Vietnam version?", entityType: "ITEM", entityId: itemId("masterclass", "Masterclass landing page hero"), boardId: SEED_BOARD_IDS.masterclass, actorId: SEED_USER_IDS.emily, readAt: null, createdAt: iso(subHours(now, 4)) },
    { id: sid("notification"), userId: SEED_USER_IDS.danh, type: "ASSIGNED", title: "Jun assigned you to Sem 1 DOOH adaptation", body: "Semester 1 Campaign · Production", entityType: "ITEM", entityId: itemId("sem1", "Sem 1 DOOH adaptation"), boardId: SEED_BOARD_IDS.sem1, actorId: SEED_USER_IDS.jun, readAt: null, createdAt: iso(subHours(now, 2)) },
    { id: sid("notification"), userId: SEED_USER_IDS.danh, type: "DUE_DATE_CHANGED", title: "Due date changed for Cover concept – final artwork", body: `Joanne moved the due date to ${toISODate(addDays(now, 3))}`, entityType: "ITEM", entityId: itemId("rmitinerary", "Cover concept – final artwork"), boardId: SEED_BOARD_IDS.rmitinerary, actorId: SEED_USER_IDS.joanne, readAt: null, createdAt: iso(subHours(now, 3)) },
    { id: sid("notification"), userId: SEED_USER_IDS.danh, type: "COMMENT", title: "Joanne commented on Review stakeholder feedback", body: "Student Recruitment want the High Achiever spread to lead with the scholarship pathway.", entityType: "ITEM", entityId: itemId("rmitinerary", "Review stakeholder feedback"), boardId: SEED_BOARD_IDS.rmitinerary, actorId: SEED_USER_IDS.joanne, readAt: iso(subHours(now, 18)), createdAt: iso(subHours(now, 22)) },
    { id: sid("notification"), userId: SEED_USER_IDS.danh, type: "STATUS_CHANGED", title: "Masterclass landing page hero is now Stuck", body: "Hil changed the status from Working On It", entityType: "ITEM", entityId: itemId("masterclass", "Masterclass landing page hero"), boardId: SEED_BOARD_IDS.masterclass, actorId: SEED_USER_IDS.hil, readAt: iso(subHours(now, 4)), createdAt: iso(subHours(now, 5)) },
    { id: sid("notification"), userId: SEED_USER_IDS.joanne, type: "MENTION", title: "Danh mentioned you in Review stakeholder feedback", body: "I'll rework the opening spread tomorrow and push the export.", entityType: "ITEM", entityId: itemId("rmitinerary", "Review stakeholder feedback"), boardId: SEED_BOARD_IDS.rmitinerary, actorId: SEED_USER_IDS.danh, readAt: null, createdAt: iso(subHours(now, 19)) },
    { id: sid("notification"), userId: SEED_USER_IDS.jun, type: "MENTION", title: "Duc mentioned you in Shopping centre network – 6 sites", body: "can you chase the agency for the full spec sheet?", entityType: "ITEM", entityId: itemId("dooh", "Shopping centre network – 6 sites"), boardId: SEED_BOARD_IDS.dooh, actorId: SEED_USER_IDS.duc, readAt: null, createdAt: iso(subDays(now, 1)) },
    { id: sid("notification"), userId: SEED_USER_IDS.emily, type: "STATUS_CHANGED", title: "RMITinerary High Achiever is now Done", body: "Danh changed the status from Working On It", entityType: "ITEM", entityId: itemId("rmitinerary", "RMITinerary High Achiever"), boardId: SEED_BOARD_IDS.rmitinerary, actorId: SEED_USER_IDS.danh, readAt: null, createdAt: iso(subMinutes(now, 35)) },
    { id: sid("notification"), userId: SEED_USER_IDS.danh, type: "MENTION", title: "Priya mentioned you in Campus banner artwork – round 2", body: "Facilities have sent revised measurements for Building 80", entityType: "ITEM", entityId: itemId("openday", "Campus banner artwork – round 2"), boardId: SEED_BOARD_IDS.openday, actorId: SEED_USER_IDS.priya, readAt: null, createdAt: iso(subHours(now, 6)) },
    { id: sid("notification"), userId: SEED_USER_IDS.hil, type: "MENTION", title: "Ravi mentioned you in Masterclass registration form", body: "can you retest the Vietnam flow after the deploy?", entityType: "ITEM", entityId: itemId("website", "Masterclass registration form"), boardId: SEED_BOARD_IDS.website, actorId: SEED_USER_IDS.ravi, readAt: null, createdAt: iso(subHours(now, 3)) },
    { id: sid("notification"), userId: SEED_USER_IDS.minh, type: "ASSIGNED", title: "Priya assigned you to Welcome video loop – 60s", body: "Video Production Pipeline · Post-production", entityType: "ITEM", entityId: itemId("video", "Welcome video loop – 60s"), boardId: SEED_BOARD_IDS.video, actorId: SEED_USER_IDS.priya, readAt: null, createdAt: iso(subDays(now, 3)) },
    { id: sid("notification"), userId: SEED_USER_IDS.sarah, type: "COMMENT", title: "Ben commented on Co-branding guidance for partners", body: "One request: a minimum size rule for the partner logo when the lockup is stacked.", entityType: "ITEM", entityId: itemId("brand", "Co-branding guidance for partners"), boardId: SEED_BOARD_IDS.brand, actorId: SEED_USER_IDS.ben, readAt: null, createdAt: iso(subDays(now, 1)) },
    { id: sid("notification"), userId: SEED_USER_IDS.tom, type: "STATUS_CHANGED", title: "Masterclass registration form is now Stuck", body: "Ravi changed the status from Working On It", entityType: "ITEM", entityId: itemId("website", "Masterclass registration form"), boardId: SEED_BOARD_IDS.website, actorId: SEED_USER_IDS.ravi, readAt: null, createdAt: iso(subHours(now, 4)) },
  ];

  const boardFavourites: BoardFavourite[] = [
    { id: sid("member"), boardId: SEED_BOARD_IDS.sem1, userId: SEED_USER_IDS.danh, createdAt: iso(subDays(now, 10)) },
    { id: sid("member"), boardId: SEED_BOARD_IDS.rmitinerary, userId: SEED_USER_IDS.danh, createdAt: iso(subDays(now, 9)) },
    { id: sid("member"), boardId: SEED_BOARD_IDS.sem1, userId: SEED_USER_IDS.emily, createdAt: iso(subDays(now, 20)) },
    { id: sid("member"), boardId: SEED_BOARD_IDS.alwayson, userId: SEED_USER_IDS.grace, createdAt: iso(subDays(now, 8)) },
    { id: sid("member"), boardId: SEED_BOARD_IDS.openday, userId: SEED_USER_IDS.danh, createdAt: iso(subDays(now, 2)) },
    { id: sid("member"), boardId: SEED_BOARD_IDS.website, userId: SEED_USER_IDS.tom, createdAt: iso(subDays(now, 5)) },
    { id: sid("member"), boardId: SEED_BOARD_IDS.video, userId: SEED_USER_IDS.minh, createdAt: iso(subDays(now, 5)) },
    { id: sid("member"), boardId: SEED_BOARD_IDS.social, userId: SEED_USER_IDS.chloe, createdAt: iso(subDays(now, 4)) },
    { id: sid("member"), boardId: SEED_BOARD_IDS.brand, userId: SEED_USER_IDS.sarah, createdAt: iso(subDays(now, 4)) },
  ];

  const boardVisits: BoardVisit[] = [
    { id: `${SEED_USER_IDS.danh}:${SEED_BOARD_IDS.rmitinerary}`, userId: SEED_USER_IDS.danh, boardId: SEED_BOARD_IDS.rmitinerary, visitedAt: iso(subHours(now, 1)) },
    { id: `${SEED_USER_IDS.danh}:${SEED_BOARD_IDS.masterclass}`, userId: SEED_USER_IDS.danh, boardId: SEED_BOARD_IDS.masterclass, visitedAt: iso(subHours(now, 5)) },
    { id: `${SEED_USER_IDS.danh}:${SEED_BOARD_IDS.requests}`, userId: SEED_USER_IDS.danh, boardId: SEED_BOARD_IDS.requests, visitedAt: iso(subDays(now, 1)) },
    { id: `${SEED_USER_IDS.emily}:${SEED_BOARD_IDS.sem1}`, userId: SEED_USER_IDS.emily, boardId: SEED_BOARD_IDS.sem1, visitedAt: iso(subHours(now, 2)) },
    { id: `${SEED_USER_IDS.danh}:${SEED_BOARD_IDS.openday}`, userId: SEED_USER_IDS.danh, boardId: SEED_BOARD_IDS.openday, visitedAt: iso(subHours(now, 7)) },
    { id: `${SEED_USER_IDS.tom}:${SEED_BOARD_IDS.website}`, userId: SEED_USER_IDS.tom, boardId: SEED_BOARD_IDS.website, visitedAt: iso(subHours(now, 1)) },
    { id: `${SEED_USER_IDS.minh}:${SEED_BOARD_IDS.video}`, userId: SEED_USER_IDS.minh, boardId: SEED_BOARD_IDS.video, visitedAt: iso(subHours(now, 2)) },
  ];

  return {
    users,
    workspaces: [workspace],
    workspaceMembers,
    teams,
    teamMembers,
    boards,
    boardMembers,
    boardFavourites,
    boardGroups,
    boardColumns,
    items,
    itemColumnValues,
    itemLinks,
    comments,
    activities,
    notifications,
    boardVisits,
  };
}
