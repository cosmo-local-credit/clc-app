import type { RouterHistory } from "@tanstack/react-router";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { activateLocale } from "@clc/i18n/index";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { TagCombobox } from "./tag-combobox";

function TestTagCombobox({ history }: { history?: Pick<RouterHistory, "block"> } = {}) {
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
      navigationHistory={history}
    />
  );
}

afterEach(async () => activateLocale("en"));

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

  it("closes and releases focus when pressed outside", () => {
    render(<TestTagCombobox />);

    const search = screen.getByRole("combobox", { name: "Search tags" });
    fireEvent.click(search);
    expect(screen.getByRole("option", { name: "Agriculture" })).toBeTruthy();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("option", { name: "Agriculture" })).toBeNull();
    expect(document.activeElement).not.toBe(search);
  });

  it("consumes browser Back without blocking forward navigation", async () => {
    let blocker: Parameters<RouterHistory["block"]>[0] | undefined;
    const history = {
      block: (next: Parameters<RouterHistory["block"]>[0]) => {
        blocker = next;
        return () => undefined;
      },
    };
    render(<TestTagCombobox history={history} />);

    fireEvent.click(screen.getByRole("combobox", { name: "Search tags" }));
    expect(screen.getByRole("option", { name: "Agriculture" })).toBeTruthy();

    const blockerArgs = (action: "PUSH" | "BACK") =>
      ({ action }) as Parameters<NonNullable<typeof blocker>["blockerFn"]>[0];

    expect(await blocker?.blockerFn(blockerArgs("PUSH"))).toBe(false);
    expect(screen.getByRole("option", { name: "Agriculture" })).toBeTruthy();

    let blocked = false;
    await act(async () => {
      blocked = Boolean(await blocker?.blockerFn(blockerArgs("BACK")));
    });
    expect(blocked).toBe(true);
    expect(screen.queryByRole("option", { name: "Agriculture" })).toBeNull();
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

  // The value is already in the list. Offering to add it would make one concept
  // into two vocabulary rows that differ only in case.
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

it("translates selected categories and searches Serbian labels without duplicating vocabulary", async () => {
  await activateLocale("sr");
  render(<TestTagCombobox />);
  const search = screen.getByRole("combobox", { name: "Search tags" });
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: "Пољопривреда" } });
  const option = screen.getByRole("option", { name: "Пољопривреда" });
  expect(screen.queryByRole("button", { name: /^Додај/ })).toBeNull();
  fireEvent.click(option);
  expect(screen.getByRole("button", { name: "Remove Пољопривреда" })).toBeTruthy();
  fireEvent.change(search, { target: { value: "Agriculture" } });
  expect(screen.getByRole("option", { name: "Пољопривреда" })).toBeTruthy();
});
