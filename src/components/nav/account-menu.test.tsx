import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { AccountMenu } from "./account-menu";

vi.mock("@/app/actions/auth", () => ({
  currentUser: vi.fn(async () => ({ name: "Joris", email: "joris@example.com", image: null })),
  signOutAction: vi.fn(),
}));

function renderMenu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AccountMenu />
    </QueryClientProvider>,
  );
}

describe("AccountMenu", () => {
  it("shows the user's initial, then reveals name/email + Sign out on open", async () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Account" });
    // Avatar shows the first initial once the session loads.
    expect(await screen.findByText("J")).toBeInTheDocument();

    await userEvent.click(trigger);
    expect(await screen.findByText("joris@example.com")).toBeInTheDocument();
    expect(screen.getByText("Joris")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign out/ })).toBeInTheDocument();
  });
});
