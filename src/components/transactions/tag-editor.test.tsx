import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithData } from "@/test/render";
import { seedDataset, type Dataset } from "@/data/mock";
import { COLOR_SWATCHES } from "@/components/ui/color-swatches";
import { DATASET_KEY } from "@/store/data";
import { TagEditor } from "./tag-editor";

// One existing tag → the new tag takes slot 1 of the rotation, where the old private palette drifted.
const dataset: Dataset = { ...seedDataset, tags: [seedDataset.tags[0]] };

describe("TagEditor (transaction panel)", () => {
  it("colours an inline-created tag from the shared palette", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderWithData(<TagEditor tagIds={[]} onChange={() => {}} />, { dataset });

    await user.click(screen.getByRole("button", { name: /Add/ }));
    await user.type(screen.getByPlaceholderText("Find or create a tag…"), "Vacation");
    await user.click(screen.getByRole("button", { name: /Create/ }));

    const created = queryClient.getQueryData<Dataset>(DATASET_KEY)?.tags.find((t) => t.name === "Vacation");
    expect(created?.color).toBe(COLOR_SWATCHES[1]);
  });
});
