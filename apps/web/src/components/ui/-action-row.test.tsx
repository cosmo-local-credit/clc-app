import { fireEvent, render, screen } from "@testing-library/react";
import { RiLogoutBoxRLine } from "react-icons/ri";
import { describe, expect, it, vi } from "vite-plus/test";

import { ActionRow } from "./action-row";

describe("ActionRow busy", () => {
  it("puts the Spinner in the icon slot and cannot be started twice", () => {
    const onClick = vi.fn();
    render(
      <ActionRow
        icon={<RiLogoutBoxRLine data-testid="row-icon" aria-hidden="true" />}
        label="Signing out…"
        busy
        onClick={onClick}
      />,
    );
    const row = screen.getByRole("button", { name: "Signing out…" }) as HTMLButtonElement;

    expect(row.querySelector("[data-slot=spinner]")).not.toBeNull();
    expect(screen.queryByTestId("row-icon")).toBeNull();
    expect(row.getAttribute("aria-busy")).toBe("true");
    expect(row.disabled).toBe(true);
    fireEvent.click(row);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows its own icon and acts when not busy", () => {
    const onClick = vi.fn();
    render(
      <ActionRow
        icon={<RiLogoutBoxRLine data-testid="row-icon" aria-hidden="true" />}
        label="Sign out"
        onClick={onClick}
      />,
    );
    const row = screen.getByRole("button", { name: "Sign out" });

    expect(row.querySelector("[data-slot=spinner]")).toBeNull();
    expect(screen.getByTestId("row-icon")).toBeTruthy();
    expect(row.hasAttribute("aria-busy")).toBe(false);
    fireEvent.click(row);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
