import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const suggest = vi.hoisted(() => vi.fn());

vi.mock("#/lib/api/recipients", () => ({
  recipientsClient: { suggest },
}));

import { UsernameInput } from "./username-input";

function TestInput({ error }: { error?: string }) {
  const [value, setValue] = useState("");
  return (
    <UsernameInput
      id="username"
      value={value}
      hint={() => "Alice Example"}
      onChange={setValue}
      onBlur={vi.fn()}
      error={error}
    />
  );
}

afterEach(() => {
  suggest.mockReset();
});

describe("UsernameInput", () => {
  it("supports manual entry and connects its description and validation error", () => {
    render(<TestInput error="That username is unavailable" />);
    const input = screen.getByRole("textbox", { name: "Username" }) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "alice-2" } });

    expect(input.value).toBe("alice-2");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("username-description username-error");
    expect(screen.getByRole("alert").textContent).toBe("That username is unavailable");
  });

  it("applies an automatic suggestion when the value has not changed", async () => {
    suggest.mockResolvedValue("alice-example");
    render(<TestInput />);

    fireEvent.click(screen.getByRole("button", { name: "Suggest username" }));

    await waitFor(() =>
      expect((screen.getByRole("textbox", { name: "Username" }) as HTMLInputElement).value).toBe(
        "alice-example",
      ),
    );
    expect(suggest).toHaveBeenCalledWith("Alice Example");
  });

  it("does not overwrite text entered while a suggestion is pending", async () => {
    let resolveSuggestion: ((value: string) => void) | undefined;
    suggest.mockImplementation(
      () => new Promise<string>((resolve) => (resolveSuggestion = resolve)),
    );
    render(<TestInput />);
    const input = screen.getByRole("textbox", { name: "Username" }) as HTMLInputElement;

    fireEvent.click(screen.getByRole("button", { name: "Suggest username" }));
    fireEvent.change(input, { target: { value: "manual-name" } });
    resolveSuggestion?.("suggested-name");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Suggest username" })).toBeTruthy(),
    );
    expect(input.value).toBe("manual-name");
    expect(screen.getByText("People can use this name to send vouchers to you.")).toBeTruthy();
    expect(screen.queryByText(/choose automatically/i)).toBeNull();
  });

  it("announces suggestion failures without marking the input invalid", async () => {
    suggest.mockRejectedValue(new Error("offline"));
    render(<TestInput />);

    fireEvent.click(screen.getByRole("button", { name: "Suggest username" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn't suggest a username. Please try again.",
    );
    expect(screen.getByRole("textbox", { name: "Username" }).getAttribute("aria-invalid")).toBe(
      "false",
    );
  });
});
