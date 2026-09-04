export class SupabaseNotImplementedError extends Error {
  constructor(repository: string, method: string) {
    super(
      `${repository}.${method} is not implemented for the Supabase provider yet. ` +
        "Use NEXT_PUBLIC_DATA_PROVIDER=local or finish src/data/supabase/.",
    );
    this.name = "SupabaseNotImplementedError";
  }
}

/**
 * Returns a Proxy whose every method throws a descriptive error. This keeps the
 * `Repositories` shape satisfied without hand-writing dozens of stub methods.
 */
export class NotImplementedRepository {
  as<T extends object>(repositoryName: string): T {
    return new Proxy({} as T, {
      get(_target, property) {
        if (typeof property === "symbol") return undefined;
        return () => {
          throw new SupabaseNotImplementedError(repositoryName, String(property));
        };
      },
    });
  }
}
