import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { PhoneInputField } from "./phone-input";

describe("PhoneInputField", () => {
  it("uses the country encoded by a stored E.164 value", () => {
    render(<PhoneInputField value="+38766400077" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Country: BA" })).toBeTruthy();
  });

  it("does not duplicate a calling code when a complete international number is pasted", () => {
    const onChange = vi.fn();
    render(<PhoneInputField value="+38766400077" onChange={onChange} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Phone number" }), {
      target: { value: "+38766400077" },
    });

    expect(onChange).toHaveBeenLastCalledWith("+38766400077");
  });

  it("repairs an impossible stored number with a duplicated calling code", () => {
    const onChange = vi.fn();
    render(<PhoneInputField value="+38738766400077" onChange={onChange} />);

    expect(onChange).toHaveBeenCalledWith("+38766400077");
  });
});
