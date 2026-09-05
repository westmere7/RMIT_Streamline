/**
 * Salted SHA-256 for the local provider's password stand-in.
 *
 * Local mode has no auth server, so the onboarding flow keeps a hash in
 * IndexedDB purely to make "set a password, then sign in" testable in the
 * browser store. Supabase mode never touches this: passwords there belong to
 * Supabase Auth and are set server-side with the service role.
 */

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  return toHex(await crypto.subtle.digest("SHA-256", data));
}

export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const actual = await hashPassword(password, salt);
  if (actual.length !== expectedHash.length) return false;
  // Constant-time compare; the hashes are short, so this is cheap.
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return diff === 0;
}
