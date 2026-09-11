import type { Repositories } from "@/data/repositories";
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
import { WorkspaceListService } from "./workspace-list-service";
import { WorkspaceService } from "./workspace-service";

export interface Services {
  repos: Repositories;
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
}

export function createServices(repos: Repositories, options: ServiceOptions = {}): Services {
  const notifications = new NotificationService(repos);
  const links = new ItemLinkService(repos, notifications);
  const myWork = new MyWorkService(repos);
  const workspace = new WorkspaceService(repos);
  const items = new ItemService(repos, links, notifications);
  const assets = new ItemAssetService(repos);
  const booking = new BookingService(repos, workspace, items, assets, notifications, options.bookingTransport ?? null);
  const portals = new StakeholderPortalService(repos, options.portalTransport ?? null, (workspaceId) => booking.buildForm(workspaceId));
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
    comments: new CommentService(repos, notifications, links),
    messages: new MessageService(repos),
    profiles: new ProfileService(repos, myWork),
    myWork,
    search: new SearchService(repos),
    trackers: new TrackerService(repos),
  };
}

export type { ArchiveSnapshot, BoardSnapshot, CreateItemInput, MoveItemInput, SetValueContext } from "./item-service";
export { resolveArchiveFilters } from "./item-service";
export type { CreateBoardInput } from "./board-service";
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
