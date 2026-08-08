// Preflight for `npm run db:push`. `./env` MUST be imported first so DATABASE_URL is loaded
// before ./index reads it (drizzle-kit and tsx don't get Next's automatic env loading).
//
// `npm run db:prepare -- --dry-run` reports what the corpus migration would do without writing.
import "./env";
import { prepareDatabase } from "./prepare";

const dryRun = process.argv.includes("--dry-run");

prepareDatabase({ dryRun }).then(
  ({ consolidated, removed }) => {
    console.log(
      dryRun
        ? `dry run: would key ${consolidated} corpus rows and remove ${removed} duplicates (no changes made)`
        : `prepared: pgvector ready, ${consolidated} corpus rows keyed, ${removed} duplicates removed`,
    );
    process.exit(0);
  },
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
