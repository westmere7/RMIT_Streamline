import type { BookingFormTemplate } from "@/domain/booking/booking-template";
import type { AssetRates } from "@/domain/workspace/asset-rate";
import type { EntityId, Timestamps } from "@/domain/common/types";

export const WORKSPACE_ROLES = ["OWNER", "ADMIN", "MEMBER", "GUEST"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export interface Workspace extends Timestamps {
  id: EntityId;
  name: string;
  slug: string;
  logoUrl: string | null;
  /** Secret in the public booking link (/book/<slug>/<key>). Null until an admin first opens the workspace. */
  bookingKey?: string | null;
  /** The live booking form, as this workspace shaped it. Null or absent means the built-in form. */
  bookingForm?: BookingFormTemplate | null;
  /**
   * The form an administrator is working on, which nobody is served.
   *
   * Building a four-step form is not a five-minute job, and the whole of it
   * happens while stakeholders are still booking. The editor saves here;
   * `bookingForm` changes only when somebody publishes this onto it. Null means
   * there is no work in progress.
   */
  bookingFormDraft?: BookingFormTemplate | null;
  /** What the live form was called when it was published. */
  bookingFormName?: string | null;
  /** When the live form was last published. Null when that was before it was recorded. */
  bookingFormPublishedAt?: string | null;
  /** Tasks booked through the form since it was last published. */
  bookingFormBookings?: number | null;
  /**
   * What the stakeholder portal calls the team — "RMIT Creative", say, where the
   * workspace itself is "RMIT VN MKT". Presentation only: it never renames the
   * workspace or touches its slug, and the workspace's own name stands in when
   * it is unset.
   */
  creativeTeamName?: string | null;
  /**
   * How fast each asset type is produced, keyed by type name.
   *
   * What turns a count of deliverables into hours of work on the dashboard.
   * Absent or empty means nobody has recorded a rate yet, and the effort figure
   * says so rather than guessing. See `@/domain/workspace/asset-rate`.
   */
  assetRates?: AssetRates | null;
  /**
   * What this workspace stamps on its tickets: "CP" gives CP_001, CP_002.
   *
   * Absent means nobody has changed it and the default stands. Changing it is a
   * decision about codes already quoted in emails and spreadsheets, so the
   * tickets already handed out are left alone unless somebody asks for them to
   * be rewritten. See `@/domain/item/ticket`.
   */
  ticketPrefix?: string | null;
  /**
   * How many tickets this workspace has handed out.
   *
   * The next one is this plus one. It counts issued tickets rather than tasks,
   * so it never goes backwards: a task deleted does not free its number, and a
   * number is not reused — a ticket is what somebody was told, and telling two
   * people the same one is the fault this whole system exists to avoid.
   */
  ticketCounter?: number | null;
  /** How many bug tickets (BUG_001, …) this workspace has handed out; a series apart from `ticketCounter`. */
  bugTicketCounter?: number | null;
  /** The App development board bug reports land on, beside its built-in kind. Null until the first report makes it. */
  bugBoardId?: EntityId | null;
}

export type WorkspaceMemberStatus = "ACTIVE" | "INVITED" | "DEACTIVATED";

export interface WorkspaceMember {
  id: EntityId;
  workspaceId: EntityId;
  userId: EntityId;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
  joinedAt: string;
}
