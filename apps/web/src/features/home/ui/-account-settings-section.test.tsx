import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { account } = vi.hoisted(() => ({
  account: { address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as string | undefined },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: account.address }),
}));

import { AccountSettingsSection } from "./account-settings-section";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function mockProfile(profile: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "",
        text: () =>
          Promise.resolve(
            JSON.stringify({
              ok: true,
              result: {
                address: account.address,
                name: "Alice",
                email: "alice@example.com",
                phone: "+254712345678",
                country: "KE",
                createdAt: "2026-07-01T12:20:29Z",
                ...profile,
              },
            }),
          ),
      }),
    ),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AccountSettingsSection", () => {
  it("links to the profile edit route", () => {
    mockProfile({});
    const { container } = renderWithQueryClient(<AccountSettingsSection />);
    expect(container.querySelector("a")?.getAttribute("to")).toBe("/settings/profile");
  });

  it("shows the name and phone number", async () => {
    mockProfile({});
    renderWithQueryClient(<AccountSettingsSection />);
    expect(await screen.findByText("Alice")).toBeTruthy();
    expect(screen.getByText("+254712345678")).toBeTruthy();
  });

  it("hides a placeholder email and prompts for contact details", async () => {
    mockProfile({ phone: "", email: "pending+abc@clc.local" });
    renderWithQueryClient(<AccountSettingsSection />);
    expect(await screen.findByText(/add your contact details/i)).toBeTruthy();
  });
});
