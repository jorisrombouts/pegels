"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { ColorSwatches, COLOR_SWATCHES } from "@/components/ui/color-swatches";
import { useData } from "@/store/data";
import { cn } from "@/lib/utils";
import type { Account, AccountKind } from "@/lib/domain/types";

export function AccountEditor({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { transactions, upsertAccount, removeAccount } = useData();
  const usedCount = account ? transactions.filter((t) => t.accountId === account.id).length : 0;

  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState(account?.type ?? "Checking");
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? "spending");
  const [icon, setIcon] = useState(account?.icon ?? "🏦");
  const [color, setColor] = useState(account?.color ?? COLOR_SWATCHES[0]);
  const [accountNumber, setAccountNumber] = useState(account?.accountNumber ?? "");
  const [archived, setArchived] = useState(account?.archived ?? false);

  function save() {
    if (!name.trim()) return;
    upsertAccount({
      id: account?.id ?? `acc-${Date.now()}`,
      name: name.trim(),
      type: type.trim() || "Account",
      kind,
      icon: icon || "🏦",
      color,
      balance: account?.balance ?? 0,
      accountNumber: accountNumber.trim() || null,
      archived,
    });
    onClose();
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-lg font-semibold">{account ? "Edit account" : "New account"}</p>
        {account && <p className="text-xs text-muted-foreground">Used by {usedCount} transactions.</p>}
      </div>

      <Field label="Name">
        <div className="flex gap-2">
          <EmojiPicker value={icon} onChange={setIcon} />
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. SEB" className="flex-1" />
        </div>
      </Field>

      <Field label="Type">
        <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. Checking, Revolut" />
      </Field>

      <Field label="Account number">
        <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="e.g. 99887766554" inputMode="numeric" />
        <p className="mt-1 text-xs text-muted-foreground">Imports referencing this number are auto-marked as transfers.</p>
      </Field>

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Kind</span>
        <div className="flex gap-2">
          {(["spending", "savings"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "pressable h-10 flex-1 rounded-xl text-sm font-medium capitalize",
                kind === k ? "bg-primary text-primary-foreground" : "glass-inset text-muted-foreground",
              )}
            >
              {k}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {kind === "spending" ? "Counts toward your monthly expenses." : "Excluded from spending; transfers in/out aren't counted."}
        </p>
      </div>

      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground">Color</span>
        <ColorSwatches value={color} onChange={setColor} />
      </div>

      <div className="flex items-start justify-between gap-4 rounded-2xl glass-inset p-4">
        <div>
          <p className="text-sm font-medium">Archive</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Hidden from pickers, kept for transaction history.</p>
        </div>
        <Switch checked={archived} onCheckedChange={setArchived} aria-label="Archive account" />
      </div>

      <div className="flex items-center justify-between pt-1">
        {account ? (
          <div className="flex flex-col">
            <Button
              variant="danger"
              size="sm"
              disabled={usedCount > 0}
              onClick={() => { removeAccount(account.id); onClose(); }}
              className="gap-1.5"
            >
              <Trash2 className="size-4" /> Delete
            </Button>
            {usedCount > 0 && <span className="mt-1 text-[11px] text-muted-foreground">Archive instead — in use.</span>}
          </div>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save}>Save</Button>
        </div>
      </div>
    </div>
  );
}
