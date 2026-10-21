import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const suggest = vi.hoisted(() => vi.fn());

vi.mock("#/lib/api/recipients", () => ({
  recipientsClient: { suggest },
}));

import { UsernameInput } from "./username-input";

function TestInput({ error, hint = "Alice Example" }: { error?: string; hint?: string }) {
  const [value, setValue] = useState("");
  return (
    <UsernameInput
      id="username"
      value={value}
      hint={() => hint}
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
  it("supports manual entry and connects its validation error", () => {
    render(<TestInput error="That username is unavailable" />);
    const input = screen.getByRole("textbox", { name: "Username" }) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "alice-2" } });

    expect(input.value).toBe("alice-2");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("username-error");
    expect(screen.getByRole("alert").textContent).toBe("That username is unavailable");
  });

  it("applies an automatic suggestion when the value has not changed", async () => {
    suggest.mockResolvedValue("alice-example");
    render(<TestInput />);

    const suggestButton = screen.getByRole("button", { name: "Suggest username" });
    // A 36px target at least, the height of the input above it.
    expect(suggestButton.className).toContain("h-9");
    fireEvent.click(suggestButton);

    await waitFor(() =>
      expect((screen.getByRole("textbox", { name: "Username" }) as HTMLInputElement).value).toBe(
        "alice-example",
      ),
    );
    expect(suggest).toHaveBeenCalledWith("alice-example");
  });

  it("asks for a lowercase, dashed name whatever the spacing of the hint", async () => {
    suggest.mockResolvedValue("mary-jane-o'neil");
    render(<TestInput hint={"  Mary  Jane\tO'Neil "} />);

    fireEvent.click(screen.getByRole("button", { name: "Suggest username" }));

    await waitFor(() => expect(suggest).toHaveBeenCalledWith("mary-jane-o'neil"));
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
