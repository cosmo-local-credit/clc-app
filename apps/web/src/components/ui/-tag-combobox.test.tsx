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
  it("releases input focus after a pointer selection so touch keyboards stay closed", () => {
    render(<TestTagCombobox />);

    const search = screen.getByRole("combobox", { name: "Search tags" });
    search.focus();
    fireEvent.click(search);
    expect(document.activeElement).toBe(search);

    const option = screen.getByRole("option", { name: "Agriculture" });
    fireEvent.pointerDown(option, { pointerType: "touch" });
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
});
