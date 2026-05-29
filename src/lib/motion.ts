/** Shared motion presets — one place to tune the app's "feel". */

/** Snappy spring for panels, sheets, and widget entrances — fast + tight. */
export const spring = { type: "spring", stiffness: 920, damping: 42 } as const;

/** Per-item entrance stagger step (seconds). */
export const STAGGER_STEP = 0.025;
