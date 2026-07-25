import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { account, historyBack, navigate, toastSuccess } = vi.hoisted(() => ({
  account: { address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as string | undefined },
  historyBack: vi.fn(),
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ history: { back: historyBack } }),
  useCanGoBack: () => true,
  useNavigate: () => navigate,
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: account.address }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: toastSuccess },
}));

import { ProfileEditPage } from "./profile-edit-page";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function profilePayload(overrides: Record<string, unknown> = {}) {
  return {
    address: account.address,
    name: "Alice",
    email: "alice@example.com",
    phone: "+254712345678",
    country: "KE",
    createdAt: "2026-07-01T12:20:29Z",
    ...overrides,
  };
}

function mockBackend(profile: Record<string, unknown> = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (url.includes("/auth/profile")) {
      return Promise.resolve(jsonResponse(profilePayload(profile)));
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function jsonResponse(result: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify({ ok: true, result })),
  };
}

afterEach(() => {
  account.address = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";
  historyBack.mockReset();
  navigate.mockReset();
  toastSuccess.mockReset();
  vi.restoreAllMocks();
});

describe("ProfileEditPage", () => {
  it("prefills the form from the loaded profile", async () => {
    mockBackend();

    renderWithQueryClient(<ProfileEditPage />);

    expect(await screen.findByDisplayValue("Alice")).toBeTruthy();
    expect(screen.getByDisplayValue("alice@example.com")).toBeTruthy();
    const phone = screen.getByLabelText(/phone number/i) as HTMLInputElement;
    expect(phone.value.replace(/\s/g, "")).toContain("712345678");
  });

  it("starts the email field blank when the profile has a placeholder email", async () => {
    mockBackend({ email: "pending+abc@clc.local" });

    renderWithQueryClient(<ProfileEditPage />);

    const email = (await screen.findByLabelText(/^email$/i)) as HTMLInputElement;
    expect(email.value).toBe("");
  });

  it("saves edited fields, shows a toast, and navigates back", async () => {
    const fetchMock = mockBackend();

    renderWithQueryClient(<ProfileEditPage />);

    const name = (await screen.findByLabelText(/^name$/i)) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Alice Cooper" } });

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());

    const postCall = fetchMock.mock.calls.find(
      ([input, init]) => requestUrl(input).includes("/auth/profile") && init?.method === "POST",
    );
    expect(postCall).toBeTruthy();
    expect(JSON.parse(postCall?.[1]?.body as string)).toMatchObject({
      name: "Alice Cooper",
      email: "alice@example.com",
      phone: "+254712345678",
      country: "KE",
    });
    expect(historyBack).toHaveBeenCalledTimes(1);
  });
});
