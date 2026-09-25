import type { Repositories } from "@/data/repositories";
import { AutomationEngine } from "./automation-engine";
import { AutomationService, type AutomationRunTransport } from "./automation-service";
import { BoardService } from "./board-service";
import { BoardShareService, type PublicShareTransport } from "./board-share-service";
import { BookingService, type BookingTransport } from "./booking-service";
import { CommentService } from "./comment-service";
import { DashboardService, type PublicDashboardTransport } from "./dashboard-service";
import { ItemAssetService } from "./item-asset-service";
import { ItemLinkService } from "./item-link-service";
import { ItemService } from "./item-service";
import { ItemShareService, type PublicItemTransport } from "./item-share-service";
import { MessageService } from "./message-service";
import { MyWorkService } from "./my-work-service";
import { NotificationService } from "./notification-service";
import { ProfileService } from "./profile-service";
import { SearchService } from "./search-service";
import { TrackerService } from "./tracker-service";
import { StakeholderPortalService, type PortalTransport } from "./stakeholder-portal-service";
import { TicketService } from "./ticket-service";
import { WorkspaceListService } from "./workspace-list-service";
import { WorkspaceService } from "./workspace-service";

export interface Services {
  repos: Repositories;
  /** Rules, from the side that writes them. */
  automations: AutomationService;
  /** The side that carries them out. Server only. */
  automationEngine: AutomationEngine;
  notifications: NotificationService;
  workspace: WorkspaceService;
  lists: WorkspaceListService;
  boards: BoardService;
  shares: BoardShareService;
  itemShares: ItemShareService;
  dashboard: DashboardService;
  items: ItemService;
  links: ItemLinkService;
  assets: ItemAssetService;
  comments: CommentService;
  messages: MessageService;
  profiles: ProfileService;
  myWork: MyWorkService;
  search: SearchService;
  trackers: TrackerService;
  booking: BookingService;
  portals: StakeholderPortalService;
  tickets: TicketService;
}

export interface ServiceOptions {
  /** How bookings reach the server when the browser cannot write them itself (Supabase). */
  bookingTransport?: BookingTransport | null;
  /** How a visitor without an account reads a shared board (Supabase). */
  shareTransport?: PublicShareTransport | null;
  /** The same for a single shared task. */
  itemShareTransport?: PublicItemTransport | null;
  /** How a visitor without an account reads the shared dashboard (Supabase). */
  dashboardTransport?: PublicDashboardTransport | null;
  /** How a stakeholder reads their department's portal (Supabase). */
  portalTransport?: PortalTransport | null;
  /** The zone every "at 9am" in an automation is read in. The runner sets it; a browser has no use for it. */
  automationTimezone?: string;
  /** How a quick run reaches the server (Supabase). Null runs the engine in place (local). */
  automationTransport?: AutomationRunTransport | null;
}

export function createServices(repos: Repositories, options: ServiceOptions = {}): Services {
  const notifications = new NotificationService(repos);
  const links = new ItemLinkService(repos, notifications);
  const myWork = new MyWorkService(repos);
  const workspace = new WorkspaceService(repos);
  const items = new ItemService(repos, links, notifications);
  const assets = new ItemAssetService(repos);
  const tickets = new TicketService(repos, links);
  const booking = new BookingService(repos, workspace, items, assets, notifications, tickets, options.bookingTransport ?? null);
  const portals = new StakeholderPortalService(repos, options.portalTransport ?? null, (workspaceId) => booking.buildForm(workspaceId));
  booking.useDepartments((workspaceId) => portals.ensureDepartments(workspaceId));
  const comments = new CommentService(repos, notifications, links);
  // Constructed in every set so the local provider can drive it from a test and
  // run a quick run without a server. The unattended passes are only ever
  // started from a server: see src/server/automations.ts.
  const automationEngine = new AutomationEngine(repos, items, comments, notifications, { timezone: options.automationTimezone });
  return {
    repos,
    notifications,
    workspace,
    lists: new WorkspaceListService(repos, portals),
    portals,
    boards: new BoardService(repos, notifications),
    shares: new BoardShareService(repos, options.shareTransport ?? null),
    itemShares: new ItemShareService(repos, options.itemShareTransport ?? null),
    dashboard: new DashboardService(repos, options.dashboardTransport ?? null),
    items,
    links,
    assets,
    booking,
    tickets,
    comments,
    automations: new AutomationService(repos, automationEngine, options.automationTransport ?? null),
    automationEngine,
    messages: new MessageService(repos),
    profiles: new ProfileService(repos, myWork),
    myWork,
    search: new SearchService(repos),
    trackers: new TrackerService(repos),
  };
}

export type { ArchiveSnapshot, BoardSnapshot, CreateItemInput, MoveItemInput, SetValueContext } from "./item-service";
export { resolveArchiveFilters } from "./item-service";
export { AutomationError, TEXTUAL_COLUMNS, describeAction as describeAutomationAction, describeCondition as describeAutomationCondition, describeRule, describeTrigger } from "./automation-service";
export type { AutomationRunTransport, RuleVocabulary } from "./automation-service";
export type { DrainReport } from "./automation-engine";
export type { CreateBoardInput } from "./board-service";
export { TicketError } from "./ticket-service";
export type { PrefixChange } from "./ticket-service";
export type { LinkCandidate, LinkChange, LinkedItemView, LinkOptions, LinkSearch, LinkValidation } from "./item-link-service";
export type { ColumnMapping, ColumnMappingReport } from "./item-link-sync";
export type { CellEdit, CreateTrackerInput } from "./tracker-service";
export type { ImportedWorkbook } from "./tracker-xlsx";
export type { MyWorkItem, MyWorkSection } from "./my-work-service";
export type { DirectThreadView } from "./message-service";
export type { BoardRelation, ProfileBoard, ProfileView } from "./profile-service";
export type { SearchResults } from "./search-service";
export type { SystemEntities, WorkspaceContext } from "./workspace-service";
export type { ListOptionUsage, RemoveListOption } from "./workspace-list-service";
export { PortalAccessError, portalAccessMessage, PortalSubmissionError } from "./stakeholder-portal-service";
export type { DepartmentOverview, PortalGrant, PortalTransport, PortalViewer, ResolvedPortal } from "./stakeholder-portal-service";
export type { BookingSubmission, BookingTransport } from "./booking-service";
export type { PublicShareTransport, ShareFailure, ShareSettings, ShareViewer } from "./board-share-service";
export type { PublicItemTransport } from "./item-share-service";
export type { DashboardShareSettings, PublicDashboardTransport } from "./dashboard-service";
export { ShareAccessError, shareAccessMessage } from "./board-share-service";
export { BookingAccessError } from "./booking-service";
