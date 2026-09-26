import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * supabase/sequence.txt is the order scripts/db-migrate.mjs applies SQL in, and
 * the only order that builds an empty database: migrations call private.*
 * helpers that policy files define, so the two directories interleave. These
 * checks keep the list whole, so a new file cannot quietly fall off the end of
 * a fresh project's build.
 */
const ROOT = join(__dirname, "..", "..");

function sqlFiles(dir: string): string[] {
  return readdirSync(join(ROOT, "supabase", dir))
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((name) => `${dir}/${name}`);
}

function sequence(): string[] {
  return readFileSync(join(ROOT, "supabase", "sequence.txt"), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

describe("supabase/sequence.txt", () => {
  const migrations = sqlFiles("migrations");
  const policies = sqlFiles("policies");
  const listed = sequence();

  it("names every SQL file under supabase/migrations and supabase/policies", () => {
    const missing = [...migrations, ...policies].filter((name) => !listed.includes(name));
    expect(missing, "append new SQL files to supabase/sequence.txt, in the order they are applied").toEqual([]);
  });

  it("names nothing that does not exist, and nothing twice", () => {
    const existing = new Set([...migrations, ...policies]);
    expect(listed.filter((name) => !existing.has(name))).toEqual([]);
    expect(listed.length).toBe(new Set(listed).size);
  });

  it("keeps each directory in its own numeric order", () => {
    // Interleaving is the point; reordering within a directory never is.
    expect(listed.filter((name) => name.startsWith("migrations/"))).toEqual(migrations);
    expect(listed.filter((name) => name.startsWith("policies/"))).toEqual(policies);
  });

  it("puts the policy that defines the private helpers before the first migration that calls them", () => {
    // policies/0001 creates schema private and its helper functions; migrations/0005
    // is the first migration whose policies call them.
    expect(listed.indexOf("policies/0001_rls_policies.sql")).toBeLessThan(listed.indexOf("migrations/0005_direct_messages.sql"));
  });
});
