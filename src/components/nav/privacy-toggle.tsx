"use client";

import { Eye, EyeOff } from "lucide-react";
import { useUI } from "@/store/ui";
import { iconButton } from "@/components/ui/icon-button";

export function PrivacyToggle() {
  const masked = useUI((s) => s.masked);
  const toggleMask = useUI((s) => s.toggleMask);
  return (
    <button
      type="button"
      aria-label={masked ? "Show amounts" : "Hide amounts"}
      aria-pressed={masked}
      className={iconButton}
      onClick={toggleMask}
    >
      {masked ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
    </button>
  );
}
