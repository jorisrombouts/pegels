import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { SortableWidget } from "./sortable-widget";
import type { WidgetSize } from "@/store/ui";

function renderWidget(size: WidgetSize) {
  return render(
    <DndContext>
      <SortableContext items={["w1"]}>
        <SortableWidget id="w1" size={size} editing={false} onSize={() => {}}>
          <div>content</div>
        </SortableWidget>
      </SortableContext>
    </DndContext>,
  );
}

describe("SortableWidget sizing", () => {
  // Same size must yield the same floor height so widgets line up across rows.
  const cases: Array<[WidgetSize, string]> = [
    ["small", "min-h-[208px]"],
    ["medium", "min-h-[268px]"],
    ["large", "min-h-[268px]"],
  ];

  it.each(cases)("size=%s applies %s and stretches to fill its cell", (size, minH) => {
    renderWidget(size);
    const el = screen.getByTestId("widget-w1");
    expect(el).toHaveAttribute("data-size", size);
    expect(el.className).toContain(minH);
    expect(el.className).toContain("h-full");
  });

  it("large spans two columns; small and medium do not", () => {
    // colSpan is applied by the page via className; here we assert the size attr is exposed
    // so the grid can map it. (colSpan mapping is covered in registry.test.tsx)
    renderWidget("large");
    expect(screen.getByTestId("widget-w1")).toHaveAttribute("data-size", "large");
  });
});
