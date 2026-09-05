// One-off live probe of the onboarding routes and the invitations RLS. Deleted after use.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "http://localhost:3000";
const WS = "00000000-0000-4000-8000-000000000001";
const MAI = "00000001-0000-4000-8000-000000000022";
const QUINN_TOKEN = process.argv[2];

const anonClient = createClient(url, anon, { auth: { persistSession: false } });
const admin = createClient(url, anon, { auth: { persistSession: false } });
const { data: adminSession, error: adminErr } = await admin.auth.signInWithPassword({ email: "admin@rmit.local", password: "admin123" });
if (adminErr) throw adminErr;
const adminJwt = adminSession.session.access_token;

async function rest(jwt, path, init = {}) {
  const r = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { apikey: anon, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) } });
  return `${r.status} ${(await r.text()).slice(0, 160)}`;
}
console.log("RLS admin select   :", await rest(adminJwt, "workspace_invitations?select=user_id,accepted_at&order=created_at.desc&limit=5"));
if (QUINN_TOKEN) console.log("RLS member select  :", await rest(QUINN_TOKEN, "workspace_invitations?select=user_id"));
console.log("RLS anon select    :", await rest(anon, "workspace_invitations?select=user_id"));
console.log("RLS admin insert   :", await rest(adminJwt, "workspace_invitations", { method: "POST", body: JSON.stringify({ workspace_id: WS, user_id: MAI, token: "attacker-token-attacker-token", expires_at: "2030-01-01T00:00:00Z" }) }));
console.log("RLS admin update   :", await rest(adminJwt, `workspace_invitations?user_id=eq.${MAI}`, { method: "PATCH", body: JSON.stringify({ expires_at: "2030-01-01T00:00:00Z" }) }));
console.log("RLS admin delete   :", await rest(adminJwt, `workspace_invitations?user_id=eq.${MAI}`, { method: "DELETE" }));

// Pending accounts have no password: any password must fail.
const pendingAttempt = await anonClient.auth.signInWithPassword({ email: "mai@rmit.local", password: "anything-at-all-123" });
console.log("pending sign-in    :", pendingAttempt.error?.message ?? "UNEXPECTED SUCCESS");

// Cancel Mai's invitation through the app route as admin, then check she is gone.
const cancel = await fetch(`${APP}/api/invitations/cancel`, { method: "POST", headers: { Authorization: `Bearer ${adminJwt}`, "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: WS, userId: MAI }) });
console.log("route cancel Mai   :", cancel.status, await cancel.text());
const svc = createClient(url, service, { auth: { persistSession: false } });
const maiAuth = await svc.auth.admin.getUserById(MAI);
const maiRows = await svc.from("workspace_members").select("id").eq("user_id", MAI);
console.log("Mai auth user gone :", !maiAuth.data?.user, "| memberships left:", maiRows.data?.length);
// Cancelling again must 404 now.
const again = await fetch(`${APP}/api/invitations/cancel`, { method: "POST", headers: { Authorization: `Bearer ${adminJwt}`, "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: WS, userId: MAI }) });
console.log("route cancel again :", again.status, await again.text());
// Cancelling an active member must be refused.
const active = await fetch(`${APP}/api/invitations/cancel`, { method: "POST", headers: { Authorization: `Bearer ${adminJwt}`, "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: WS, userId: "00000001-0000-4000-8000-000000000002" }) });
console.log("route cancel Emily :", active.status, await active.text());
// Duplicate invite must be refused.
const dup = await fetch(`${APP}/api/invitations`, { method: "POST", headers: { Authorization: `Bearer ${adminJwt}`, "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: WS, email: "emily@rmit.local", firstName: "E", lastName: "C", role: "MEMBER", teamIds: [] }) });
console.log("route invite dup   :", dup.status, await dup.text());

// Clean up the QA member created through the UI.
const quinn = await svc.from("profiles").select("id").eq("email", "qa.onboarding@rmit.local").maybeSingle();
if (quinn.data) {
  const del = await svc.auth.admin.deleteUser(quinn.data.id);
  console.log("cleanup Quinn      :", del.error ? del.error.message : "deleted");
}
