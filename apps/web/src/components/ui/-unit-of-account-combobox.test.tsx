import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const vocabulary = vi.hoisted(() => ({
  data: [] as Array<{ value: string; isCustom: boolean }>,
  isError: false,
  refetch: vi.fn(),
}));

vi.mock("#/hooks/use-vocabulary", () => ({
  useUnitsOfAccount: () => vocabulary,
}));

import { UnitOfAccountCombobox } from "./unit-of-account-combobox";

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <UnitOfAccountCombobox
        id="unit"
        value={value}
        onValueChange={setValue}
        placeholder="Search units of account"
        emptyMessage="No units of account found"
        ariaLabel="Unit of account"
      />
      <output data-testid="stored">{value}</output>
    </>
  );
}

beforeEach(() => {
  vocabulary.data = [];
  vocabulary.isError = false;
  vocabulary.refetch.mockReset();
});

describe("UnitOfAccountCombobox", () => {
  it("deduplicates server built-ins and displays custom vocabulary by its human label", () => {
    vocabulary.data = [
      { value: "kes", isCustom: false },
      { value: "Community Credits", isCustom: true },
    ];
    render(<Harness />);

    fireEvent.click(screen.getByRole("combobox", { name: "Unit of account" }));
    expect(screen.getAllByRole("option", { name: "KES - Kenyan Shillings" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("option", { name: "Community Credits" }));

    expect(screen.getByTestId("stored").textContent).toBe("Community Credits");
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("Community Credits");
  });

  it("adds a normalized custom value and rejects values over 32 characters", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Unit of account" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "community   credits" } });
    fireEvent.click(screen.getByRole("button", { name: "Add “Community Credits”" }));
    expect(screen.getByTestId("stored").textContent).toBe("Community Credits");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "x".repeat(33) } });
    expect(screen.queryByRole("button", { name: /^Add/ })).toBeNull();
  });

  it("keeps a stored custom value and offers Retry when vocabulary loading fails", () => {
    vocabulary.isError = true;
    render(<Harness initial="Neighbour Hours" />);

    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("Neighbour Hours");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(vocabulary.refetch).toHaveBeenCalledOnce();
  });
});
