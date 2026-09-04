import { openStreamlineDatabase, type StreamlineDatabase } from "./database";
import { seedDatabase } from "@/data/seed/apply-seed";

/**
 * Lazily opens the IndexedDB database once per browser tab and applies the seed
 * on first use. Repositories receive a `getDb` function so nothing else has to
 * think about connection lifecycle.
 */
export class LocalConnection {
  private dbPromise: Promise<StreamlineDatabase> | null = null;

  constructor(private readonly options: { name?: string; seed?: boolean } = {}) {}

  getDb(): Promise<StreamlineDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = this.open();
    }
    return this.dbPromise;
  }

  private async open(): Promise<StreamlineDatabase> {
    const db = await openStreamlineDatabase({ name: this.options.name });
    if (this.options.seed !== false) {
      const seeded = await db.get("meta", "seededAt");
      if (!seeded) {
        await seedDatabase(db);
      }
    }
    return db;
  }

  /** Closes the connection so that the next call re-opens (and re-seeds if empty). */
  async close(): Promise<void> {
    if (!this.dbPromise) return;
    const db = await this.dbPromise;
    db.close();
    this.dbPromise = null;
  }
}
