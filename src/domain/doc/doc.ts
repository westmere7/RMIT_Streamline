import type { EntityId, Timestamps } from "@/domain/common/types";

/**
 * A doc: a page of writing that sits in a team beside its boards and trackers,
 * for the brief, the process, the meeting notes, the brand guide.
 *
 * Two kinds. A "page" is written in the app, block by block, and anyone who can
 * edit the workspace's trackers can edit it. A "pdf" is a file someone already
 * had: it is kept as it was and shown, read only, as the doc; only its title
 * and where it sits can change.
 */
export type DocKind = "page" | "pdf";

/**
 * The page's blocks, as the editor keeps them (ProseMirror JSON). Treated as
 * opaque everywhere but the editor, which only ever reads it through its own
 * schema.
 */
export type DocContent = Record<string, unknown>;

export interface Doc extends Timestamps {
  id: EntityId;
  workspaceId: EntityId;
  teamId: EntityId | null;
  title: string;
  /** An emoji shown before the title, or null for the plain doc icon. */
  icon: string | null;
  kind: DocKind;
  /** The page, for a "page" doc; null until something is written, and always for a PDF. */
  content: DocContent | null;
  /**
   * Where a PDF's file is kept: a path in the private "docs" bucket, or in a
   * local workspace the file itself as a data URL. Null for a page.
   */
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  createdBy: EntityId;
  /** Who last changed it, or null when nobody has since it was made. */
  updatedBy: EntityId | null;
}

/** A doc without its page, for lists: pages can be long, and a list never shows one. */
export type DocSummary = Omit<Doc, "content">;

export type DocInput = Pick<Doc, "workspaceId" | "teamId" | "title" | "kind" | "createdBy"> & Partial<Pick<Doc, "icon" | "content" | "filePath" | "fileName" | "fileSize">> & { id?: EntityId };

export type DocPatch = Partial<Pick<Doc, "title" | "icon" | "content" | "teamId" | "updatedBy">>;

/** Long enough for a real title, short enough for the sidebar. */
export const DOC_TITLE_MAX = 200;

/** What a doc is called when nobody has named it yet. */
export const UNTITLED_DOC = "Untitled";
