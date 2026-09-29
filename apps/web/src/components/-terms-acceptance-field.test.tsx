import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vite-plus/test";

import { PLATFORM_TERMS_URL } from "#/lib/legal";
import { TermsAcceptanceField } from "./terms-acceptance-field";

function TermsAcceptanceHarness() {
  const [checked, setChecked] = useState(false);

  return <TermsAcceptanceField id="test-terms" checked={checked} onCheckedChange={setChecked} />;
}

describe("TermsAcceptanceField", () => {
  it("requires an explicit checkbox click and links to the platform terms", () => {
    render(<TermsAcceptanceHarness />);

    const checkbox = screen.getByRole("checkbox", { name: "Accept Terms and Conditions" });
    const link = screen.getByRole("link", { name: "Terms and Conditions" });

    expect(checkbox.hasAttribute("data-checked")).toBe(false);
    expect(link.getAttribute("href")).toBe(PLATFORM_TERMS_URL);
    expect(link.getAttribute("target")).toBe("_blank");

    fireEvent.click(link);
    expect(checkbox.hasAttribute("data-checked")).toBe(false);

    fireEvent.click(checkbox);
    expect(checkbox.hasAttribute("data-checked")).toBe(true);
  });
});
