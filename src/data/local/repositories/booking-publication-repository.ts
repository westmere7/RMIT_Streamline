import type { BookingFormPublication, BookingFormPublicationInput } from "@/domain";
import type { BookingPublicationRepository } from "@/data/repositories";
import { newId } from "@/lib/ids";

const KEY = (workspaceId: string) => `streamline.booking-publications.${workspaceId}`;
/** Plenty of history for a demo, without filling the browser's storage with forms. */
const KEEP = 40;

/**
 * The local store's published-form history: this browser's own list per
 * workspace, in storage, as task visits are. The demo has one browser.
 */
export class LocalBookingPublicationRepository implements BookingPublicationRepository {
  async listByWorkspace(workspaceId: string, limit: number): Promise<BookingFormPublication[]> {
    return read(workspaceId).slice(0, limit);
  }

  async getById(id: string): Promise<BookingFormPublication | null> {
    if (typeof window === "undefined") return null;
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith("streamline.booking-publications.")) continue;
      const found = read(key.slice("streamline.booking-publications.".length)).find((p) => p.id === id);
      if (found) return found;
    }
    return null;
  }

  async create(input: BookingFormPublicationInput): Promise<BookingFormPublication> {
    const saved: BookingFormPublication = { ...input, id: newId() };
    const list = [saved, ...read(input.workspaceId)].slice(0, KEEP);
    try {
      window.localStorage.setItem(KEY(input.workspaceId), JSON.stringify(list));
    } catch {
      // Storage refused: the history simply does not grow.
    }
    return saved;
  }
}

function read(workspaceId: string): BookingFormPublication[] {
  try {
    const raw = window.localStorage.getItem(KEY(workspaceId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((p): p is BookingFormPublication => typeof p?.id === "string" && typeof p?.publishedAt === "string") : [];
  } catch {
    return [];
  }
}
