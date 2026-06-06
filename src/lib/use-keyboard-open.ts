"use client";

import { useEffect, useState } from "react";

/**
 * True while the on-screen keyboard is open, detected via the visual viewport shrinking well below
 * the layout viewport. Used to hide the fixed bottom nav while typing so a tap that dismisses the
 * keyboard can't land on a nav tab as the layout reflows back (iOS "ghost click" on keyboard close).
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // 120px clears toolbar/URL-bar jitter but is well under any keyboard (~250px+).
        setOpen(window.innerHeight - vv.height > 120);
      });
    };
    vv.addEventListener("resize", update);
    return () => {
      vv.removeEventListener("resize", update);
      cancelAnimationFrame(raf);
    };
  }, []);

  return open;
}
