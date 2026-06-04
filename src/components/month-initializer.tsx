"use client";

import { useEffect, useRef } from "react";
import { useData } from "@/store/data";
import { useUI } from "@/store/ui";
import { latestDataMonth } from "@/lib/domain/selectors";

/**
 * On each app load, jump to the latest month that has data — so signing in always lands on the
 * most recent month, not a stale/empty one. Runs once per mount; in-session month nav is respected.
 */
export function MonthInitializer() {
  const { transactions } = useData();
  const setMonth = useUI((s) => s.setMonth);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    const latest = latestDataMonth(transactions);
    if (latest) {
      setMonth(latest);
      done.current = true;
    }
  }, [transactions, setMonth]);
  return null;
}
