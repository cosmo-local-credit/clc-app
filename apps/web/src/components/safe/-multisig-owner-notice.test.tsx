import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { MultisigOwnerNotice } from "./multisig-owner-notice";

vi.mock("#/lib/safe-config", () => ({ SAFE_APP_PREFIX: "gno" }));
const owner = "0x1111111111111111111111111111111111111111";
const signers = [
  "0x00000000000000000000000000000000000000a1",
  "0x00000000000000000000000000000000000000a2",
] as const;

describe("public multisig ownership", () => {
  it("shows quorum and dashboard without an authenticated session", () => {
    const { container } = render(
      <MultisigOwnerNotice info={{ kind: "safe", owner, signers: [...signers], threshold: 2 }} />,
    );
    // A paragraph would take the base body size instead of the caption size.
    expect(container.querySelector("p")).toBeNull();
    expect(screen.getByText("Multisig owned · 2 of 2 signers")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open in Safe" }).getAttribute("href")).toContain(
      `gno:${owner}`,
    );
  });
  it("does not invent a threshold for a partially compatible multisig", () => {
    render(
      <MultisigOwnerNotice
        info={{ kind: "safe", owner, signers: [...signers], threshold: null }}
      />,
    );
    expect(screen.getByText("Multisig owned · 2 signers")).toBeTruthy();
  });
  it("does not label an ordinary account as a multisig", () => {
    const { container } = render(<MultisigOwnerNotice info={{ kind: "eoa", owner }} />);
    expect(container.textContent).toBe("");
  });
});
