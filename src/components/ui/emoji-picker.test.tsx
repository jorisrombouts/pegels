import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmojiPicker } from "./emoji-picker";

describe("EmojiPicker", () => {
  it("shows the current emoji on the trigger", () => {
    render(<EmojiPicker value="🛒" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Pick an emoji" })).toHaveTextContent("🛒");
  });

  it("opens the grid and calls onChange with the picked emoji", async () => {
    const onChange = vi.fn();
    render(<EmojiPicker value="🛒" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Pick an emoji" }));
    await userEvent.click(screen.getByRole("button", { name: "🏠" }));
    expect(onChange).toHaveBeenCalledWith("🏠");
  });
});
