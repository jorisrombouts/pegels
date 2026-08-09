"use client";

import { useEffect, useState } from "react";
import { Loader2, Target } from "lucide-react";
import { Card, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { blendedAccuracy } from "@/lib/eval/coverage";
import { confusionPairs } from "@/lib/eval/score";
import { useData } from "@/store/data";
import { accuracyHistory, measureAccuracy, type AccuracyPoint } from "@/app/actions/accuracy";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const share = (p: AccuracyPoint) => (p.txTotal ? p.txCovered / p.txTotal : 0);
const unseenRate = (p: AccuracyPoint) => (p.sampled ? p.correct / p.sampled : 0);
const seenRate = (p: AccuracyPoint) => (p.sampled ? p.correctSeen / p.sampled : 0);

/**
 * What the categorizer gets right, and why.
 *
 * The headline is the blend, because that is the question — how often will the next transaction be
 * labelled correctly. Its two parts sit directly beneath rather than in a tooltip: nearly all
 * transactions land on a place already known, and a small tail does not, and those two regimes have
 * very different hit rates. Averaging them into one figure without showing the split is how a
 * number stops being explainable.
 */
export function AccuracyCard() {
  const { categories } = useData();
  const [history, setHistory] = useState<AccuracyPoint[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    accuracyHistory().then(setHistory).catch(() => setHistory([]));
  }, []);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setHistory(await measureAccuracy());
    } catch (e) {
      console.error("accuracy check failed", e);
      setError("Couldn't finish the check. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  const latest = history?.at(-1) ?? null;
  const previous = history && history.length > 1 ? history.at(-2)! : null;
  const nameOf = (id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? id : "no category");

  const blended = latest ? blendedAccuracy(share(latest), seenRate(latest), unseenRate(latest)) : null;
  const prevBlended = previous ? blendedAccuracy(share(previous), seenRate(previous), unseenRate(previous)) : null;
  const delta = blended !== null && prevBlended !== null ? blended - prevBlended : null;

  return (
    <Card>
      <SectionLabel className="mb-3">How often it gets it right</SectionLabel>

      {latest && blended !== null ? (
        <>
          <div className="flex items-end justify-between gap-4">
            <div>
              {/* Proportional figures: tabular-nums makes a large standalone value look loose. */}
              <p className="font-display text-4xl font-bold leading-none">{pct(blended)}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                expected on your next transaction
                {delta !== null && Math.abs(delta) >= 0.005 && (
                  <>
                    {" · "}
                    <span style={{ color: `hsl(var(--${delta > 0 ? "positive" : "negative"}))` }}>
                      {delta > 0 ? "↑" : "↓"} {pct(Math.abs(delta))}
                    </span>
                  </>
                )}
              </p>
            </div>
            {history && history.length > 1 && <Sparkline points={history} />}
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-3">
            <Part label="Places it knows" value={pct(share(latest))} sub={`${latest.txCovered} of ${latest.txTotal} transactions`} />
            <Part label="…it gets right" value={pct(seenRate(latest))} sub="when it has seen the place" />
            <Part label="New places" value={pct(unseenRate(latest))} sub={`${latest.sampled} checked blind`} />
          </dl>

          {latest.misses.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                What it confuses on a new place
              </p>
              <ul className="mt-1.5 space-y-1">
                {confusionPairs(latest.misses).slice(0, 4).map((c) => (
                  <li key={`${c.expected}>${c.got}`} className="flex items-baseline gap-2 text-xs">
                    <span className="tnum w-6 shrink-0 text-muted-foreground">{c.count}×</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-muted-foreground">{nameOf(c.expected)}</span>
                      {" → "}
                      <span className="font-medium">{nameOf(c.got)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                The same two categories swapping repeatedly usually means they overlap, not that it
                guessed badly.
              </p>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {history === null
            ? "Loading…"
            : "Not measured yet. Run a check to see how often it agrees with your own labels."}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs" style={{ color: "hsl(var(--negative))" }}>
          {error}
        </p>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Checks every transaction against the places you have confirmed, then re-labels a sample of
        those places twice — once normally, once with the place hidden from its own lookup so it has
        to work the answer out. Costs a little each time it runs.
      </p>

      <Button variant="glass" size="sm" onClick={run} disabled={busy} className="mt-3 gap-1.5">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Target className="size-4" />}
        {busy ? "Checking…" : "Check accuracy"}
      </Button>
    </Card>
  );
}

function Part({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl glass-inset px-3 py-2.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="tnum mt-0.5 text-lg font-semibold">{value}</dd>
      <dd className="mt-0.5 text-[11px] text-muted-foreground">{sub}</dd>
    </div>
  );
}

/**
 * Trend behind the headline. Recessive: 2px line in muted ink, the current run in the accent so the
 * eye lands on "now". The whole mark is aria-hidden — the numbers above already say it, and reading
 * a polyline aloud helps nobody.
 */
function Sparkline({ points }: { points: AccuracyPoint[] }) {
  const w = 132;
  const h = 40;
  const shown = points.slice(-12);
  // Fixed 0..1 scale, never auto-fitted to the data's own range: a jump from 82% to 84% must look
  // like two points, not like a cliff.
  const x = (i: number) => (shown.length === 1 ? w : (i / (shown.length - 1)) * w);
  const y = (v: number) => h - v * h;
  const at = (p: AccuracyPoint) => blendedAccuracy(share(p), seenRate(p), unseenRate(p));
  const d = shown.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(at(p)).toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h + 4}`}
      data-sparkline
      className="h-11 w-32 shrink-0 overflow-visible"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={d} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.55" vectorEffect="non-scaling-stroke" />
      <circle cx={x(shown.length - 1)} cy={y(at(shown.at(-1)!))} r="4" fill="hsl(var(--primary))" />
    </svg>
  );
}
