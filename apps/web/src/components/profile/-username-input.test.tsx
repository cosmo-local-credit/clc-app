import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const suggest = vi.hoisted(() => vi.fn());

vi.mock("#/lib/api/recipients", () => ({
  recipientsClient: { suggest },
}));

import { UsernameInput } from "./username-input";

function TestInput({
  error,
  initialName = "",
  initialUsername = "",
}: {
  error?: string;
  initialName?: string;
  initialUsername?: string;
}) {
  const [name, setName] = useState(initialName);
  const [username, setUsername] = useState(initialUsername);
  return (
    <>
      <label htmlFor="display-name">Name</label>
      <input id="display-name" value={name} onChange={(event) => setName(event.target.value)} />
      <UsernameInput
        id="username"
        name={name}
        value={username}
        onChange={setUsername}
        onBlur={vi.fn()}
        error={error}
      />
    </>
  );
}

function usernameField() {
  return screen.getByRole("textbox", { name: "Username" }) as HTMLInputElement;
}

afterEach(() => {
  suggest.mockReset();
});

describe("UsernameInput", () => {
  it("supports a typed handle and connects its validation error", () => {
    render(<TestInput error="Use 80 characters or fewer" />);

    fireEvent.change(usernameField(), { target: { value: "alice-2" } });

    expect(usernameField().value).toBe("alice-2");
    expect(usernameField().getAttribute("aria-invalid")).toBe("true");
    expect(usernameField().getAttribute("aria-describedby")).toBe("username-error");
    expect(screen.getByRole("alert").textContent).toBe("Use 80 characters or fewer");
    expect(screen.queryByRole("button", { name: "Suggest username" })).toBeNull();
    expect(suggest).not.toHaveBeenCalled();
  });

  it("fills a handle from the name being typed and spins while that lookup runs", async () => {
    let resolveSuggestion: ((value: string) => void) | undefined;
    suggest.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveSuggestion = resolve;
        }),
    );
    render(<TestInput />);

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Alice Example" },
    });

    expect(usernameField().getAttribute("aria-busy")).toBe("true");
    expect(usernameField().parentElement?.querySelector("[data-slot='spinner']")).toBeTruthy();

    await waitFor(() =>
      expect(suggest).toHaveBeenCalledWith("alice-example", expect.any(AbortSignal)),
    );
    resolveSuggestion?.("alice-example");

    await waitFor(() => expect(usernameField().value).toBe("alice-example"));
    expect(usernameField().hasAttribute("aria-busy")).toBe(false);
  });

  it("asks for a lowercase, dashed handle whatever the spacing of the name", async () => {
    suggest.mockResolvedValue("mary-jane-o'neil");
    render(<TestInput />);

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "  Mary  Jane\tO'Neil " },
    });

    await waitFor(() =>
      expect(suggest).toHaveBeenCalledWith("mary-jane-o'neil", expect.any(AbortSignal)),
    );
    await waitFor(() => expect(usernameField().value).toBe("mary-jane-o'neil"));
  });

  it("replaces its own suggestion when the name is typed further", async () => {
    suggest.mockResolvedValueOnce("alice").mockResolvedValueOnce("alice-example");
    render(<TestInput />);

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Alice" },
    });
    await waitFor(() => expect(usernameField().value).toBe("alice"));

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Alice Example" },
    });

    await waitFor(() => expect(usernameField().value).toBe("alice-example"));
    expect(suggest).toHaveBeenNthCalledWith(1, "alice", expect.any(AbortSignal));
    expect(suggest).toHaveBeenNthCalledWith(2, "alice-example", expect.any(AbortSignal));
  });

  it("keeps a handle the user typed, including over a suggestion still in flight", async () => {
    let resolveSuggestion: ((value: string) => void) | undefined;
    suggest.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveSuggestion = resolve;
        }),
    );
    render(<TestInput />);

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Alice" },
    });
    await waitFor(() => expect(suggest).toHaveBeenCalled());
    fireEvent.change(usernameField(), { target: { value: "custom-name" } });
    resolveSuggestion?.("alice1");

    await waitFor(() => expect(usernameField().hasAttribute("aria-busy")).toBe(false));
    expect(usernameField().value).toBe("custom-name");
  });

  it("does not replace a handle the user already chose when the name changes", async () => {
    suggest.mockResolvedValue("bob");
    render(<TestInput initialUsername="custom-name" />);

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Bob" },
    });
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(suggest).not.toHaveBeenCalled();
    expect(usernameField().value).toBe("custom-name");
  });

  it("leaves the field empty when a suggestion cannot be looked up", async () => {
    suggest.mockRejectedValue(new Error("offline"));
    render(<TestInput />);

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Alice" },
    });

    await waitFor(() => expect(usernameField().hasAttribute("aria-busy")).toBe(false));
    expect(usernameField().value).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
