/**
 * The booked brief of many tasks in one read.
 *
 * A board shows a Brief cell on every row, and each asked for its own task's
 * booked brief: one request per row on every board open (32 on a board of 77),
 * each a line in the database's request log. Asks made in the same tick are
 * gathered here and go out together, in chunks short enough for a URL.
 */
export interface BriefReader {
  listBookingBriefs(itemIds: string[]): Promise<Map<string, string>>;
}

const CHUNK = 100;

interface Waiter {
  id: string;
  resolve: (brief: string | null) => void;
  reject: (error: unknown) => void;
}

const open = new WeakMap<BriefReader, Waiter[]>();

export function loadBookingBrief(reader: BriefReader, itemId: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const waiting = open.get(reader);
    if (waiting) {
      waiting.push({ id: itemId, resolve, reject });
      return;
    }
    const batch: Waiter[] = [{ id: itemId, resolve, reject }];
    open.set(reader, batch);
    setTimeout(() => {
      open.delete(reader);
      const ids = [...new Set(batch.map((w) => w.id))];
      const chunks = Array.from({ length: Math.ceil(ids.length / CHUNK) }, (_, i) => ids.slice(i * CHUNK, (i + 1) * CHUNK));
      Promise.all(chunks.map((chunk) => reader.listBookingBriefs(chunk)))
        .then((maps) => {
          const found = new Map(maps.flatMap((m) => [...m]));
          for (const w of batch) w.resolve(found.get(w.id) ?? null);
        })
        .catch((error: unknown) => {
          for (const w of batch) w.reject(error);
        });
    }, 0);
  });
}
