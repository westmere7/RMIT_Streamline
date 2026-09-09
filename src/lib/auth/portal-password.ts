/**
 * PBKDF2-SHA256 for portal passwords.
 *
 * A stakeholder portal's password guards a department's whole request history
 * behind a link that gets pasted into emails, so it wants a hash that costs
 * something to attack. The workspace's existing share passwords use one round of
 * SHA-256 (src/lib/auth/password-hash.ts) — fine as the local provider's
 * sign-in stand-in, far too cheap for this.
 *
 * Rewriting the old scheme would invalidate every board, item and dashboard
 * share password in existence, so the two coexist instead: everything here is
 * prefixed and self-describing, which is what lets the older hashes be migrated
 * later without guessing at what they are.
 *
 * Encoding: `pbkdf2$<iterations>$<salt hex>$<derived hex>`. The iteration count
 * travels with the hash, so raising it later only affects passwords set after
 * the change and old ones keep verifying.
 */

const PREFIX = "pbkdf2";
/** Enough to hurt a cracker, cheap enough for a server handling one unlock at a time. */
const ITERATIONS = 210_000;
const KEY_BITS = 256;
const SALT_BYTES = 16;

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function derive(password: string, salt: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations }, key, KEY_BITS);
  return toHex(bits);
}

/** Hashes a password for storage. Every call produces a different salt. */
export async function hashPortalPassword(password: string): Promise<string> {
  const bytes = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(bytes);
  const salt = toHex(bytes);
  return `${PREFIX}$${ITERATIONS}$${salt}$${await derive(password, salt, ITERATIONS)}`;
}

/**
 * Whether a password matches a stored hash.
 *
 * Returns false for anything malformed rather than throwing: a corrupted hash
 * must refuse entry, not crash the endpoint into a 500 that tells an attacker
 * they found something interesting.
 */
export async function verifyPortalPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== PREFIX) return false;
  const iterations = Number(parts[1]);
  const salt = parts[2]!;
  const expected = parts[3]!;
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 5_000_000 || !salt || !expected) return false;
  return timingSafeEqual(await derive(password, salt, iterations), expected);
}

/** Constant-time over the full length, so a comparison cannot be timed character by character. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
