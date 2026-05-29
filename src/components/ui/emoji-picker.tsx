"use client";

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Curated finance/life set — covers the categories/accounts/goals use cases.
const EMOJIS = [
  "🍔", "🍽️", "🛒", "☕", "🍻", "🍕", "🥡",
  "🏠", "⚡", "💡", "🔥", "🚿", "🛋️", "🔧",
  "🚌", "🚇", "🚗", "⛽", "✈️", "🚆", "🚕",
  "🎬", "🎮", "🎵", "🎟️", "📚", "🎨", "⚽",
  "👕", "👟", "💄", "💍", "🧥", "🛍️",
  "💊", "🏥", "🦷", "💪", "🧘",
  "📦", "📱", "💻", "📺", "🌐",
  "💰", "💳", "🏦", "🐷", "📈", "🎯", "🗾", "🛟",
  "🎁", "🐾", "🧾", "📎", "💸", "❤️",
];

/**
 * Reusable emoji picker: a button showing the current emoji opens a glass grid.
 * Curated set, no dependency.
 */
export function EmojiPicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (emoji: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Pick an emoji"
          className={cn(
            "pressable grid h-[42px] w-14 shrink-0 place-items-center rounded-xl glass-inset text-xl",
            className,
          )}
        >
          {value || "🏷️"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="grid max-h-56 grid-cols-7 gap-1 overflow-y-auto">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onChange(e);
                setOpen(false);
              }}
              className={cn(
                "pressable grid size-9 place-items-center rounded-lg text-xl hover:bg-[hsl(var(--muted)/0.6)]",
                value === e && "bg-[hsl(var(--muted)/0.7)] ring-1 ring-primary/50",
              )}
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
