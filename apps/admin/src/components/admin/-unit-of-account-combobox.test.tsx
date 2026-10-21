import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const vocabulary = vi.hoisted(() => ({
  data: [] as Array<{ value: string; isCustom: boolean }>,
  isError: false,
  refetch: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: () => vocabulary,
}));

import { UnitOfAccountCombobox } from "./unit-of-account-combobox";

function Harness({ initial = "", disabled = false }: { initial?: string; disabled?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="unit">Unit of account</label>
      <UnitOfAccountCombobox id="unit" value={value} onValueChange={setValue} disabled={disabled} />
      <output data-testid="stored">{value}</output>
    </>
  );
}

beforeEach(() => {
  vocabulary.data = [];
  vocabulary.isError = false;
  vocabulary.refetch.mockReset();
});

describe("admin UnitOfAccountCombobox", () => {
  it("deduplicates built-ins and selects a reusable custom unit", () => {
    vocabulary.data = [
      { value: "kes", isCustom: false },
      { value: "Community Credits", isCustom: true },
    ];
    render(<Harness />);

    const input = screen.getByRole("combobox", { name: "Unit of account" });
    fireEvent.focus(input);
    expect(screen.getAllByRole("option", { name: "KES - Kenyan Shillings" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("option", { name: "Community Credits" }));

    expect(screen.getByTestId("stored").textContent).toBe("Community Credits");
    expect((input as HTMLInputElement).value).toBe("Community Credits");
  });

  it("adds normalized custom values with Enter and the Add action", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Unit of account" });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "community   credits" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("stored").textContent).toBe("Community Credits");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "neighbour hours" } });
    fireEvent.click(screen.getByRole("button", { name: "Add “Neighbour Hours”" }));
    expect(screen.getByTestId("stored").textContent).toBe("Neighbour Hours");
  });

  it("retains the current value and retries a vocabulary failure", () => {
    vocabulary.isError = true;
    render(<Harness initial="Neighbour Hours" />);

    const input = screen.getByRole("combobox", { name: "Unit of account" });
    expect((input as HTMLInputElement).value).toBe("Neighbour Hours");
    fireEvent.focus(input);
    expect(screen.getByText("Could not load units of account.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(vocabulary.refetch).toHaveBeenCalledOnce();
  });

  it("honors the disabled state and rejects overlong custom values", () => {
    const view = render(<Harness disabled />);
    expect(screen.getByRole("combobox", { name: "Unit of account" })).toHaveProperty(
      "disabled",
      true,
    );

    view.rerender(<Harness />);
    const input = screen.getByRole("combobox", { name: "Unit of account" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "x".repeat(33) } });
    expect(screen.queryByRole("button", { name: /^Add/ })).toBeNull();
  });

  it("closes the options when focus moves outside the selector", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Unit of account" });
    fireEvent.focus(input);
    expect(screen.getByRole("listbox", { name: "Units of account" })).toBeTruthy();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("listbox", { name: "Units of account" })).toBeNull();
  });
});
