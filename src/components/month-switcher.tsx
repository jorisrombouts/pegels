"use client";

import { AnimatePresence, motion } from "motion/react";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { useData } from "@/store/data";
import { useUI } from "@/store/ui";
import { latestDataMonth, nextMonthKey, prevMonthKey } from "@/lib/domain/selectors";
import { monthLabel } from "@/lib/format";
import { spring } from "@/lib/motion";

const ARROW = "pressable grid size-8 place-items-center rounded-full text-muted-foreground hover:text-foreground";

/**
 * Shared month navigator: prev / label / next, plus a "This month" button that
 * appears only when the selected month isn't the latest month that has data.
 */
export function MonthSwitcher({ suffix }: { suffix?: React.ReactNode }) {
  const { transactions } = useData();
  // Scoped selectors: don't re-render when unrelated UI state (modals, mask) changes.
  const month = useUI((s) => s.month);
  const setMonth = useUI((s) => s.setMonth);
  const current = latestDataMonth(transactions);
  const atCurrent = !current || month === current;

  return (
    <div className="flex items-center gap-2">
      <div className="glass flex items-center rounded-full p-1">
        <button aria-label="Previous month" className={ARROW} onClick={() => setMonth(prevMonthKey(month))}>
          <ChevronLeft className="size-4" />
        </button>
        <span className="tnum min-w-40 px-2 text-center text-sm font-medium">
          {monthLabel(month)}
          {suffix != null && <> · {suffix}</>}
        </span>
        <button aria-label="Next month" className={ARROW} onClick={() => setMonth(nextMonthKey(month))}>
          <ChevronRight className="size-4" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {!atCurrent && (
          <motion.button
            type="button"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={spring}
            onClick={() => setMonth(current!)}
            className="pressable flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full glass px-3.5 text-xs font-semibold text-primary"
          >
            <CalendarClock className="size-4" />
            This month
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
