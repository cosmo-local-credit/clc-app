import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  getVocabulary: vi.fn(),
  deleteTag: vi.fn(),
  deleteUnit: vi.fn(),
  renameValue: vi.fn(),
  success: vi.fn(),
}));

vi.mock("#/lib/api", () => ({
  clcApi: {
    vocabulary: {
      getVocabulary: mocks.getVocabulary,
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
    isCustom: true,
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
  return { value: "Produce Crate", isCustom: true, offerings: 4, total: 4, ...overrides };
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
  mocks.getVocabulary.mockReset().mockResolvedValue({ tags: [tag()], units: [unit()] });
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
    mocks.getVocabulary.mockResolvedValue({ tags: [], units: [] });
    renderPage();

    expect(await screen.findByText("No custom tags")).toBeTruthy();
    expect(screen.getByText("No custom units")).toBeTruthy();
  });

  it("surfaces a failed load instead of an empty table", async () => {
    mocks.getVocabulary.mockRejectedValue(new Error("vocabulary is unavailable"));
    renderPage();

    expect(await screen.findByText("Could not load vocabulary")).toBeTruthy();
    expect(screen.getByText("vocabulary is unavailable")).toBeTruthy();
  });
});

describe("the default vocabulary", () => {
  beforeEach(() => {
    mocks.getVocabulary.mockResolvedValue({
      tags: [tag(), tag({ value: "Agriculture", isCustom: false, vouchers: 5, total: 5 })],
      units: [unit(), unit({ value: "kg", isCustom: false, offerings: 7, total: 7 })],
    });
  });

  it("lists the shipped values apart from the custom ones", async () => {
    renderPage();
    const defaults = within((await screen.findByText("Default tags")).closest("section")!);
    expect(defaults.getByText("Agriculture")).toBeTruthy();
    expect(defaults.queryByText("Urban Farming")).toBeNull();
    const custom = within(screen.getByText("Custom tags").closest("section")!);
    expect(custom.queryByText("Agriculture")).toBeNull();
    expect(
      within(screen.getByText("Default offering units").closest("section")!).getByText("kg"),
    ).toBeTruthy();
  });

  // A default tag is renamed to fit the deployment but never deleted; a default
  // unit is an app translation key and is neither.
  it("offers a rename, and no delete, on a default tag only", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: "Edit Agriculture" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete Agriculture" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit kg" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete kg" })).toBeNull();
  });

  it("renames a default tag through the tag endpoint", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Agriculture" }));
    fireEvent.change(screen.getByRole("textbox", { name: "New tag" }), {
      target: { value: "Farming" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.renameValue).toHaveBeenCalledWith("tag", "Agriculture", "Farming"),
    );
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Tag renamed."));
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
      mocks.getVocabulary.mockResolvedValue({
        tags: [tag({ value: kind === "tag" ? replacement : "Urban Farming" })],
        units: [unit({ value: kind === "unit" ? replacement : "Produce Crate" })],
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(mocks.renameValue).toHaveBeenCalledWith(kind, value, replacement));
      await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(message));
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["clc"] });
      expect(await screen.findByRole("button", { name: `Edit ${replacement}` })).toBeTruthy();
      await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
      expect(mocks.deleteTag).not.toHaveBeenCalled();
      expect(mocks.deleteUnit).not.toHaveBeenCalled();
    },
  );

  it("cancels without saving and restores the original value on reopening", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Urban Farming" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Discard this" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    expect(mocks.renameValue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Edit Urban Farming" }));
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Urban Farming");
  });

  // Regression: the editor used to live inside a table cell, which the table
  // remounts on every page render, so any refetch threw the draft away.
  it("keeps the draft when the vocabulary refreshes underneath it", async () => {
    mocks.getVocabulary.mockResolvedValue({
      tags: [tag({ value: "Apple" }), tag({ value: "Barbequeue" })],
      units: [],
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Barbequeue" }));
    fireEvent.change(screen.getByRole("textbox", { name: "New tag" }), {
      target: { value: "BBQ" },
    });
    // Another operator removed the row above it.
    mocks.getVocabulary.mockResolvedValue({ tags: [tag({ value: "Barbequeue" })], units: [] });
    await queryClient.invalidateQueries({ queryKey: ["clc"] });
    await waitFor(() => expect(screen.queryByText("Apple")).toBeNull());

    expect((screen.getByRole("textbox", { name: "New tag" }) as HTMLInputElement).value).toBe(
      "BBQ",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.renameValue).toHaveBeenCalledWith("tag", "Barbequeue", "BBQ"));
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
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Tag renamed."));
    expect(mocks.renameValue).toHaveBeenLastCalledWith("tag", "Urban Farming", "Community Gardens");
  });

  it("clears a previous refusal when the dialog is opened again", async () => {
    mocks.renameValue.mockRejectedValueOnce(
      new Error("a vocabulary value with this name already exists"),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Urban Farming" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Gardens" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Edit Produce Crate" }));
    expect(screen.getByRole("textbox", { name: "New unit" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
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

  it("keeps deletion available when a value has no references", async () => {
    mocks.getVocabulary.mockResolvedValue({
      tags: [tag({ vouchers: 0, posts: 0, total: 0 })],
      units: [],
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete Urban Farming" }));

    expect(screen.getByRole("button", { name: "Delete everywhere" })).toBeTruthy();
    expect(screen.queryByText(/Remove from/)).toBeNull();
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
