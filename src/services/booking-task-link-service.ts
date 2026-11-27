import type { EntityId, PublicItemPayload } from "@/domain";
import { parseTaskLinkToken, taskLinkPath, taskLinkToken } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { ShareAccessError, shareAccessMessage } from "./board-share-service";
import { bookingFormForSubmission } from "./booking-service";
import { readPublicItem } from "./item-share-service";

/** Works out a task's signature. The server's uses a secret only it holds; the local demo's, one of its own. */
export type TaskLinkSigner = (itemId: EntityId) => Promise<string>;

/** How a visitor's browser asks for a task by its link on Supabase: the server checks the signature. */
export interface TaskLinkTransport {
  open(token: string): Promise<PublicItemPayload>;
}

/**
 * The link a booking's receipt gives to its task (src/domain/booking/task-link.ts).
 *
 * Nothing is stored: the link is the task id and a signature of it, so it is
 * the same whenever it is worked out, and it opens the task wherever the task
 * has got to, archived included, for as long as the workspace's form has the
 * option on. A task deleted for good has nothing left to show.
 */
export class BookingTaskLinkService {
  private signer: TaskLinkSigner = localSigner;

  constructor(
    private readonly repos: Repositories,
    private readonly transport: TaskLinkTransport | null,
  ) {}

  /** The server's own signer, set where services run with the service role. */
  useSigner(signer: TaskLinkSigner): void {
    this.signer = signer;
  }

  /** The task's link, as a path under the site. */
  async linkFor(itemId: EntityId, workspaceSlug: string): Promise<string> {
    return taskLinkPath(workspaceSlug, taskLinkToken(itemId, await this.signer(itemId)));
  }

  /** The task behind a link, read-only. */
  async open(token: string): Promise<PublicItemPayload> {
    if (this.transport) return this.transport.open(token);
    const parsed = parseTaskLinkToken(token);
    const unknown = () => new ShareAccessError("unknown", shareAccessMessage("unknown"));
    if (!parsed || !sameText(parsed.signature, await this.signer(parsed.itemId))) throw unknown();
    const item = await this.repos.items.getById(parsed.itemId);
    // Only a task booked through the form ever had such a link; archived is still that task.
    if (!item || !item.bookedVia || item.parentItemId) throw unknown();
    const board = await this.repos.boards.getById(item.boardId);
    if (!board) throw unknown();
    const workspace = await this.repos.workspaces.getById(board.workspaceId);
    if (!workspace) throw unknown();
    // The form's switch, as it is now: off closes every link it gave out.
    const live = await bookingFormForSubmission(this.repos, workspace, null);
    if (live.template.review.shareTaskLink !== true) throw new ShareAccessError("off", shareAccessMessage("off"));
    return readPublicItem(this.repos, item, board, null);
  }
}

/** Compared in constant time, so the signature cannot be found a character at a time. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The local demo's signer: data in this browser only, so its secret is only the demo's. */
const LOCAL_SECRET = "streamline-local-demo-task-links";

async function localSigner(itemId: EntityId): Promise<string> {
  return hmacHex(LOCAL_SECRET, itemId);
}

/** HMAC-SHA256 as hex, cut to the link's length, with the platform's Web Crypto (browsers and Node). */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return [...signature].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}
