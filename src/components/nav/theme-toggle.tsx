"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useMounted } from "@/lib/use-mounted";
import { iconButton } from "@/components/ui/icon-button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className={iconButton}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {mounted && isDark ? <Moon className="size-5" /> : <Sun className="size-5" />}
    </button>
  );
}
