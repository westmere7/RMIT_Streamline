import type { User, UserInput } from "@/domain";
import type { UserRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

export class LocalUserRepository implements UserRepository {
  constructor(private readonly conn: LocalConnection) {}

  async list(): Promise<User[]> {
    const db = await this.conn.getDb();
    const users = await db.getAll("users");
    return users.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async getById(id: string): Promise<User | null> {
    const db = await this.conn.getDb();
    return (await db.get("users", id)) ?? null;
  }

  async getByEmail(email: string): Promise<User | null> {
    const db = await this.conn.getDb();
    return (await db.getFromIndex("users", "byEmail", email.toLowerCase())) ?? null;
  }

  async create(input: UserInput): Promise<User> {
    const db = await this.conn.getDb();
    const now = nowIso();
    const user: User = {
      ...input,
      email: input.email.toLowerCase(),
      id: newId(),
      deactivatedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.put("users", user);
    return user;
  }

  async update(id: string, patch: Partial<Omit<User, "id" | "createdAt">>): Promise<User> {
    const db = await this.conn.getDb();
    const existing = await db.get("users", id);
    if (!existing) throw new NotFoundError("User", id);
    const updated: User = { ...existing, ...patch, id, updatedAt: nowIso() };
    await db.put("users", updated);
    return updated;
  }
}
