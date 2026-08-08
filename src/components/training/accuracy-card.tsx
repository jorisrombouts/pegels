"use client";

import { useEffect, useState } from "react";
import { Loader2, Target } from "lucide-react";
import { Card, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { accuracyHistory, measureAccuracy, type AccuracyPoint } from "@/app/actions/accuracy";

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * How often the categorizer picks the label you already confirmed, and whether that is improving.
 *
 * One number leading, the history behind it. A single series, so there is no legend to read and no
 * second axis to reconcile — the sparkline is the shape of one measurement over time and nothing
 * else. Values stay in text colours; the line alone carries the accent.
 */
export function AccuracyCard() {
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
  const delta = latest && previous ? latest.accuracy - previous.accuracy : null;

  return (
    <Card>
      <SectionLabel className="mb-3">How often it gets it right</SectionLabel>

      {latest ? (
        <div className="flex items-end justify-between gap-4">
          <div>
            {/* Proportional figures: tabular-nums makes a large standalone value look loose. */}
            <p className="font-display text-4xl font-bold leading-none">{pct(latest.accuracy)}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {latest.correct} of {latest.sampled} places labelled the way you would
              {delta !== null && Math.abs(delta) >= 0.005 && (
                <>
                  {" · "}
                  <span style={{ color: `hsl(var(--${delta > 0 ? "positive" : "negative"}))` }}>
                    {delta > 0 ? "↑" : "↓"} {pct(Math.abs(delta))} since last time
                  </span>
                </>
              )}
            </p>
          </div>
          {history && history.length > 1 && <Sparkline points={history} />}
        </div>
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

      <p className="mt-3 text-xs text-muted-foreground">
        Takes a sample of the places you have confirmed, hides each one from its own lookup, and
        checks whether it still lands on your label. Hiding it is what stops the answer being one of
        the examples. Costs a little each time it runs.
      </p>

      <Button variant="glass" size="sm" onClick={run} disabled={busy} className="mt-3 gap-1.5">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Target className="size-4" />}
        {busy ? "Checking…" : "Check accuracy"}
      </Button>
    </Card>
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
  const d = shown.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.accuracy).toFixed(1)}`).join(" ");
  const last = shown.at(-1)!;

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
      <circle cx={x(shown.length - 1)} cy={y(last.accuracy)} r="4" fill="hsl(var(--primary))" />
    </svg>
  );
}
