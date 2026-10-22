/**
 * Export shared conversations from Supabase into training files.
 *
 *   npm run dataset:export                 # → ../datasets/jingshi-donations/
 *   npm run dataset:export -- --out DIR
 *
 * Reads SUPABASE_URL and SUPABASE_SECRET_KEY from the environment or .env.local. Runs on
 * your machine only; the output holds real (masked) conversations, so it is written outside
 * the git repository, readable only by you (0700 / 0600), and must never be committed.
 *
 * Retention: every run REPLACES the same folder, so a conversation the donor deleted from
 * Supabase disappears from the export on the next run. Do not keep dated copies. A model
 * already trained on an earlier export cannot forget it; delete or retrain such models when
 * that matters.
 *
 * Files:
 *   conversations.jsonl          normalized rows (raw ids, local only), pii_suspects to review
 *   sft.jsonl                    TRL prompt/completion examples ending at a clean model reply
 *   dpo.jsonl                    TRL prompt/chosen/rejected pairs from "换个说法"
 *   safety-review.jsonl          blind items for the dataset studio (user turns only)
 *   safety-review.mapping.jsonl  links each blind item to the conversation and what the product did
 *   stats.json                   counts
 * Conversations with suspected school/company/hospital names stay out of sft/dpo until you
 * check them: add each checked row's `pii_review_key` as one line to
 * ../datasets/jingshi-donations-pii-cleared.txt (a changed conversation gets a new key).
 * Rules: src/lib/dataset-export.ts.
 */
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildDpo, buildSafetyReview, buildSft, buildStats, normalizeDonation, type DonationExportRow } from "../../src/lib/dataset-export";

const DATASETS = fileURLToPath(new URL("../../../datasets/", import.meta.url));

async function env(name: string): Promise<string> {
  if (process.env[name]) return process.env[name]!.trim();
  const text = await readFile(new URL("../../.env.local", import.meta.url), "utf-8").catch(() => "");
  const line = text.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
}

/** Keyset pages by id: stable while donors delete rows, and independent of the server's
 * max-rows setting (it stops on an empty page, not a short one). */
async function fetchRows(url: string, key: string): Promise<DonationExportRow[]> {
  const headers: Record<string, string> = { apikey: key, ...(key.startsWith("sb_") ? {} : { Authorization: `Bearer ${key}` }) };
  const rows: DonationExportRow[] = [];
  for (let after = ""; ;) {
    const response = await fetch(`${url}/rest/v1/donations?select=*&order=id.asc&limit=500${after ? `&id=gt.${after}` : ""}`, { headers });
    if (!response.ok) throw new Error(`Supabase ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const page = (await response.json()) as DonationExportRow[];
    if (!page.length) return rows;
    rows.push(...page);
    after = page[page.length - 1].id;
  }
}

const jsonl = (items: unknown[]) => items.map((item) => JSON.stringify(item)).join("\n") + (items.length ? "\n" : "");

async function main() {
  const url = (await env("SUPABASE_URL")).replace(/\/$/, "");
  const key = await env("SUPABASE_SECRET_KEY");
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY (environment or .env.local).");
  const outFlag = process.argv.indexOf("--out");
  const out = outFlag > 0 ? path.resolve(process.argv[outFlag + 1]) : path.join(DATASETS, "jingshi-donations");
  if (out.startsWith(path.resolve(fileURLToPath(new URL("../../", import.meta.url))))) throw new Error("Write the export outside the app repository.");

  const clearedText = await readFile(path.join(DATASETS, "jingshi-donations-pii-cleared.txt"), "utf-8").catch(() => "");
  const cleared = new Set(clearedText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const conversations = (await fetchRows(url, key)).map((row) => normalizeDonation(row, cleared)).filter((c) => c !== null);
  const sft = conversations.flatMap(buildSft);
  const dpo = conversations.flatMap(buildDpo);
  const review = buildSafetyReview(conversations);
  const stats = { exported_at: new Date().toISOString(), ...buildStats(conversations, { sft: sft.length, dpo: dpo.length, review: review.blind.length }) };

  await mkdir(out, { recursive: true, mode: 0o700 });
  await chmod(out, 0o700);
  const files: Array<[string, string]> = [
    ["conversations.jsonl", jsonl(conversations)],
    ["sft.jsonl", jsonl(sft)],
    ["dpo.jsonl", jsonl(dpo)],
    ["safety-review.jsonl", jsonl(review.blind)],
    ["safety-review.mapping.jsonl", jsonl(review.mapping)],
    ["stats.json", JSON.stringify(stats, null, 2) + "\n"],
  ];
  for (const [name, content] of files) {
    await writeFile(path.join(out, name), content, { mode: 0o600 });
    await chmod(path.join(out, name), 0o600);
  }
  console.log(`Wrote ${out}`);
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
