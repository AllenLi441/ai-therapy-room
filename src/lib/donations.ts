/** Conversation donations: opt-in, per session, 14+ only, stored in a private Supabase table
 * (RLS on, no policies, reachable only with the server's secret key). The table SQL is in
 * docs/supabase-donations.sql. */
export const DONATION_CONSENT_VERSION = "1";
export const DONATION_AGE_BRACKETS = ["18+", "14-17"] as const;
export type DonationAgeBracket = (typeof DONATION_AGE_BRACKETS)[number];

export type DonatedMessage = {
  role: "user" | "assistant";
  content: string;
  safety?: string;
  pace?: "deep" | "fast";
  feedback?: "up" | "down";
};

export type DonationRow = {
  id: string;
  consent_version: string;
  age_bracket: DonationAgeBracket;
  language: string;
  support_region: string | null;
  app_version: string;
  messages: DonatedMessage[];
};

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

export async function insertDonation(row: DonationRow): Promise<void> {
  const config = supabaseConfig();
  if (!config) throw new Error("donations_not_configured");
  const response = await fetch(`${config.url}/rest/v1/donations`, {
    method: "POST", headers: headers(config.key), body: JSON.stringify(row), cache: "no-store",
  });
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
