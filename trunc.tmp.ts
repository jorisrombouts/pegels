import "@/lib/db/env";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/index";
import { normalizeMerchant } from "@/lib/ai/normalize";

const rows = (r: unknown) => (r as { rows: Record<string, unknown>[] }).rows ?? [];

async function main() {
  const r = await db.execute(sql`
    SELECT raw_description, cleaned_description, dedup_key
    FROM categorization_examples
    WHERE dedup_key IN ('ica supermar', 'apple com/bi', 'stora coop v')
  `);
  for (const x of rows(r)) {
    console.log(`raw:     ${JSON.stringify(x.raw_description)}`);
    console.log(`cleaned: ${JSON.stringify(x.cleaned_description)}`);
    console.log(`stored:  ${JSON.stringify(x.dedup_key)}`);
    console.log(`recomputed from cleaned: ${JSON.stringify(normalizeMerchant(String(x.cleaned_description)))}`);
    console.log("");
  }
}
main().then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); });
