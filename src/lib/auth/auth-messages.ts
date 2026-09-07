/**
 * Sign-in errors in the reader's words. Supabase Auth answers with terse
 * developer strings ("Invalid login credentials"); the screen should say what
 * went wrong and what to do about it. Anything unrecognised passes through
 * unchanged rather than being replaced with a vaguer sentence.
 */
export function describeSignInError(message: string): string {
  const text = message.trim();
  const lower = text.toLowerCase();
  if (lower.includes("invalid login credentials") || lower.includes("invalid_credentials")) {
    return "That email and password do not match. Check both and try again, or ask a workspace admin for a fresh invitation link.";
  }
  if (lower.includes("email not confirmed")) {
    return "This account has not been confirmed yet. Ask a workspace admin to finish setting it up.";
  }
  if (lower.includes("too many requests") || lower.includes("rate limit")) {
    return "Too many attempts in a row. Wait a minute, then try again.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("fetch failed")) {
    return "Could not reach the sign-in service. Check your connection and try again.";
  }
  if (lower.includes("user is banned") || lower.includes("disabled")) {
    return "This account has been disabled. Ask a workspace admin to reactivate it.";
  }
  return text || "Sign in failed. Try again.";
}
