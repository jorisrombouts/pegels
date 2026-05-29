"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { ColorSwatches, COLOR_SWATCHES } from "@/components/ui/color-swatches";
import { useData } from "@/store/data";
import type { Category } from "@/lib/domain/types";

/**
 * Create/edit a category or subcategory. `parentId` is fixed (set when adding a
 * subcategory under a parent); editing does not move a category between parents.
 */
export function CategoryEditor({
  category,
  parentId,
  onClose,
}: {
  category: Category | null;
  parentId: string | null;
  onClose: () => void;
}) {
  const { categories, upsertCategory, removeCategory } = useData();
  const effectiveParentId = category ? category.parentId : parentId;
  const parent = effectiveParentId ? categories.find((c) => c.id === effectiveParentId) : undefined;

  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "🏷️");
  const [color, setColor] = useState(category?.color ?? COLOR_SWATCHES[0]);

  const title = category ? "Edit category" : parent ? "New subcategory" : "New category";

  function save() {
    if (!name.trim()) return;
    upsertCategory({
      id: category?.id ?? `cat-${Date.now()}`,
      name: name.trim(),
      icon: icon || "🏷️",
      color,
      parentId: effectiveParentId,
    });
    onClose();
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-lg font-semibold">{title}</p>
        {parent && <p className="text-xs text-muted-foreground">Subcategory of {parent.icon} {parent.name}</p>}
      </div>

      <Field label="Name">
        <div className="flex gap-2">
          <EmojiPicker value={icon} onChange={setIcon} />
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Groceries" className="flex-1" />
        </div>
      </Field>

      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground">Color</span>
        <ColorSwatches value={color} onChange={setColor} />
      </div>

      <div className="flex items-center justify-between pt-1">
        {category ? (
          <Button variant="danger" size="sm" onClick={() => { removeCategory(category.id); onClose(); }} className="gap-1.5">
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
