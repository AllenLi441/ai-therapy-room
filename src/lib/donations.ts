/** Shared conversations: a user aged 14+ who agrees in the opening consent has every
 * conversation uploaded (masked) after each reply, one row per conversation, updated in place.
 * Stored in a private Supabase table (RLS on, no policies, reachable only with the server's
 * secret key). The table SQL is in docs/supabase-donations.sql (+ -v2.sql). */
import type { ReplyAlternative, TurnTrace } from "./turn-trace";

export const DONATION_CONSENT_VERSION = "3"; // 3: also reply labels, message times and replaced replies
export const DONATION_AGE_BRACKETS = ["18+", "14-17"] as const;
export type DonationAgeBracket = (typeof DONATION_AGE_BRACKETS)[number];

export type DonatedMessage = {
  role: "user" | "assistant";
  content: string;
  safety?: string;
  pace?: "deep" | "fast";
  feedback?: "up" | "down";
  ts?: number;
  /** The user turn carried images; the model saw a description that is not uploaded. */
  hadImages?: true;
  meta?: TurnTrace;
  /** Replies the user replaced with "换个说法" (rejected samples), oldest first. */
  alternatives?: ReplyAlternative[];
};

/** Row format 2 adds the columns in docs/supabase-donations-v2.sql. */
export const DONATION_SCHEMA_VERSION = 2;

export type DonationRow = {
  id: string;
  consent_version: string;
  age_bracket: DonationAgeBracket;
  language: string;
  support_region: string | null;
  app_version: string;
  messages: DonatedMessage[];
  schema_version: number;
  updated_at: string;
  turn_count: number;
  had_crisis: boolean;
};

const V2_COLUMNS = ["schema_version", "updated_at", "turn_count", "had_crisis"] as const;

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  return url && key ? { url, key } : null;
}

export function donationsConfigured(): boolean {
  return supabaseConfig() !== null;
}

// New secret keys (sb_secret_…) go on the apikey header only; a legacy service_role JWT
// also needs the Authorization header.
function headers(key: string): Record<string, string> {
  return {
    apikey: key,
    ...(key.startsWith("sb_") ? {} : { Authorization: `Bearer ${key}` }),
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
}

/** Insert, or replace the row with the same id as the conversation grows. Until the v2
 * migration is run, Supabase rejects the new columns (PGRST204); the row is then sent
 * again without them, so sharing keeps working (the per-message data stays in messages). */
export async function upsertDonation(row: DonationRow): Promise<void> {
  const config = supabaseConfig();
  if (!config) throw new Error("donations_not_configured");
  const send = (body: object) => fetch(`${config.url}/rest/v1/donations?on_conflict=id`, {
    method: "POST", headers: { ...headers(config.key), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(body), cache: "no-store",
  });
  let response = await send(row);
  if (response.status === 400 && (await response.text().catch(() => "")).includes("PGRST204")) {
    const legacy: Record<string, unknown> = { ...row };
    for (const column of V2_COLUMNS) delete legacy[column];
    response = await send(legacy);
  }
  if (!response.ok) throw new Error(`supabase_insert_${response.status}`);
}

export async function deleteDonation(id: string): Promise<void> {
  const config = supabaseConfig();
  if (!config) throw new Error("donations_not_configured");
  const response = await fetch(`${config.url}/rest/v1/donations?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE", headers: headers(config.key), cache: "no-store",
  });
  if (!response.ok) throw new Error(`supabase_delete_${response.status}`);
}
