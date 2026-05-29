import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithData } from "@/test/render";
import { TagEditor } from "./tag-editor";
import type { Tag } from "@/lib/domain/types";

const tag: Tag = { id: "tag-x", name: "Subscription", color: "35 90% 55%" };

describe("TagEditor (tags page)", () => {
  it("renders a New tag form", () => {
    renderWithData(<TagEditor tag={null} onClose={() => {}} />);
    expect(screen.getByText("New tag")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. Subscription")).toBeInTheDocument();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("renders an Edit form with Delete for an existing tag", () => {
    renderWithData(<TagEditor tag={tag} onClose={() => {}} />);
    expect(screen.getByText("Edit tag")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });
});
