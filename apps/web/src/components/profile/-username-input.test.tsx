import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const getAvailability = vi.hoisted(() => vi.fn());

vi.mock("#/lib/api/identity", () => ({
  identityClient: { getAvailability },
}));

import { UsernameInput } from "./username-input";

function TestInput({
  error,
  owned,
  initial = "",
}: {
  error?: string;
  owned?: string;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <UsernameInput
      id="username"
      value={value}
      owned={owned}
      onChange={setValue}
      onBlur={vi.fn()}
      error={error}
    />
  );
}

function usernameInput() {
  return screen.getByRole("textbox", { name: "Username" }) as HTMLInputElement;
}

afterEach(() => {
  getAvailability.mockReset();
});

describe("UsernameInput", () => {
  it("supports manual entry and connects its validation error", () => {
    getAvailability.mockResolvedValue({ username: { available: true } });
    render(<TestInput error="Use 80 characters or fewer" />);

    fireEvent.change(usernameInput(), { target: { value: "alice-2" } });

    expect(usernameInput().value).toBe("alice-2");
    expect(usernameInput().getAttribute("aria-invalid")).toBe("true");
    expect(usernameInput().getAttribute("aria-describedby")).toBe("username-error");
    expect(screen.getByRole("alert").textContent).toBe("Use 80 characters or fewer");
    expect(screen.queryByRole("button", { name: "Suggest username" })).toBeNull();
  });

  it("spins inside the input while a typed name is being checked", async () => {
    let resolveLookup: ((value: { username: { available: boolean } }) => void) | undefined;
    getAvailability.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLookup = resolve;
        }),
    );
    render(<TestInput />);

    fireEvent.change(usernameInput(), { target: { value: "alice" } });

    expect(usernameInput().getAttribute("aria-busy")).toBe("true");
    expect(usernameInput().parentElement?.querySelector("[data-slot='spinner']")).toBeTruthy();

    await waitFor(() => expect(getAvailability).toHaveBeenCalled());
    resolveLookup?.({ username: { available: true } });

    await waitFor(() => expect(usernameInput().hasAttribute("aria-busy")).toBe(false));
    expect(getAvailability).toHaveBeenCalledWith(
      { username: "alice" },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports a taken name once the lookup settles", async () => {
    getAvailability.mockResolvedValue({ username: { available: false } });
    render(<TestInput />);

    fireEvent.change(usernameInput(), { target: { value: "  Aude-Péronne " } });

    expect((await screen.findByRole("alert")).textContent).toBe("That username is already taken");
    expect(usernameInput().getAttribute("aria-invalid")).toBe("true");
    expect(getAvailability).toHaveBeenCalledWith(
      { username: "Aude-Péronne" },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("does not check a blank name or the one the account already holds", async () => {
    render(<TestInput owned="alice" initial="alice" />);

    fireEvent.change(usernameInput(), { target: { value: "   " } });
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(getAvailability).not.toHaveBeenCalled();
    expect(usernameInput().hasAttribute("aria-busy")).toBe(false);
  });

  it("drops a taken result that belongs to a name the user already replaced", async () => {
    const lookups: Array<(value: { username: { available: boolean } }) => void> = [];
    getAvailability.mockImplementation(
      () =>
        new Promise((resolve) => {
          lookups.push(resolve);
        }),
    );
    render(<TestInput />);
    const input = usernameInput();

    fireEvent.change(input, { target: { value: "alice" } });
    await waitFor(() => expect(getAvailability).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: "bob" } });
    lookups[0]?.({ username: { available: false } });
    await waitFor(() => expect(getAvailability).toHaveBeenCalledTimes(2));
    lookups[1]?.({ username: { available: true } });

    await waitFor(() => expect(input.hasAttribute("aria-busy")).toBe(false));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(input.value).toBe("bob");
  });

  it("leaves the field usable when the lookup fails", async () => {
    getAvailability.mockRejectedValue(new Error("offline"));
    render(<TestInput />);

    fireEvent.change(usernameInput(), { target: { value: "alice" } });

    await waitFor(() => expect(usernameInput().hasAttribute("aria-busy")).toBe(false));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(usernameInput().getAttribute("aria-invalid")).toBe("false");
  });
});
