import type { Repositories } from "@/data/repositories";
import { BoardService } from "./board-service";
import { CommentService } from "./comment-service";
import { ItemLinkService } from "./item-link-service";
import { ItemService } from "./item-service";
import { MyWorkService } from "./my-work-service";
import { SearchService } from "./search-service";
import { TrackerService } from "./tracker-service";
import { WorkspaceService } from "./workspace-service";

export interface Services {
  repos: Repositories;
  workspace: WorkspaceService;
  boards: BoardService;
  items: ItemService;
  links: ItemLinkService;
  comments: CommentService;
  myWork: MyWorkService;
  search: SearchService;
  trackers: TrackerService;
}

export function createServices(repos: Repositories): Services {
  const links = new ItemLinkService(repos);
  return {
    repos,
    workspace: new WorkspaceService(repos),
    boards: new BoardService(repos),
    items: new ItemService(repos, links),
    links,
    comments: new CommentService(repos, links),
    myWork: new MyWorkService(repos),
    search: new SearchService(repos),
    trackers: new TrackerService(repos),
  };
}

export type { BoardSnapshot, CreateItemInput, MoveItemInput, SetValueContext } from "./item-service";
export type { CreateBoardInput } from "./board-service";
export type { LinkCandidate, LinkChange, LinkedItemView, LinkOptions, LinkSearch, LinkValidation } from "./item-link-service";
export type { ColumnMapping, ColumnMappingReport } from "./item-link-sync";
export type { CellEdit, CreateTrackerInput } from "./tracker-service";
export type { ImportedWorkbook } from "./tracker-xlsx";
export type { MyWorkItem, MyWorkSection } from "./my-work-service";
export type { SearchResults } from "./search-service";
export type { WorkspaceContext, InviteMemberInput } from "./workspace-service";
