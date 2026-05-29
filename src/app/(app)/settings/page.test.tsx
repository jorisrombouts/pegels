import { screen } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { describe, expect, it } from "vitest";
import { renderWithData } from "@/test/render";
import SettingsPage from "./page";

function renderPage() {
  return renderWithData(
    <ThemeProvider attribute="class" defaultTheme="dark">
      <SettingsPage />
    </ThemeProvider>,
  );
}

describe("SettingsPage", () => {
  it("renders the four sections", () => {
    renderPage();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.getByText("Privacy")).toBeInTheDocument();
    expect(screen.getByText("Data")).toBeInTheDocument();
    expect(screen.getByText(/Locale/)).toBeInTheDocument();
  });

  it("exposes theme options, the mask switch, and clear-all", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "System" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mask amounts")).toBeInTheDocument();
    expect(screen.getByText("Clear all data")).toBeInTheDocument();
  });
});
