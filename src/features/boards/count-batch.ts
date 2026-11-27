/**
 * Live task counts for many boards in one read.
 *
 * Every board in the sidebar (and on a team's board list) shows its count, and
 * each asked for its own: one request per board on every page load. Asks made
 * in the same tick are gathered here and go out together; each board's query
 * keeps its own key, so a board's writes still refresh just that board.
 */
export interface CountReader {
  countLiveMany(boardIds: string[]): Promise<Map<string, number>>;
}

interface Waiter {
  id: string;
  resolve: (count: number) => void;
  reject: (error: unknown) => void;
}

const open = new WeakMap<CountReader, Waiter[]>();

export function loadBoardCount(reader: CountReader, boardId: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const waiting = open.get(reader);
    if (waiting) {
      waiting.push({ id: boardId, resolve, reject });
      return;
    }
    const batch: Waiter[] = [{ id: boardId, resolve, reject }];
    open.set(reader, batch);
    setTimeout(() => {
      open.delete(reader);
      reader
        .countLiveMany([...new Set(batch.map((w) => w.id))])
        .then((counts) => {
          for (const w of batch) w.resolve(counts.get(w.id) ?? 0);
        })
        .catch((error: unknown) => {
          for (const w of batch) w.reject(error);
        });
    }, 0);
  });
}
