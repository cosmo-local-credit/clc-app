import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vite-plus/test";

import { SearchableSelect } from "./searchable-select";

const OPTIONS = [
  { value: "KES", label: "KES - Kenyan Shilling" },
  { value: "TZS", label: "TZS - Tanzanian Shilling" },
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
});
