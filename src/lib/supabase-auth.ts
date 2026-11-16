import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { rowsOf, type DB } from "@/db";

/**
 * Supabase Auth holds the credentials (email + password). The app keeps its own
 * users/memberships tables and its own `wf_session` cookie; a user row is linked
 * to its Supabase identity by `users.auth_user_id`, never by email alone.
 *
 * Off until all three variables are set, so the app keeps its built-in login
 * (local dev, tests, and production before the secret key is added).
 */
export function supabaseAuthEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && process.env.SUPABASE_SECRET_KEY,
  );
}

const OPTIONS = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

// A fresh client per call: sign-in keeps its session in the client, which must not be shared between requests.
function publicClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, OPTIONS);
}

function adminClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, OPTIONS);
}

export type SignInResult =
  | { status: "ok"; id: string; email: string; name: string | null }
  | { status: "invalid" }
  | { status: "unavailable" };

export async function sbSignIn(email: string, password: string): Promise<SignInResult> {
  try {
    const { data, error } = await publicClient().auth.signInWithPassword({ email, password });
    if (error) {
      // 4xx (wrong password, unknown or unconfirmed email) all look the same to the person logging in.
      // Rate limits, 5xx and network failures (status 0) mean Supabase itself is the problem.
      const s = error.status ?? 0;
      return s >= 400 && s < 500 && s !== 429 ? { status: "invalid" } : { status: "unavailable" };
    }
    const u = data.user;
    // Only trust identities whose email has been confirmed; otherwise anyone could register someone else's address.
    if (!u?.email || !u.email_confirmed_at) return { status: "invalid" };
    const name = typeof u.user_metadata?.name === "string" ? u.user_metadata.name : null;
    return { status: "ok", id: u.id, email: u.email.toLowerCase(), name };
  } catch {
    return { status: "unavailable" };
  }
}

async function authUserIdByEmail(d: DB, email: string): Promise<string | null> {
  try {
    const res = await d.execute(sql`select id from auth.users where lower(email) = ${email} limit 1`);
    return rowsOf<{ id: string }>(res)[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Creates the Supabase identity for an email, or, if one already exists, sets its
 * password (the caller has just proven they know the password for this app account).
 * Returns the auth user id, or null when Supabase couldn't be reached.
 */
export async function sbEnsureUser(d: DB, email: string, password: string, name: string): Promise<string | null> {
  const admin = adminClient();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (created.data?.user) return created.data.user.id;
  if (created.error?.code !== "email_exists") return null;
  const id = await authUserIdByEmail(d, email);
  if (!id) return null;
  const updated = await admin.auth.admin.updateUserById(id, { password, email_confirm: true });
  return updated.error ? null : id;
}

/** New sign-up. `exists` means Supabase already has this email. */
export async function sbCreateUser(email: string, password: string, name: string): Promise<{ id: string } | { error: "exists" | "unavailable" }> {
  try {
    const { data, error } = await adminClient().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
    if (data?.user) return { id: data.user.id };
    return { error: error?.code === "email_exists" ? "exists" : "unavailable" };
  } catch {
    return { error: "unavailable" };
  }
}

export async function sbSetPassword(authUserId: string, password: string): Promise<boolean> {
  try {
    const { error } = await adminClient().auth.admin.updateUserById(authUserId, { password });
    return !error;
  } catch {
    return false;
  }
}

/** Marks a user row as having no local password; its credential is in Supabase. */
export const NO_LOCAL_PASSWORD = "!";
