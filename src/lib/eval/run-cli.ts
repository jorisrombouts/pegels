// Score the categorization pipeline against the hold-out. Run: `npm run eval`.
// `../db/env` MUST be imported first so DATABASE_URL is loaded before ../db reads it.
import "../db/env";
import { runEval } from "./run";
import { STUB_USER_ID } from "../db/claim";
import type { MetricBucket } from "./types";

/** Below this a bucket is small-sample noise, and a percentage would read as signal. */
const MIN_MEANINGFUL_N = 30;

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function line(label: string, b: MetricBucket, suppress: boolean) {
  if (b.n === 0) return `  ${label.padEnd(8)} —  (no examples)`;
  if (suppress) return `  ${label.padEnd(8)} n=${String(b.n).padStart(3)}  too few to be meaningful`;
  return (
    `  ${label.padEnd(8)} n=${String(b.n).padStart(3)}  ` +
    `kind ${pct(b.kindAccuracy).padStart(6)}  ` +
    `category ${pct(b.categoryAccuracy).padStart(6)}  ` +
    `(root ${pct(b.categoryAccuracyRoot).padStart(6)})  ` +
    `tag F1 ${pct(b.tagF1).padStart(6)}`
  );
}

async function main() {
  const userId = process.env.EVAL_USER_ID || process.env.DEV_USER_ID || STUB_USER_ID;
  const { metrics: m, mistakes, corpusSize, goldSize } = await runEval(userId);

  console.log(`\ncorpus ${corpusSize} retrievable merchants · ${goldSize} held out as gold\n`);
  console.log(line("overall", m.overall, false));
  console.log(line("seen", m.seen, false));
  console.log(line("unseen", m.unseen, m.unseen.n > 0 && m.unseen.n < MIN_MEANINGFUL_N));
  console.log(
    `\n  confidence  right ${m.meanConfidenceCorrect.toFixed(2)} vs wrong ${m.meanConfidenceWrong.toFixed(2)}` +
      `   (equal means the review queue is random)`,
  );
  console.log(`  review      ${m.reviewFlagged} flagged, ${pct(m.reviewPrecision)} of them actually wrong`);

  if (mistakes.length) {
    console.log(`\nworst mistakes (${mistakes.length}):`);
    for (const x of mistakes.slice(0, 12)) {
      console.log(
        `  ${x.description.slice(0, 28).padEnd(28)} expected ${String(x.expectedCategoryId ?? "—").padEnd(22)}` +
          ` got ${String(x.actualCategoryId ?? "—").padEnd(22)} conf ${x.confidence.toFixed(2)}${x.seen ? "" : "  [unseen]"}`,
      );
    }
  }
  console.log("");
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
