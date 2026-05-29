// Seed the stub user's data from the sample dataset. Run: `npm run db:seed`.
// `./env` MUST be imported first so DATABASE_URL is loaded before ./index reads it.
import "./env";
import { replaceAll } from "./queries";
import { STUB_USER_ID } from "../auth";
import { seedDataset } from "../../data/mock";

async function main() {
  await replaceAll(STUB_USER_ID, seedDataset);
  const c = seedDataset;
  console.log(
    `Seeded user "${STUB_USER_ID}": ${c.accounts.length} accounts, ${c.categories.length} categories, ` +
      `${c.tags.length} tags, ${c.transactions.length} transactions, ${c.budgets.length} budgets, ${c.goals.length} goals.`,
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
