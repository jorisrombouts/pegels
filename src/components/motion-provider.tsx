"use client";

import { LazyMotion, domMax } from "motion/react";

/**
 * Makes motion's feature bundle reachable from the (app) layout's client graph, so Turbopack
 * hoists it into the shared chunk group instead of emitting a private copy per page entry.
 * `domMax` is the same feature set the bare `motion` proxy already loads, so nothing changes at
 * the call sites — they keep using `motion.*`.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <LazyMotion features={domMax}>{children}</LazyMotion>;
}
