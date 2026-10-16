import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const hook = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock("#/features/webauthn/hooks/use-link-passkey", () => ({
  useLinkPasskey: () => hook.value,
}));

const { PasskeySettingsSection } = await import("./passkey-settings-section");

const ADDRESS = "0xabcdef1234567890abcdef1234567890abcdef12" as const;

function setHook(overrides: Record<string, unknown>) {
  hook.value = {
    state: { kind: "available" },
    step: "idle",
    busy: false,
    isPaperSession: true,
    isPasskeySession: false,
    supported: true,
    platformLabel: "Google",
    error: null,
    retryStatus: vi.fn(),
    link: vi.fn(),
    retryConnection: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => setHook({}));

function row() {
  return screen.getByRole("button", { name: /^passkey/i });
}

async function openSheet() {
  fireEvent.click(row());
  return within(await screen.findByRole("dialog", { name: "Passkey" }));
}

describe("PasskeySettingsSection", () => {
  it("offers a 44px primary link action to a paper-wallet session, naming the platform prompt", async () => {
    render(<PasskeySettingsSection address={ADDRESS} isSigningOut={false} />);
    expect(row().textContent).toContain("Not linked");
    expect(screen.queryByText("Link your passkey (Google)")).toBeNull();

    const sheet = await openSheet();
    expect(sheet.getByText("Link your passkey (Google)")).toBeTruthy();
    expect(sheet.queryByText(/paper wallet card/i)).toBeNull();
    const button = sheet.getByRole("button", { name: /link a passkey/i });
    expect(button.className).toContain("h-11");
    expect(button.dataset.variant).toBe("default");
    fireEvent.click(button);
    expect(hook.value.link).toHaveBeenCalledTimes(1);
  });

  it("disables linking while signing out", async () => {
    render(<PasskeySettingsSection address={ADDRESS} isSigningOut />);
    const sheet = await openSheet();
    expect(
      (sheet.getByRole("button", { name: /link a passkey/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("explains unsupported browsers without offering the action", async () => {
    setHook({ supported: false });
    render(<PasskeySettingsSection address={ADDRESS} isSigningOut={false} />);
    const sheet = await openSheet();
    expect(sheet.queryByRole("button", { name: /link a passkey/i })).toBeNull();
    expect(sheet.getByText(/safari or chrome on iphone/i)).toBeTruthy();
  });

  it("shows account-level linked status for a passkey on another device", async () => {
    setHook({ state: { kind: "linked-elsewhere" } });
    render(<PasskeySettingsSection address={ADDRESS} isSigningOut={false} />);
    expect(screen.getByText("Linked").className).toContain("text-primary");
    const sheet = await openSheet();
    expect(sheet.getByText(/not on this device/i)).toBeTruthy();
    expect(sheet.getByText(/adding another passkey is not available yet/i)).toBeTruthy();
    expect(sheet.queryByRole("button", { name: /link a passkey/i })).toBeNull();
  });

  it("shows confirming, not linked, while the registration is pending", async () => {
    setHook({ state: { kind: "pending", trackingId: "t-1" } });
    render(<PasskeySettingsSection address={ADDRESS} isSigningOut={false} />);
    expect(row().textContent).toContain("Confirming");
    expect(screen.queryByText("Linked")).toBeNull();
    const sheet = await openSheet();
    expect(sheet.getByText(/this can take a minute/i)).toBeTruthy();
    expect(sheet.queryByRole("button")).toBeNull();
  });

  it("offers a retry rather than 'not linked' when status cannot be read", async () => {
    setHook({ state: { kind: "unavailable" } });
    render(<PasskeySettingsSection address={ADDRESS} isSigningOut={false} />);
    expect(screen.queryByText("Not linked")).toBeNull();
    const sheet = await openSheet();
    fireEvent.click(sheet.getByRole("button", { name: /try again/i }));
    expect(hook.value.retryStatus).toHaveBeenCalledTimes(1);
  });

  it("offers Retry connection, not another registration, after a failed switch", async () => {
    setHook({
      state: { kind: "linked-here", credentialId: "cred-1" },
      error: { kind: "connection-failed", message: "boom" },
    });
    render(<PasskeySettingsSection address={ADDRESS} isSigningOut={false} />);
    const sheet = await openSheet();
    expect(sheet.getByRole("alert").textContent).toMatch(/could not switch to it/i);
    expect(sheet.queryByRole("button", { name: /link a passkey/i })).toBeNull();
    fireEvent.click(sheet.getByRole("button", { name: /retry connection/i }));
    expect(hook.value.retryConnection).toHaveBeenCalledTimes(1);
  });

  it("narrates the step in progress and blocks a second tap", async () => {
    setHook({ busy: true, step: "confirming" });
    render(<PasskeySettingsSection address={ADDRESS} isSigningOut={false} />);
    const sheet = await openSheet();
    expect(sheet.getByText(/confirming your passkey on the network/i)).toBeTruthy();
    expect(
      (sheet.getByRole("button", { name: /linking passkey/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("keeps the row static while the status loads", () => {
    setHook({ state: { kind: "loading" } });
    render(<PasskeySettingsSection address={ADDRESS} isSigningOut={false} />);
    expect(screen.getByText("Checking…")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps the row static for a passkey linked here in a passkey session", () => {
    setHook({
      state: { kind: "linked-here", credentialId: "cred-1" },
      isPaperSession: false,
      isPasskeySession: true,
    });
    render(<PasskeySettingsSection address={ADDRESS} isSigningOut={false} />);
    expect(screen.getByText("Linked").className).toContain("text-primary");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("closes the sheet once linking leaves nothing more to show", async () => {
    const { rerender } = render(<PasskeySettingsSection address={ADDRESS} isSigningOut={false} />);
    await openSheet();
    setHook({
      state: { kind: "linked-here", credentialId: "cred-1" },
      isPaperSession: false,
      isPasskeySession: true,
    });
    rerender(<PasskeySettingsSection address={ADDRESS} isSigningOut={false} />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
