import type { User, UserInput } from "@/domain";
import type { UserRepository } from "@/data/repositories";
import { db, NotSupportedError, unwrap, unwrapList, unwrapMaybe } from "../client";
import { fromUserPatch, PROFILE_COLUMNS, toUser, type ProfileRow } from "../rows";

/** `profiles` rows, which the `handle_new_user` trigger creates from `auth.users`. */
export class SupabaseUserRepository implements UserRepository {
  async list(): Promise<User[]> {
    const result = await db().from("profiles").select(PROFILE_COLUMNS).order("display_name", { ascending: true });
    return unwrapList<ProfileRow>(result, "profiles.list").map(toUser);
  }

  async getById(id: string): Promise<User | null> {
    const result = await db().from("profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle();
    const row = unwrapMaybe<ProfileRow>(result, "profiles.getById");
    return row ? toUser(row) : null;
  }

  async getByEmail(email: string): Promise<User | null> {
    const result = await db().from("profiles").select(PROFILE_COLUMNS).eq("email", email.toLowerCase()).maybeSingle();
    const row = unwrapMaybe<ProfileRow>(result, "profiles.getByEmail");
    return row ? toUser(row) : null;
  }

  /**
   * A profile is created by the database trigger when an `auth.users` row appears,
   * and creating auth users needs the service role. Inviting someone who has never
   * signed in therefore has to go through a server-side endpoint (see
   * scripts/db-seed.mjs for the Admin API call it would make).
   */
  async create(_input: UserInput): Promise<User> {
    throw new NotSupportedError(
      "Creating a user from the browser",
      "profiles.id references auth.users, so a new account must be created server-side with the service role key.",
    );
  }

  async update(id: string, patch: Partial<Omit<User, "id" | "createdAt">>): Promise<User> {
    const result = await db().from("profiles").update(fromUserPatch(patch)).eq("id", id).select(PROFILE_COLUMNS).single();
    return toUser(unwrap<ProfileRow>(result, "profiles.update"));
  }
}
