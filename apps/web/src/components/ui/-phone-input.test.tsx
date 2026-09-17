import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

// The real sheet renders a full country list in a portal; the test only needs a
// way to pick one.
vi.mock("#/components/ui/country-sheet", () => ({
  CountrySheet: ({ open, onChange }: { open: boolean; onChange: (code: string) => void }) =>
    open ? (
      <button type="button" onClick={() => onChange("GB")}>
        Pick GB
      </button>
    ) : null,
}));

import { PhoneInputField } from "./phone-input";

function Harness({ defaultCountry }: { defaultCountry?: string | null }) {
  const [value, setValue] = useState("");
  return (
    <PhoneInputField
      id="phone"
      value={value}
      onChange={setValue}
      defaultCountry={defaultCountry}
      aria-label="Phone number"
    />
  );
}

describe("PhoneInputField", () => {
  it("falls back to the build's country when nothing is detected", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Country: KE" }).textContent).toContain("+254");
  });

  it("starts on the detected country", () => {
    render(<Harness defaultCountry="TZ" />);
    expect(screen.getByRole("button", { name: "Country: TZ" }).textContent).toContain("+255");
  });

  it("adopts a detection that arrives after the first render", () => {
    const view = render(<Harness defaultCountry={null} />);
    expect(screen.getByRole("button", { name: "Country: KE" })).toBeTruthy();

    view.rerender(<Harness defaultCountry="UG" />);
    expect(screen.getByRole("button", { name: "Country: UG" }).textContent).toContain("+256");
  });

  it("ignores a country the phone library does not know", () => {
    render(<Harness defaultCountry="ZZ" />);
    expect(screen.getByRole("button", { name: "Country: KE" })).toBeTruthy();
  });

  it("keeps a country the person chose when a later detection disagrees", () => {
    const view = render(<Harness defaultCountry="TZ" />);

    fireEvent.click(screen.getByRole("button", { name: "Country: TZ" }));
    fireEvent.click(screen.getByRole("button", { name: "Pick GB" }));
    expect(screen.getByRole("button", { name: "Country: GB" })).toBeTruthy();

    view.rerender(<Harness defaultCountry="UG" />);
    expect(screen.getByRole("button", { name: "Country: GB" })).toBeTruthy();
  });

  it("leaves a number already being typed on its own dialling code", () => {
    const view = render(<Harness defaultCountry="TZ" />);

    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "+255712345678" } });
    view.rerender(<Harness defaultCountry="GB" />);

    expect(screen.getByRole("button", { name: "Country: TZ" })).toBeTruthy();
  });
});
