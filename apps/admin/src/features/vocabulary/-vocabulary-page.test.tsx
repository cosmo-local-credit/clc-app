import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  getCustomVocabulary: vi.fn(),
  deleteTag: vi.fn(),
  deleteUnit: vi.fn(),
  renameValue: vi.fn(),
  success: vi.fn(),
}));

vi.mock("#/lib/api", () => ({
  clcApi: {
    vocabulary: {
      getCustomVocabulary: mocks.getCustomVocabulary,
      deleteTag: mocks.deleteTag,
      deleteUnit: mocks.deleteUnit,
      renameValue: mocks.renameValue,
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: mocks.success, error: vi.fn() } }));

import { VocabularyPage } from "./vocabulary-page";

function tag(overrides: Record<string, unknown> = {}) {
  return {
    value: "Urban Farming",
    deployedTokens: 0,
    deployedPools: 0,
    vouchers: 2,
    pools: 0,
    posts: 1,
    offerings: 0,
    total: 3,
    ...overrides,
  };
}

function unit(overrides: Record<string, unknown> = {}) {
  return { value: "Produce Crate", offerings: 4, total: 4, ...overrides };
}

let queryClient: QueryClient;

function renderPage() {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <VocabularyPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.getCustomVocabulary.mockReset().mockResolvedValue({ tags: [tag()], units: [unit()] });
  mocks.deleteTag.mockReset().mockResolvedValue(tag());
  mocks.deleteUnit.mockReset().mockResolvedValue(unit());
  mocks.renameValue.mockReset().mockResolvedValue(undefined);
  mocks.success.mockReset();
});

describe("the vocabulary tables", () => {
  it("lists custom tags and units in their own sections", async () => {
    renderPage();

    expect(await screen.findByText("Urban Farming")).toBeTruthy();
    expect(screen.getByText("Produce Crate")).toBeTruthy();
    expect(screen.getByText("Custom tags")).toBeTruthy();
    expect(screen.getByText("Custom offering units")).toBeTruthy();
  });

  // The count is the whole reason an operator can decide whether to delete.
  it("shows the reference count for a tag and the offering count for a unit", async () => {
    renderPage();
    await screen.findByText("Urban Farming");

    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("says so when nothing has been added", async () => {
    mocks.getCustomVocabulary.mockResolvedValue({ tags: [], units: [] });
    renderPage();

    expect(await screen.findByText("No custom tags")).toBeTruthy();
    expect(screen.getByText("No custom units")).toBeTruthy();
  });

  it("surfaces a failed load instead of an empty table", async () => {
    mocks.getCustomVocabulary.mockRejectedValue(new Error("vocabulary is unavailable"));
    renderPage();

    expect(await screen.findByText("Could not load vocabulary")).toBeTruthy();
    expect(screen.getByText("vocabulary is unavailable")).toBeTruthy();
  });
});

describe("renaming a value", () => {
  it.each([
    ["tag", "Urban Farming", "  Community   Gardens  ", "Community Gardens", "Tag renamed."],
    ["unit", "Produce Crate", "  kWh  ", "kWh", "Unit renamed."],
  ])(
    "saves a %s and refreshes the displayed vocabulary",
    async (kind, value, draft, replacement, message) => {
      renderPage();
      fireEvent.click(await screen.findByRole("button", { name: `Edit ${value}` }));
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      fireEvent.change(screen.getByRole("textbox", { name: `New ${kind}` }), {
        target: { value: draft },
      });
      expect(mocks.renameValue).not.toHaveBeenCalled();
      mocks.getCustomVocabulary.mockResolvedValue({
        tags: [tag({ value: kind === "tag" ? replacement : "Urban Farming" })],
        units: [unit({ value: kind === "unit" ? replacement : "Produce Crate" })],
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(mocks.renameValue).toHaveBeenCalledWith(kind, value, replacement));
      await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(message));
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["clc"] });
      expect(await screen.findByRole("button", { name: `Edit ${replacement}` })).toBeTruthy();
      expect(mocks.deleteTag).not.toHaveBeenCalled();
      expect(mocks.deleteUnit).not.toHaveBeenCalled();
    },
  );

  it("cancels without saving and restores the original value on reopening", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Urban Farming" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Discard this" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.renameValue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Edit Urban Farming" }));
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Urban Farming");
  });

  it.each([
    ["Urban Farming", "Urban Farming"],
    ["Urban Farming", "   "],
    ["Urban Farming", "food, water"],
    ["Urban Farming", "a".repeat(101)],
    ["Produce Crate", "a".repeat(33)],
  ])("prevents saving %s as an unchanged or invalid value %s", async (value, draft) => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: `Edit ${value}` }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: draft } });
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.submit(save.closest("form")!);
    expect(mocks.renameValue).not.toHaveBeenCalled();
  });

  it("shows a refused rename and lets the admin correct and retry it", async () => {
    mocks.renameValue.mockRejectedValueOnce(
      new Error(
        "This tag is being used by an unfinished voucher or pool deployment. Please try again after the deployment finishes.",
      ),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Urban Farming" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Gardens" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Please try again after the deployment finishes.",
    );
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Gardens");
    expect(mocks.success).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Community Gardens" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Tag renamed."));
    expect(mocks.renameValue).toHaveBeenLastCalledWith("tag", "Urban Farming", "Community Gardens");
  });

  it("disables the editor and prevents duplicate submissions while saving", async () => {
    let finish!: () => void;
    mocks.renameValue.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Urban Farming" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Gardens" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const saving = await screen.findByRole("button", { name: "Saving…" });
    expect((saving as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole("textbox") as HTMLInputElement).disabled).toBe(true);
    fireEvent.submit(saving.closest("form")!);
    expect(mocks.renameValue).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Tag renamed."));
  });
});

