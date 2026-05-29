"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { ColorSwatches, COLOR_SWATCHES } from "@/components/ui/color-swatches";
import { useData } from "@/store/data";
import type { Tag } from "@/lib/domain/types";

export function TagEditor({ tag, onClose }: { tag: Tag | null; onClose: () => void }) {
  const { transactions, upsertTag, removeTag } = useData();
  const usedCount = tag ? transactions.filter((t) => t.tagIds.includes(tag.id)).length : 0;

  const [name, setName] = useState(tag?.name ?? "");
  const [color, setColor] = useState(tag?.color ?? COLOR_SWATCHES[0]);

  function save() {
    if (!name.trim()) return;
    upsertTag({ id: tag?.id ?? `tag-${Date.now()}`, name: name.trim(), color });
    onClose();
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-lg font-semibold">{tag ? "Edit tag" : "New tag"}</p>
        {tag && <p className="text-xs text-muted-foreground">Used by {usedCount} transactions.</p>}
      </div>

      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Subscription" />
      </Field>

      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground">Color</span>
        <ColorSwatches value={color} onChange={setColor} />
      </div>

      <div className="flex items-center justify-between pt-1">
        {tag ? (
          <Button variant="danger" size="sm" onClick={() => { removeTag(tag.id); onClose(); }} className="gap-1.5">
            <Trash2 className="size-4" /> Delete
          </Button>
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
