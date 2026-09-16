import { toVocabularyTitleCase, validateCustomUnit } from "@clc/core/features/vocabulary/logic";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vite-plus/test";

import { SearchableSelect } from "./searchable-select";

const UNITS = [
  { value: "kg", label: "kg" },
  { value: "litre", label: "litre" },
];

function Harness({ initial }: { initial: string }) {
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
  it("selects an existing option by press", () => {
    render(<Harness initial="" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.click(input);

    const option = screen.getByRole("option", { name: "litre" });
    fireEvent.pointerDown(option, { pointerType: "touch" });
    fireEvent.click(option);

    expect(screen.getByTestId("stored").textContent).toBe("litre");
    expect(input.value).toBe("litre");
  });

  it("creates a title-cased value from free text", () => {
    render(<Harness initial="" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "produce   crate" } });

    fireEvent.click(screen.getByRole("button", { name: 'Use "Produce Crate"' }));

    expect(screen.getByTestId("stored").textContent).toBe("Produce Crate");
    // The value the operator just invented is not in `options` yet.
    expect(input.value).toBe("Produce Crate");
  });

  it("creates on Enter as well as on press", () => {
    render(<Harness initial="" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ox cart" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByTestId("stored").textContent).toBe("Ox Cart");
  });

  // "KG" is "kg" shouted. Offering to create it is how one concept becomes two
  // vocabulary rows.
  it("does not offer to create a value an existing option already spells", () => {
    render(<Harness initial="" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "KG" } });

    expect(screen.queryByRole("button", { name: /Use/ })).toBeNull();
  });

  it("does not offer to create a value the schema would reject", () => {
    render(<Harness initial="" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "a".repeat(33) } });

    expect(screen.queryByRole("button", { name: /Use/ })).toBeNull();
  });

  // An imported unit has no option behind it, and the field must still show it.
  it("shows a stored value that is not in the option list", () => {
    render(<Harness initial="50kg Sack" />);
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("50kg Sack");
  });
});
