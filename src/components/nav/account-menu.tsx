"use client";

import { useQuery } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { iconButton } from "@/components/ui/icon-button";
import { currentUser, signOutAction } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

/**
 * Avatar in the page header that surfaces who's signed in and a one-tap sign-out.
 * Shows the Google photo when present, else the first initial of the name/email.
 */
export function AccountMenu() {
  const { data } = useQuery({ queryKey: ["session-user"], queryFn: () => currentUser(), staleTime: Infinity });
  const name = data?.name ?? null;
  const email = data?.email ?? null;
  const image = data?.image ?? null;
  const initial = (name || email || "?").trim().charAt(0).toUpperCase();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Account" className={cn(iconButton, "overflow-hidden p-0")}>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- Google avatar; next/image would need remotePatterns config.
            <img src={image} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="text-sm font-semibold text-foreground">{initial}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60">
        <div className="px-2 py-1.5">
          {name && <p className="truncate text-sm font-medium">{name}</p>}
          <p className="truncate text-xs text-muted-foreground">{email ?? "Signed in"}</p>
        </div>
        <form action={signOutAction} className="mt-1">
          <Button type="submit" variant="glass" size="sm" className="w-full justify-start gap-2">
            <LogOut className="size-4" /> Sign out
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
