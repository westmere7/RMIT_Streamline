import { ZodError } from "zod";

/** An error that already knows which HTTP status it should become. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** The JSON body every onboarding route returns when something goes wrong. */
export interface ErrorBody {
  error: string;
}

/**
 * Wraps a route handler so thrown errors become `{ error }` JSON with a sensible
 * status: HttpError keeps its own, invalid input is 400, anything else is 500
 * and logged (the message is kept generic so nothing internal leaks).
 */
export function handleRoute<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      if (error instanceof ZodError) {
        const first = error.issues[0];
        return json({ error: first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input" }, 400);
      }
      console.error("[api] unhandled error", error);
      return json({ error: "Something went wrong on the server. Try again, and check the server logs if it keeps happening." }, 500);
    }
  };
}

export function json<T>(body: T, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Parses a JSON body, turning a malformed one into a 400 rather than a 500. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "The request body must be JSON.");
  }
}
