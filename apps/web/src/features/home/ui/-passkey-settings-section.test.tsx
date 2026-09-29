import { fireEvent, render, screen } from "@testing-library/react";
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

describe("PasskeySettingsSection", () => {
  it("offers a 44px link action to a paper-wallet session and keeps the paper card visible", () => {
    render(<PasskeySettingsSection address={ADDRESS} isSigningOut={false} />);
    expect(screen.getByRole("heading", { name: /sign-in methods/i })).toBeTruthy();
    expect(screen.getByText(/paper wallet card/i)).toBeTruthy();
    const button = screen.getByRole("button", { name: /link a passkey/i });
    expect(button.className).toContain("h-11");
    fireEvent.click(button);
    expect(hook.value.link).toHaveBeenCalledTimes(1);
  });

  it("disables linking while signing out", () => {
    render(<PasskeySettingsSection address={ADDRESS} isSigningOut />);
    expect(
      (screen.getByRole("button", { name: /link a passkey/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("explains unsupported browsers without offering the action", () => {
    setHook({ supported: false });
    render(<PasskeySettingsSection address={ADDRESS} isSigningOut={false} />);
    expect(screen.queryByRole("button", { name: /link a passkey/i })).toBeNull();
    expect(screen.getByText(/safari or chrome on iphone/i)).toBeTruthy();
  });

  it("shows account-level linked status for a passkey on another device", () => {
    setHook({ state: { kind: "linked-elsewhere" } });
    render(<PasskeySettingsSection address={ADDRESS} isSigningOut={false} />);
    expect(screen.getByText("Linked")).toBeTruthy();
    expect(screen.getByText(/not on this device/i)).toBeTruthy();
    expect(screen.getByText(/adding another passkey is not available yet/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /link a passkey/i })).toBeNull();
  });

  it("shows confirming, not linked, while the registration is pending", () => {
    setHook({ state: { kind: "pending", trackingId: "t-1" } });
    render(<PasskeySettingsSection address={ADDRESS} isSigningOut={false} />);
    expect(screen.getByText("Confirming")).toBeTruthy();
    expect(screen.queryByText("Linked")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers a retry rather than 'not linked' when status cannot be read", () => {
    setHook({ state: { kind: "unavailable" } });
    render(<PasskeySettingsSection address={ADDRESS} isSigningOut={false} />);
    expect(screen.queryByText("Not linked")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(hook.value.retryStatus).toHaveBeenCalledTimes(1);
  });

  it("offers Retry connection, not another registration, after a failed switch", () => {
    setHook({
      state: { kind: "linked-here", credentialId: "cred-1" },
      error: { kind: "connection-failed", message: "boom" },
    });
    render(<PasskeySettingsSection address={ADDRESS} isSigningOut={false} />);
    expect(screen.getByRole("alert").textContent).toMatch(/could not switch to it/i);
    expect(screen.queryByRole("button", { name: /link a passkey/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /retry connection/i }));
    expect(hook.value.retryConnection).toHaveBeenCalledTimes(1);
  });

  it("narrates the step in progress and blocks a second tap", () => {
    setHook({ busy: true, step: "confirming" });
    render(<PasskeySettingsSection address={ADDRESS} isSigningOut={false} />);
    expect(screen.getByText(/confirming your passkey on the network/i)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /linking passkey/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
