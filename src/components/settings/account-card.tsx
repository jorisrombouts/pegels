"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { currentUserEmail, signOutAction } from "@/app/actions/auth";

export function AccountCard() {
  const { data: email } = useQuery({
    queryKey: ["session-email"],
    queryFn: () => currentUserEmail(),
    staleTime: Infinity,
  });

  return (
    <Card>
      <SectionLabel className="mb-3">Account</SectionLabel>
      <div className="flex items-center justify-between gap-4">
        <p className="min-w-0 truncate text-sm text-muted-foreground">{email ?? "Signed in"}</p>
        <form action={signOutAction}>
          <Button type="submit" variant="glass">Sign out</Button>
        </form>
      </div>
    </Card>
  );
}