describe("deleting a value", () => {
  // A tag delete reaches six tables. The dialog has to name what goes, per
  // surface, before the operator commits to it.
  it("breaks a tag's impact down per surface before confirming", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete Urban Farming" }));

    expect(screen.getByText("Delete “Urban Farming”?")).toBeTruthy();
    expect(screen.getByText("Remove from 2 vouchers.")).toBeTruthy();
    expect(screen.getByText("Remove from 1 post.")).toBeTruthy();
    expect(screen.queryByText(/Remove from 0/)).toBeNull();
  });

  // Deleting a unit must not read as deleting the offerings that used it.
  it("describes a unit delete as clearing the column", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete Produce Crate" }));

    expect(screen.getByText("Clear the unit from 4 offerings.")).toBeTruthy();
  });

  it("says plainly when a value has no references", async () => {
    mocks.getCustomVocabulary.mockResolvedValue({
      tags: [tag({ vouchers: 0, posts: 0, total: 0 })],
      units: [],
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete Urban Farming" }));

    expect(screen.getByText("This value currently has no references.")).toBeTruthy();
  });

  it("does nothing until the destructive button is pressed", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete Urban Farming" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByText("Delete “Urban Farming”?")).toBeNull());
    expect(mocks.deleteTag).not.toHaveBeenCalled();
  });

  it("deletes the tag, refreshes every catalog read, and confirms", async () => {
    renderPage();
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    fireEvent.click(await screen.findByRole("button", { name: "Delete Urban Farming" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete everywhere" }));

    await waitFor(() => expect(mocks.deleteTag).toHaveBeenCalledWith("Urban Farming"));
    // A deleted tag can appear in any catalog list, so the whole namespace goes.
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["clc"] }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Tag deleted."));
    await waitFor(() => expect(screen.queryByText("Delete “Urban Farming”?")).toBeNull());
    invalidate.mockRestore();
  });

  it("deletes a unit through the unit endpoint", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete Produce Crate" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete everywhere" }));

    await waitFor(() => expect(mocks.deleteUnit).toHaveBeenCalledWith("Produce Crate"));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Unit deleted."));
    expect(mocks.deleteTag).not.toHaveBeenCalled();
  });

  // A built-in refusal arrives as a 409. The dialog stays open with the reason,
  // because closing it would read as a successful delete.
  it("keeps the dialog open and shows why a delete was refused", async () => {
    mocks.deleteTag.mockRejectedValue(new Error("built-in vocabulary values cannot be deleted"));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete Urban Farming" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete everywhere" }));

    expect(await screen.findByText("built-in vocabulary values cannot be deleted")).toBeTruthy();
    expect(screen.getByText("Delete “Urban Farming”?")).toBeTruthy();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
