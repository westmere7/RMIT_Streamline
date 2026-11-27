/**
 * A refusal meant for the person who asked: "a subitem moves with its task".
 *
 * Its message is shown as it is, and a server route answers it with a 4xx
 * rather than a 500 that hides the reason behind "something went wrong".
 */
/** What the loser of two simultaneous moves of the same task is told. */
export const MOVED_MEANWHILE = "Someone moved this task a moment ago. Reload to see where it is.";

export class RefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefusedError";
  }
}
