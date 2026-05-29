"use client";

import { Check } from "lucide-react";

/** Shared, well-spread swatch palette (HSL triplets) for categories/tags/accounts. */
export const COLOR_SWATCHES = [
  "217 91% 60%", "145 58% 47%", "32 92% 56%", "0 75% 60%",
  "276 72% 65%", "190 80% 52%", "172 64% 44%", "330 76% 62%",
];

export function ColorSwatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLOR_SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Color ${c}`}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className="pressable grid size-8 place-items-center rounded-full"
          style={{
            backgroundColor: `hsl(${c})`,
            ...(value === c ? { boxShadow: `0 0 0 2px hsl(var(--card)), 0 0 0 4px hsl(${c})` } : {}),
          }}
        >
          {value === c && <Check className="size-4 text-white" />}
        </button>
      ))}
    </div>
  );
}
