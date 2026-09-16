import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vite-plus/test";

import { TagCombobox } from "./tag-combobox";

function TestTagCombobox() {
  const [value, setValue] = useState<string[]>([]);

  return (
    <TagCombobox
      items={["Agriculture", "Food production"]}
      value={value}
      onValueChange={setValue}
      searchLabel="Search tags"
      selectedLabel="Selected tags"
      listLabel="Tags"
      placeholder="Search tags"
      removeLabel={(tag) => `Remove ${tag}`}
    />
  );
}

describe("TagCombobox", () => {
  it("releases input focus after a pointer selection so the list can close", () => {
    render(<TestTagCombobox />);

    const search = screen.getByRole("combobox", { name: "Search tags" });
    search.focus();
    fireEvent.click(search);
    expect(document.activeElement).toBe(search);

    const option = screen.getByRole("option", { name: "Agriculture" });
    fireEvent.pointerDown(option, { pointerType: "mouse" });
    fireEvent.click(option);

    expect(screen.getByRole("button", { name: "Remove Agriculture" })).toBeTruthy();
    expect(document.activeElement).not.toBe(search);
  });

  it("keeps input focus when a keyboard user selects a tag", () => {
    render(<TestTagCombobox />);

    const search = screen.getByRole("combobox", { name: "Search tags" });
    search.focus();
    fireEvent.click(search);
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });

    expect(screen.getByRole("button", { name: "Remove Agriculture" })).toBeTruthy();
    expect(document.activeElement).toBe(search);
  });

  it("adds a title-cased tag the vocabulary does not have yet", () => {
    render(<TestTagCombobox />);

    const search = screen.getByRole("combobox", { name: "Search tags" });
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "urban   FARMING" } });

    fireEvent.click(screen.getByRole("button", { name: "Add “Urban Farming”" }));

    expect(screen.getByRole("button", { name: "Remove Urban Farming" })).toBeTruthy();
    expect((search as HTMLInputElement).value).toBe("");
  });

  it("adds a new tag on Enter", () => {
    render(<TestTagCombobox />);

    const search = screen.getByRole("combobox", { name: "Search tags" });
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "beekeeping" } });
    fireEvent.keyDown(search, { key: "Enter" });

    expect(screen.getByRole("button", { name: "Remove Beekeeping" })).toBeTruthy();
  });

  // The existing value is already in the list, so offering to add it would
  // create a second row for one concept.
  it("does not offer to add a tag the vocabulary already spells", () => {
    render(<TestTagCombobox />);

    const search = screen.getByRole("combobox", { name: "Search tags" });
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "AGRICULTURE" } });

    expect(screen.queryByRole("button", { name: /^Add / })).toBeNull();
  });

  it("does not offer to add a tag the backend would reject", () => {
    render(<TestTagCombobox />);

    const search = screen.getByRole("combobox", { name: "Search tags" });
    fireEvent.focus(search);

    for (const rejected of ["Food, Water", "   ", "a".repeat(101)]) {
      fireEvent.change(search, { target: { value: rejected } });
      expect(screen.queryByRole("button", { name: /^Add / })).toBeNull();
    }
  });
});
