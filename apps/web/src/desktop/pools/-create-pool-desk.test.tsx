import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { getNameAvailability, getTakenSymbols, navigateMock } = vi.hoisted(() => ({
  getNameAvailability: vi.fn(),
  getTakenSymbols: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: ReactNode;
    to: string;
    params?: { step: string };
  }) => <a href={params ? to.replace("$step", params.step) : to}>{children}</a>,
  useCanGoBack: () => false,
  useNavigate: () => navigateMock,
  useRouter: () => ({
    history: {
      location: { state: { __TSR_index: 1 } },
      go: vi.fn(),
      flush: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      block: vi.fn(() => vi.fn()),
    },
  }),
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({
    address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
    chainId: 42220,
  }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

type Quota = { used: number; limit: number; canCreate: boolean; unlimited: boolean };
const usage = vi.hoisted(() => ({
  pools: { used: 2, limit: 10, canCreate: true, unlimited: false } as Quota,
}));
vi.mock("#/hooks/use-resource-usage", () => ({
  useResourceUsage: () => ({
    data: { pools: usage.pools },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("#/lib/api/symbols", () => ({ symbolsClient: { getTakenSymbols } }));
vi.mock("#/lib/api/names", () => ({ namesClient: { getNameAvailability } }));
vi.mock("#/lib/navigation/pool-create-history", () => ({
  beginPoolCreateHistory: vi.fn(),
  exitPoolCreateHistory: vi.fn(),
}));
vi.mock("#/features/pools/hooks/use-pool-deployment", () => ({
  useDeployPool: () => ({ error: null, isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock("#/features/auth/hooks/use-profile", () => ({ useAuthProfile: () => ({ data: null }) }));
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: false }));
vi.mock("#/hooks/use-deployment", () => ({
  useTokenTags: () => ({ data: [], isError: false, isPending: false, refetch: vi.fn() }),
}));
vi.mock("#/components/ui/location-picker", () => ({ LocationPicker: () => <div /> }));
vi.mock("#/components/ui/markdown-editor", () => ({ MarkdownEditor: () => <div /> }));
// The fee recipient resolves usernames and phones; this suite is about the form's shape.
vi.mock("#/desktop/wallet/send-recipient-field", () => ({
  SendRecipientField: ({ id }: { id: string }) => <input id={id} aria-label="Fee recipient" />,
}));

import { usePoolCreateDraft } from "#/features/pools/state/pool-create-draft";

import { CreatePoolDesk } from "./create-pool-desk";

function renderDesk(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

const advanced = () => screen.getByText("Advanced").closest("details") as HTMLDetailsElement;

beforeEach(() => {
  usage.pools = { used: 2, limit: 10, canCreate: true, unlimited: false };
  getTakenSymbols.mockImplementation(async (kind: string, prefix: string) => ({
    kind,
    prefix,
    taken: [],
  }));
  getNameAvailability.mockImplementation(async (kind: string, name: string) => ({
    kind,
    name,
    available: true,
  }));
});

afterEach(() => {
  vi.clearAllMocks();
  usePoolCreateDraft.getState().clearDraft();
});

/** The tracks of a `grid-cols-[a_b_c]` class: each track's minimum, in px. */
function trackMinimums(className: string, variant: string) {
  const token = className.split(/\s+/).find((entry) => entry.startsWith(`${variant}:grid-cols-[`));
  if (!token) return null;
  return [...token.matchAll(/minmax\((\d+)px,/g)].map((match) => Number(match[1]));
}

describe("CreatePoolDesk layout", () => {
  it("keeps the preview in the page at every step", () => {
    const { rerender } = renderDesk(<CreatePoolDesk step="pool" />);
    for (const step of ["pool", "place", "review"] as const) {
      rerender(<CreatePoolDesk step={step} />);
      const preview = screen.getByRole("complementary", { name: "Preview" });
      expect(within(preview).getByText("Preview · Pools")).toBeTruthy();
    }
  });

  it("shows what is typed in the preview", () => {
    renderDesk(<CreatePoolDesk step="pool" />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Kilifi Traders" } });
    const preview = screen.getByRole("complementary", { name: "Preview" });
    expect(within(preview).getByText("Kilifi Traders")).toBeTruthy();
  });

  it("puts the preview beside the form only when 240px stay free for it", () => {
    const { container } = renderDesk(<CreatePoolDesk step="pool" />);
    const canvas = container.firstElementChild as HTMLElement;
    const className = canvas.className;

    // Under 43rem everything is one column: the preview follows the form.
    expect(className).toContain("grid-cols-1");
    const sideStepper = trackMinimums(className, "@min-[43rem]");
    expect(sideStepper).toEqual([160, 440]);
    // The third track opens only at 62rem, and its minimums have to fit by then.
    const threeColumn = trackMinimums(className, "@min-[62rem]");
    expect(threeColumn).toEqual([160, 440, 240]);
    const gutters = 2 * 32;
    const gaps = 2 * 32;
    const needed = threeColumn!.reduce((sum, width) => sum + width, 0) + gaps + gutters;
    expect(needed).toBeLessThanOrEqual(62 * 16);

    // The form keeps its 440-560px width before the preview gets anything.
    expect(className).toContain("minmax(440px,560px)");
  });

  it("names one list of steps and links the ones already done", () => {
    renderDesk(<CreatePoolDesk step="review" />);
    const steps = screen.getByRole("list", { name: "Create pool" });
    const items = within(steps).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[2]?.getAttribute("aria-current")).toBe("step");
    expect(within(items[0]!).getByRole("link").getAttribute("href")).toBe("/pools/create/pool");
    expect(within(items[1]!).getByRole("link").getAttribute("href")).toBe("/pools/create/place");
    expect(within(items[2]!).queryByRole("link")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Confirm and publish");
  });

  it("keeps the step's actions in a footer that sticks to the canvas", () => {
    renderDesk(<CreatePoolDesk step="pool" />);
    const foot = screen.getByRole("button", { name: "Next" }).parentElement as HTMLElement;
    expect(foot.className).toContain("sticky");
    expect(foot.className).toContain("bottom-0");
  });
});

describe("CreatePoolDesk help", () => {
  it("offers 'What's a pool?' on request in the first step only", () => {
    const { rerender } = renderDesk(<CreatePoolDesk step="pool" />);
    expect(screen.getByRole("button", { name: "What's a pool?" })).toBeTruthy();
    expect(screen.queryByText(/A pool holds vouchers together/)).toBeNull();

    rerender(<CreatePoolDesk step="place" />);
    expect(screen.queryByRole("button", { name: "What's a pool?" })).toBeNull();
    rerender(<CreatePoolDesk step="review" />);
    expect(screen.queryByRole("button", { name: "What's a pool?" })).toBeNull();
    expect(screen.queryByText("What's a pool?")).toBeNull();
  });

  it("explains the concept when asked", async () => {
    renderDesk(<CreatePoolDesk step="pool" />);
    fireEvent.click(screen.getByRole("button", { name: "What's a pool?" }));
    expect(await screen.findByText(/A pool holds vouchers together/)).toBeTruthy();
  });
});

describe("CreatePoolDesk Advanced", () => {
  it("starts closed and says what it holds", () => {
    renderDesk(<CreatePoolDesk step="pool" />);
    expect(advanced().open).toBe(false);
    const summary = advanced().querySelector("summary") as HTMLElement;
    expect(summary.textContent).toContain("Relative pricing");
    expect(summary.textContent).toContain("Swap fee");
    expect(summary.textContent).toContain("0%");
  });

  it("keeps the pricing choices and what they mean once opened", () => {
    renderDesk(<CreatePoolDesk step="pool" />);
    fireEvent.click(screen.getByText("Advanced"));
    expect(advanced().open).toBe(true);
    expect(screen.getByLabelText("Symbol")).toBeTruthy();
    expect(screen.getByText("Uses voucher rates set for this pool")).toBeTruthy();
    expect(screen.getByText("Vouchers swap one for one")).toBeTruthy();
    expect(screen.getByLabelText("Swap fee (%)")).toBeTruthy();
  });

  it("opens for a restored draft", () => {
    usePoolCreateDraft.getState().setDraft({
      name: "Kilifi Traders",
      symbol: "KIL",
      unitOfAccount: "KES",
      description: "A pool for Kilifi traders.",
      pricing: "relative",
      feePolicyDefault: "0",
      feesDecoupled: false,
      feeAddress: "",
      location: { locationName: "Kilifi, Kenya", country: "KE", lat: -3.5, lng: 39.9 },
      tags: [],
      email: "",
      website: "",
      phone: "",
      terms: "",
      imageUrl: "",
    } as never);
    renderDesk(<CreatePoolDesk step="pool" />);
    expect(advanced().open).toBe(true);
  });

  it("opens when Next is refused for a field inside it", async () => {
    renderDesk(<CreatePoolDesk step="pool" />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Kilifi Traders" } });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "A pool for Kilifi traders to swap." },
    });
    fireEvent.click(screen.getByText("Advanced"));
    fireEvent.change(screen.getByLabelText("Swap fee (%)"), { target: { value: "250" } });
    // Fold it again: the bad value is out of sight, as it would be after a long form.
    fireEvent.click(screen.getByText("Advanced"));
    await waitFor(() => expect(advanced().open).toBe(false));

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(advanced().open).toBe(true));
    expect(navigateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ params: { step: "place" } }),
    );
  });

  it("opens on arrival when a value in it is not the default", async () => {
    const { rerender } = renderDesk(<CreatePoolDesk step="pool" />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Kilifi Traders" } });
    fireEvent.click(screen.getByText("Advanced"));
    fireEvent.change(screen.getByLabelText("Swap fee (%)"), { target: { value: "2" } });
    fireEvent.click(screen.getByText("Advanced"));
    await waitFor(() => expect(advanced().open).toBe(false));

    // Away to the next step and back by its link.
    rerender(<CreatePoolDesk step="place" />);
    rerender(<CreatePoolDesk step="pool" />);
    await waitFor(() => expect(advanced().open).toBe(true));
    expect((screen.getByLabelText("Swap fee (%)") as HTMLInputElement).value).toBe("2");
  });

  it("explains the fee recipient in one short line", () => {
    renderDesk(<CreatePoolDesk step="pool" />);
    fireEvent.click(screen.getByText("Advanced"));
    fireEvent.change(screen.getByLabelText("Swap fee (%)"), { target: { value: "1" } });
    expect(screen.getByText("Defaults to your wallet.")).toBeTruthy();
    expect(screen.queryByText(/Enter another address/)).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Take fees separately" })).toBeTruthy();
  });
});

describe("CreatePoolDesk usage", () => {
  it("draws a determinate meter for a finite allowance", () => {
    renderDesk(<CreatePoolDesk step="pool" />);
    expect(screen.getByText("2 of 10 used")).toBeTruthy();
    const meter = screen.getByRole("progressbar");
    expect(meter.getAttribute("aria-valuenow")).toBe("2");
    expect(meter.getAttribute("aria-valuemax")).toBe("10");
  });

  it("is plain metadata for an unlimited allowance", () => {
    usage.pools = { used: 3, limit: 0, canCreate: true, unlimited: true };
    renderDesk(<CreatePoolDesk step="pool" />);
    expect(screen.getByText("3 used · Unlimited")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("draws nothing for an unlimited allowance with nothing used", () => {
    usage.pools = { used: 0, limit: 0, canCreate: true, unlimited: true };
    renderDesk(<CreatePoolDesk step="pool" />);
    expect(screen.getByText("0 used · Unlimited")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("says 'Limit reached' once, without the boilerplate", () => {
    usage.pools = { used: 10, limit: 10, canCreate: false, unlimited: false };
    renderDesk(<CreatePoolDesk step="pool" />);
    expect(screen.getAllByText("Limit reached")).toHaveLength(1);
    expect(screen.queryByText(/Ask an administrator/)).toBeNull();
    expect(screen.getByText("10 of 10 used")).toBeTruthy();
  });
});

describe("CreatePoolDesk review", () => {
  it("lets the fee recipient be read in full and copied before publishing", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const recipient = "0x2b4E18f7329bb8b533E5Be0D8B176eE1ed735aaa";
    usePoolCreateDraft.getState().setDraft({
      name: "Kilifi Traders",
      symbol: "KIL",
      unitOfAccount: "KES",
      description: "A pool for Kilifi traders.",
      pricing: "relative",
      feePolicyDefault: "1",
      feesDecoupled: false,
      feeAddress: recipient,
      location: { locationName: "Kilifi, Kenya", country: "KE", lat: -3.5, lng: 39.9 },
      tags: [],
      email: "",
      website: "",
      phone: "",
      terms: "",
      imageUrl: "",
    } as never);
    renderDesk(<CreatePoolDesk step="review" />);

    expect(screen.queryByText(recipient, { exact: false })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show full" }));
    expect(screen.getByText(recipient.slice(6, -5), { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy fee recipient" }));
    expect(writeText).toHaveBeenCalledWith(recipient);
  });
});
