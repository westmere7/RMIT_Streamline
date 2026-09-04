import type { Repositories } from "@/data/repositories";
import { BoardService } from "./board-service";
import { CommentService } from "./comment-service";
import { ItemService } from "./item-service";
import { MyWorkService } from "./my-work-service";
import { SearchService } from "./search-service";
import { WorkspaceService } from "./workspace-service";

export interface Services {
  repos: Repositories;
  workspace: WorkspaceService;
  boards: BoardService;
  items: ItemService;
  comments: CommentService;
  myWork: MyWorkService;
  search: SearchService;
}

export function createServices(repos: Repositories): Services {
  return {
    repos,
    workspace: new WorkspaceService(repos),
    boards: new BoardService(repos),
    items: new ItemService(repos),
    comments: new CommentService(repos),
    myWork: new MyWorkService(repos),
    search: new SearchService(repos),
  };
}

export type { BoardSnapshot, CreateItemInput, MoveItemInput, SetValueContext } from "./item-service";
export type { CreateBoardInput } from "./board-service";
export type { MyWorkItem, MyWorkSection } from "./my-work-service";
export type { SearchResults } from "./search-service";
export type { WorkspaceContext, InviteMemberInput } from "./workspace-service";
