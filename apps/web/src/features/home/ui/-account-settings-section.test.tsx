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
  useConnection: () => ({ address: account.address }),
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
  it("holds a skeleton row while the profile loads, then links to the profile edit route", async () => {
    mockProfile({});
    const { container } = renderWithQueryClient(<AccountSettingsSection />);
    expect(container.querySelector("[aria-busy='true']")).toBeTruthy();
    expect(container.querySelector("a")).toBeNull();
    await screen.findByText("Alice");
    expect(container.querySelector("a")?.getAttribute("to")).toBe("/settings/profile");
  });

  it("shows the name and phone number", async () => {
    mockProfile({});
    renderWithQueryClient(<AccountSettingsSection />);
    expect(await screen.findByText("Alice")).toBeTruthy();
    expect(screen.getByText("+254712345678")).toBeTruthy();
  });

  it("isolates the contact line left-to-right so a phone number keeps its order in Arabic", async () => {
    mockProfile({});
    renderWithQueryClient(<AccountSettingsSection />);
    const phone = await screen.findByText("+254712345678");
    expect(phone.tagName).toBe("BDI");
    expect(phone.getAttribute("dir")).toBe("ltr");
  });

  it("isolates a real email when there is no phone", async () => {
    mockProfile({ phone: "" });
    renderWithQueryClient(<AccountSettingsSection />);
    const email = await screen.findByText("alice@example.com");
    expect(email.tagName).toBe("BDI");
    expect(email.getAttribute("dir")).toBe("ltr");
  });

  it("shows the username on its own line, apart from a name that may truncate", async () => {
    mockProfile({ name: "Alice Wanjiru Kamau Otieno", username: "alice" });
    renderWithQueryClient(<AccountSettingsSection />);
    expect(await screen.findByText("Alice Wanjiru Kamau Otieno")).toBeTruthy();
    const username = screen.getByText("alice");
    expect(username.tagName).toBe("BDI");
    expect(username.parentElement?.textContent).toBe("alice");
  });

  it("shows the profile photo in a round avatar", async () => {
    mockProfile({ avatarUrl: "https://images.example/profile/alice.webp" });
    const { container } = renderWithQueryClient(<AccountSettingsSection />);
    await screen.findByText("Alice");
    const photo = container.querySelector("img");
    expect(photo?.getAttribute("src")).toBe("https://images.example/profile/alice.webp");
    expect(photo?.parentElement?.className).toContain("rounded-full");
  });

  it("falls back to initials without a photo", async () => {
    mockProfile({ name: "Alice Wanjiru" });
    renderWithQueryClient(<AccountSettingsSection />);
    expect(await screen.findByText("AW")).toBeTruthy();
  });

  it("hides a placeholder email and prompts for contact details", async () => {
    mockProfile({ phone: "", email: "pending+abc@clc.local" });
    renderWithQueryClient(<AccountSettingsSection />);
    expect(await screen.findByText(/add your contact details/i)).toBeTruthy();
  });
});
