"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MonthSwitcher } from "@/components/month-switcher";
import { useData } from "@/store/data";
import { useUI } from "@/store/ui";

export function DashboardControls() {
  const { accounts } = useData();
  const { accountFilter, setAccountFilter } = useUI();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MonthSwitcher />

      <Select value={accountFilter} onValueChange={setAccountFilter}>
        <SelectTrigger className="h-10 w-auto rounded-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All accounts</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.icon} {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
