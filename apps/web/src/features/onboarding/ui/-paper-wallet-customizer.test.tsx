import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { PaperWalletCustomizer } from "./paper-wallet-customizer";
import type { PaperWalletCustomization } from "./paper-wallet-types";

function defaults(overrides?: Partial<PaperWalletCustomization>): PaperWalletCustomization {
  return {
    name: "My Wallet",
    website: "cosmolocal.credit",
    description: "",
    logoDataUrl: null,
    ...overrides,
  };
}

describe("PaperWalletCustomizer", () => {
  it("shows its fields straight away, for the sheet that holds them", () => {
    render(<PaperWalletCustomizer value={defaults()} onChange={vi.fn()} />);
    expect(document.querySelector("details")).toBeNull();
    expect(screen.getByLabelText("Name on wallet")).toBeTruthy();
    expect(screen.getByLabelText("Website")).toBeTruthy();
    expect(screen.getByLabelText("Description")).toBeTruthy();
  });

  it("name input has maxLength of 32 and reflects the value", () => {
    const onChange = vi.fn();
    render(<PaperWalletCustomizer value={defaults({ name: "Alice" })} onChange={onChange} />);
    const input = screen.getByLabelText("Name on wallet");
    expect(input).toHaveProperty("maxLength", 32);
    expect(input).toHaveProperty("value", "Alice");
  });

  it("website input has maxLength of 40 and reflects the value", () => {
    render(
      <PaperWalletCustomizer value={defaults({ website: "example.com" })} onChange={vi.fn()} />,
    );
    const input = screen.getByLabelText("Website");
    expect(input).toHaveProperty("maxLength", 40);
    expect(input).toHaveProperty("value", "example.com");
  });

  it("description textarea has maxLength of 80 and reflects the value", () => {
    render(
      <PaperWalletCustomizer
        value={defaults({ description: "A test description" })}
        onChange={vi.fn()}
      />,
    );
    const textarea = screen.getByLabelText("Description");
    expect(textarea).toHaveProperty("maxLength", 80);
    expect(textarea).toHaveProperty("value", "A test description");
  });

  it("calls onChange with updated name when user types", () => {
    const onChange = vi.fn();
    render(<PaperWalletCustomizer value={defaults()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Name on wallet"), {
      target: { value: "New Name" },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: "New Name" }));
  });

  it("calls onChange with updated website when user types", () => {
    const onChange = vi.fn();
    render(<PaperWalletCustomizer value={defaults()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Website"), {
      target: { value: "new-site.org" },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ website: "new-site.org" }));
  });

  it("shows an upload logo button", () => {
    render(<PaperWalletCustomizer value={defaults()} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /upload logo/i })).toBeTruthy();
  });

  it("rejects SVG files with an inline error and does not call onChange", () => {
    const onChange = vi.fn();
    render(<PaperWalletCustomizer value={defaults()} onChange={onChange} />);
    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;

    const file = new File(["<svg></svg>"], "logo.svg", {
      type: "image/svg+xml",
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/svg/i)).toBeTruthy();
  });

  it("rejects files larger than 512 KB with an inline error and does not call onChange", () => {
    const onChange = vi.fn();
    render(<PaperWalletCustomizer value={defaults()} onChange={onChange} />);
    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;

    const largeFile = new File([new ArrayBuffer(600_000)], "big-logo.png", {
      type: "image/png",
    });
    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/512/i)).toBeTruthy();
  });

  it("shows 'Reset logo' when logoDataUrl is set", () => {
    render(
      <PaperWalletCustomizer
        value={defaults({ logoDataUrl: "data:image/png;base64,abc" })}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/reset logo/i)).toBeTruthy();
  });

  it("clicking 'Reset logo' calls onChange with logoDataUrl null", () => {
    const onChange = vi.fn();
    render(
      <PaperWalletCustomizer
        value={defaults({ logoDataUrl: "data:image/png;base64,abc" })}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText(/reset logo/i));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ logoDataUrl: null }));
  });
});
