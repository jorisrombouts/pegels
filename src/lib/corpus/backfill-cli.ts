// Seed the corpus from the user's categorization history. Run: `npm run corpus:backfill`.
// `../db/env` MUST be imported first so DATABASE_URL is loaded before ../db reads it.
//
//   npm run corpus:backfill                  -- hand-corrected transactions only
//   npm run corpus:backfill -- --with-model  -- also confident, unflagged model rows
import "../db/env";
import { runCorpusBackfill } from "./backfill-run";
import { STUB_USER_ID } from "../db/claim";

const userId = process.env.BACKFILL_USER_ID || process.env.DEV_USER_ID || STUB_USER_ID;
const includeHighConfidenceModel = process.argv.includes("--with-model");

runCorpusBackfill(userId, { includeHighConfidenceModel }).then(
  (r) => {
    console.log(
      `backfilled ${userId}: ${r.considered} transactions → ${r.merchants} merchants, ` +
        `${r.embedded} embedded, ${r.stillUnembedded} still unembedded`,
    );
    process.exit(0);
  },
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
