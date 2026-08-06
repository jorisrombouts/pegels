"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, Plus, Upload } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MORE_NAV, PRIMARY_NAV, type NavItem } from "./nav-items";
import { cn } from "@/lib/utils";
import { useUI } from "@/store/ui";
import { useKeyboardOpen } from "@/lib/use-keyboard-open";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

// Active = wide rounded rectangle (icon + label); inactive = icon only.
// The label width is animated with pure CSS (max-width) — NOT Framer `layout`,
// which mis-measured across route changes and made the bar pop vertically.
const TAB = "pressable relative flex h-12 items-center rounded-full px-3 sm:px-3.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring";

function NavButton({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(TAB, "transition-colors", active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
    >
      {active && (
        <span className="absolute inset-0 rounded-full bg-primary shadow-[0_6px_20px_-6px_hsl(var(--primary)/0.7)]" />
      )}
      <Icon className="relative z-10 size-[22px] shrink-0 sm:size-6" strokeWidth={2} />
      <span
        className={cn(
          "relative z-10 overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-200 ease-out",
          active ? "ml-2 max-w-[120px] opacity-100" : "ml-0 max-w-0 opacity-0",
        )}
      >
        {item.label}
      </span>
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const setImportOpen = useUI((s) => s.setImportOpen);
  const setQuickAddOpen = useUI((s) => s.setQuickAddOpen);

  const keyboardOpen = useKeyboardOpen();

  const moreActive = MORE_NAV.some((m) => isActive(pathname, m.href));

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-2 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-[transform,opacity] duration-200 ease-out sm:gap-3",
        // Slide out while the keyboard is up so a tap that dismisses it can't hit a nav tab mid-reflow.
        keyboardOpen && "pointer-events-none translate-y-[200%] opacity-0",
      )}
    >
      {/* Tabs pill — no `layout` here (it caused a vertical pop on route change);
          the pill slide uses layoutId and each tab animates its own width. */}
      <div className="glass flex items-center gap-1 rounded-full p-1.5 shadow-2xl sm:p-2">
        {PRIMARY_NAV.map((item) => (
          <NavButton key={item.key} item={item} active={isActive(pathname, item.href)} />
        ))}

        <DropdownMenu.Root>
          <DropdownMenu.Trigger aria-label="More" className={cn(TAB, moreActive ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            <MoreHorizontal className="size-[22px] shrink-0 sm:size-6" strokeWidth={2} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content side="top" align="end" sideOffset={12} className="glass z-50 min-w-44 rounded-2xl p-1.5">
              <DropdownMenu.Item asChild>
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-foreground outline-none hover:bg-[hsl(var(--muted)/0.6)] data-[highlighted]:bg-[hsl(var(--muted)/0.6)]"
                >
                  <Upload className="size-4 text-muted-foreground" />
                  Import
                </button>
              </DropdownMenu.Item>
              {MORE_NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <DropdownMenu.Item key={item.key} asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm outline-none",
                        "text-foreground hover:bg-[hsl(var(--muted)/0.6)] data-[highlighted]:bg-[hsl(var(--muted)/0.6)]",
                      )}
                    >
                      <Icon className="size-4 text-muted-foreground" />
                      {item.label}
                    </Link>
                  </DropdownMenu.Item>
                );
              })}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* Detached "+" circle (Quick Add) */}
      <button
        type="button"
        aria-label="Add transaction"
        onClick={() => setQuickAddOpen(true)}
        className="pressable grid size-[52px] shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_30px_-6px_hsl(var(--primary)/0.8)] sm:size-[60px]"
      >
        <Plus className="size-6" strokeWidth={2.5} />
      </button>
    </nav>
  );
}
