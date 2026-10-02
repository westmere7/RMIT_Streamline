import type { Doc, DocContent, DocKind, DocPatch, DocSummary, EntityId } from "@/domain";
import { DOC_TITLE_MAX, UNTITLED_DOC } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";

export interface CreateDocInput {
  workspaceId: EntityId;
  teamId: EntityId | null;
  title?: string;
  kind?: DocKind;
  icon?: string | null;
  content?: DocContent | null;
  /** For a PDF: where its file was stored, and what it was called. */
  file?: { path: string; name: string; size: number } | null;
  /** Chosen ahead of time when a file has to be stored under the doc's id before the doc exists. */
  id?: EntityId;
}

const cleanTitle = (title: string | undefined) => (title ?? "").replace(/\s+/g, " ").trim().slice(0, DOC_TITLE_MAX) || UNTITLED_DOC;

/** Docs: made, renamed, written and deleted. A PDF's page never changes; only its title and team do. */
export class DocService {
  constructor(private readonly repos: Repositories) {}

  list(workspaceId: EntityId): Promise<DocSummary[]> {
    return this.repos.docs.listByWorkspace(workspaceId);
  }

  async get(docId: EntityId): Promise<Doc> {
    const doc = await this.repos.docs.getById(docId);
    if (!doc) throw new NotFoundError("Doc", docId);
    return doc;
  }

  create(input: CreateDocInput, actorId: EntityId): Promise<Doc> {
    const kind: DocKind = input.kind ?? (input.file ? "pdf" : "page");
    if (kind === "pdf" && !input.file) throw new Error("A PDF doc needs its file.");
    return this.repos.docs.create({
      id: input.id,
      workspaceId: input.workspaceId,
      teamId: input.teamId,
      title: cleanTitle(input.title),
      icon: input.icon ?? null,
      kind,
      content: kind === "page" ? (input.content ?? null) : null,
      filePath: input.file?.path ?? null,
      fileName: input.file?.name ?? null,
      fileSize: input.file?.size ?? null,
      createdBy: actorId,
    });
  }

  async update(docId: EntityId, patch: Omit<DocPatch, "updatedBy">, actorId: EntityId): Promise<Doc> {
    const next: DocPatch = { ...patch, updatedBy: actorId };
    if (patch.title !== undefined) next.title = cleanTitle(patch.title);
    if (patch.content !== undefined) {
      const doc = await this.get(docId);
      if (doc.kind === "pdf") throw new Error("A PDF is kept as it was uploaded and cannot be edited.");
    }
    return this.repos.docs.update(docId, next);
  }

  delete(docId: EntityId): Promise<void> {
    return this.repos.docs.delete(docId);
  }
}
