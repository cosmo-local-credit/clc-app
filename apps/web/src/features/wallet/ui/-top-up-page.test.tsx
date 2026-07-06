import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { account } = vi.hoisted(() => ({
  account: { address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as string | undefined },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => false,
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: account.address }),
}));

import { TopUpPage } from "./top-up-page";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function mockProfile(phone: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
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
              phone,
              country: "KE",
              createdAt: "2026-07-01T12:20:29Z",
            },
          }),
        ),
    }),
  );
}

afterEach(() => {
  account.address = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";
  vi.restoreAllMocks();
});

describe("TopUpPage", () => {
  it("shows the Cash page shell with add, withdraw, and Pretium history sections", async () => {
    mockProfile("+254712345678");

    renderWithQueryClient(<TopUpPage />);

    expect(await screen.findByRole("heading", { name: "Cash" })).toBeTruthy();
    expect(screen.getByText("Buy or sell stables with local money.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Add stables" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Withdraw" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pretium history" })).toBeTruthy();
    expect(screen.getByText("No cash activity yet.")).toBeTruthy();
  });

  it("shows the user's Kenyan M-PESA number and a 20 KES amount", async () => {
    mockProfile("+254712345678");

    renderWithQueryClient(<TopUpPage />);

    expect(await screen.findByDisplayValue("+254712345678")).toBeTruthy();
    expect(screen.getByText("KES")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: /amount/i }) as HTMLInputElement).value).toBe("20");
    expect(screen.getByRole("button", { name: /continue/i }).hasAttribute("disabled")).toBe(false);
  });

  it("disables cash entry for a non-Kenyan phone number", async () => {
    mockProfile("+12133734253");

    renderWithQueryClient(<TopUpPage />);

    expect(
      await screen.findByText("M-PESA cash services need a Kenyan phone number."),
    ).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /amount/i }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /continue/i }).hasAttribute("disabled")).toBe(true);
  });

  it("disables cash entry when the profile has no phone number", async () => {
    mockProfile("");

    renderWithQueryClient(<TopUpPage />);

    expect(
      await screen.findByText("Add a phone number to your profile to use M-PESA."),
    ).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /amount/i }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /continue/i }).hasAttribute("disabled")).toBe(true);
  });
});
