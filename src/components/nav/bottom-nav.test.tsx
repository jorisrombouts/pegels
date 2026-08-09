import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BottomNav } from "./bottom-nav";
import { PRIMARY_NAV } from "./nav-items";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

// next/link does not surface `prefetch` in the DOM, so capture it as a prop instead.
vi.mock("next/link", () => ({
  default: ({ href, prefetch, children, ...rest }: { href: string; prefetch?: boolean; children: React.ReactNode }) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));

describe("BottomNav", () => {
  /**
   * Every (app) route is dynamic (the layout reads cookies via auth()), so Next's default
   * prefetch only reaches the loading.tsx skeleton — the first tap on a tab then blocks on a
   * server round-trip plus that route's JS. The bottom bar is always in the viewport, so
   * prefetch on these links pulls the full route ahead of the tap.
   */
  it("fully prefetches every primary tab", () => {
    render(<BottomNav />);

    for (const item of PRIMARY_NAV) {
      expect(screen.getByLabelText(item.label)).toHaveAttribute("data-prefetch", "true");
    }
  });
});
