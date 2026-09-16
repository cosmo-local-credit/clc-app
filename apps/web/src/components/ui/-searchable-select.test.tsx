import { toVocabularyTitleCase, validateCustomUnit } from "@clc/core/features/vocabulary/logic";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vite-plus/test";

import { SearchableSelect } from "./searchable-select";

const OPTIONS = [
  { value: "KES", label: "KES - Kenyan Shilling" },
  { value: "TZS", label: "TZS - Tanzanian Shilling" },
];

const UNITS = [
  { value: "kg", label: "kg" },
  { value: "litre", label: "litre" },
];

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <SearchableSelect
        id="currency"
        options={OPTIONS}
        value={value}
        onValueChange={setValue}
        placeholder="Search currencies"
        emptyMessage="No currencies found."
      />
      <output data-testid="stored">{value}</output>
    </>
  );
}

// The offering unit field: the list is a suggestion, and anything the seller
// types that survives validation becomes the value.
function CreatableHarness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <SearchableSelect
        id="unit"
        options={UNITS}
        value={value}
        onValueChange={setValue}
        placeholder="Search units"
        emptyMessage="No units found."
        createLabel={(unit) => `Use "${unit}"`}
        normalizeCustomValue={toVocabularyTitleCase}
        validateCustomValue={validateCustomUnit}
      />
      <output data-testid="stored">{value}</output>
    </>
  );
}

describe("SearchableSelect", () => {
  it("shows the chosen option's label after a press when nothing was selected before", () => {
    render(<Harness initial="" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.click(input);

    const option = screen.getByRole("option", { name: "TZS - Tanzanian Shilling" });
    fireEvent.pointerDown(option, { pointerType: "touch" });
    fireEvent.click(option);

    expect(screen.getByTestId("stored").textContent).toBe("TZS");
    expect(input.value).toBe("TZS - Tanzanian Shilling");
  });

  it("shows the chosen label after typing a filter first", () => {
    render(<Harness initial="" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Tanzan" } });

    const option = screen.getByRole("option", { name: "TZS - Tanzanian Shilling" });
    fireEvent.pointerDown(option, { pointerType: "touch" });
    fireEvent.click(option);

    expect(screen.getByTestId("stored").textContent).toBe("TZS");
    expect(input.value).toBe("TZS - Tanzanian Shilling");
    expect(screen.queryByRole("option", { name: "KES - Kenyan Shilling" })).toBeNull();
  });

  it("discards a half-typed query on an outside press and shows the stored label", () => {
    render(<Harness initial="KES" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Tanz" } });
    expect(input.value).toBe("Tanz");

    fireEvent.pointerDown(document.body);

    expect(screen.getByTestId("stored").textContent).toBe("KES");
    expect(input.value).toBe("KES - Kenyan Shilling");
  });

  it("shows the new label after switching from one option to another", () => {
    render(<Harness initial="KES" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.value).toBe("KES - Kenyan Shilling");
    fireEvent.click(input);

    const option = screen.getByRole("option", { name: "TZS - Tanzanian Shilling" });
    fireEvent.pointerDown(option, { pointerType: "touch" });
    fireEvent.click(option);

    expect(screen.getByTestId("stored").textContent).toBe("TZS");
    expect(input.value).toBe("TZS - Tanzanian Shilling");
  });

  // Without the create callbacks the control is a closed list, and an unmatched
  // query must not offer to invent a currency.
  it("offers nothing to create when the create callbacks are absent", () => {
    render(<Harness initial="" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Guilder" } });

    expect(screen.queryByRole("button", { name: /Use/ })).toBeNull();
    expect(screen.getByText("No currencies found.")).toBeTruthy();
  });

  it("creates a title-cased value from free text and keeps it in the closed field", () => {
    render(<CreatableHarness initial="" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "produce   crate" } });

    fireEvent.click(screen.getByRole("button", { name: 'Use "Produce Crate"' }));

    expect(screen.getByTestId("stored").textContent).toBe("Produce Crate");
    // The created value is not in `options`; the field still has to show it.
    expect(input.value).toBe("Produce Crate");
  });

  it("creates on Enter as well as on press", () => {
    render(<CreatableHarness initial="" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ox cart" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByTestId("stored").textContent).toBe("Ox Cart");
  });

  it("does not offer to create a value an existing option already spells", () => {
    render(<CreatableHarness initial="" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "KG" } });

    expect(screen.queryByRole("button", { name: /Use/ })).toBeNull();
  });

  it("does not offer to create a value the schema would reject", () => {
    render(<CreatableHarness initial="" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "a".repeat(33) } });

    expect(screen.queryByRole("button", { name: /Use/ })).toBeNull();
  });

  // An imported unit predates the vocabulary list, so it is a value with no
  // option behind it. The field shows it rather than wiping itself.
  it("shows a stored value that is not in the option list", () => {
    render(<CreatableHarness initial="50kg Sack" />);
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("50kg Sack");
  });
});
