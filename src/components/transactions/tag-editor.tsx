"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { COLOR_SWATCHES } from "@/components/ui/color-swatches";
import { useData } from "@/store/data";
import { cn } from "@/lib/utils";

/** Edit a transaction's tags: remove via ×, add existing, or inline-create. */
export function TagEditor({ tagIds, onChange }: { tagIds: string[]; onChange: (ids: string[]) => void }) {
  const { tags, upsertTag } = useData();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = tagIds.map((id) => tags.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => Boolean(t));
  const available = tags.filter((t) => !tagIds.includes(t.id) && t.name.toLowerCase().includes(query.toLowerCase()));
  const exactExists = tags.some((t) => t.name.toLowerCase() === query.trim().toLowerCase());

  function add(id: string) {
    onChange([...tagIds, id]);
    setQuery("");
    setOpen(false);
  }

  function createAndAdd() {
    const name = query.trim();
    if (!name) return;
    const id = `tag-${Date.now()}`;
    upsertTag({ id, name, color: COLOR_SWATCHES[tags.length % COLOR_SWATCHES.length] });
    add(id);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {selected.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
          style={{ color: `hsl(${tag.color})`, backgroundColor: `hsl(${tag.color} / 0.14)` }}
        >
          {tag.name}
          <button type="button" aria-label={`Remove ${tag.name}`} onClick={() => onChange(tagIds.filter((id) => id !== tag.id))}>
            <X className="size-3" />
          </button>
        </span>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="pressable inline-flex items-center gap-1 rounded-full glass-inset px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-3" /> Add
          </button>
        </PopoverTrigger>
        <PopoverContent>
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find or create a tag…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim() && !exactExists) createAndAdd();
            }}
          />
          <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto">
            {available.map((tag) => (
              <li key={tag.id}>
                <button
                  type="button"
                  onClick={() => add(tag.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--muted)/0.6)]"
                >
                  <span className="size-2 rounded-full" style={{ backgroundColor: `hsl(${tag.color})` }} />
                  {tag.name}
                </button>
              </li>
            ))}
            {query.trim() && !exactExists && (
              <li>
                <button
                  type="button"
                  onClick={createAndAdd}
                  className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-primary hover:bg-[hsl(var(--muted)/0.6)]")}
                >
                  <Plus className="size-3.5" /> Create “{query.trim()}”
                </button>
              </li>
            )}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
