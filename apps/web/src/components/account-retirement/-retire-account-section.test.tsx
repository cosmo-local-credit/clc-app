import { BackendApiError } from "@clc/api/client/errors";
import type { SessionResult } from "@clc/api/features/auth/client";
import type { AccountRetirementPreview } from "@clc/core/features/account-retirement/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;

const { account, getSession, preview, retire } = vi.hoisted(() => ({
  account: {
    address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as `0x${string}`,
    chainId: 100,
    connector: { id: "test" },
    status: "connected" as const,
  },
  getSession: vi.fn(),
  preview: vi.fn(),
  retire: vi.fn(),
}));

vi.mock("wagmi", () => ({ useConnection: () => account }));
vi.mock("#/providers/auth-bootstrap", () => ({ useReconnectAttempted: () => true }));
vi.mock("#/lib/api/auth", () => ({ authClient: { getSession: () => getSession() } }));
vi.mock("#/lib/api/account-retirement", () => ({
  accountRetirementClient: { preview, retire },
}));

import { authSessionQueryKey } from "#/features/auth/hooks/use-auth-status";
import { RetireAccountSection } from "./retire-account-section";

const SESSION: SessionResult = { address: ADDRESS, chainId: 100, role: "USER" };
const PREVIEW: AccountRetirementPreview = {
  closesAt: "2027-05-11T10:00:00Z",
  recoveryMonths: 6,
  ownedResources: [
    {
      resourceType: "voucher",
      address: "0x00000000000000000000000000000000000000a1",
      name: "Seed Voucher",
      active: true,
    },
    {
      resourceType: "pool",
      address: "0x00000000000000000000000000000000000000b2",
      name: "Village Pool",
      active: true,
    },
  ],
  pendingResourceRequests: 2,
  hiddenContent: { wants: 3, catalogs: 1, posts: 4, reviews: 5 },
  balancesCoverage: "partial",
  balancesCoverageNote: "Balances are not summarised here.",
  pendingOperationsNote: "Pending transfers are not cancelled.",
};
const NEXT_STATE = {
  accountLifecycle: "RETIREMENT_SCHEDULED" as const,
  closesAt: PREVIEW.closesAt,
  capabilities: {
    canUseApp: false,
    canRecoverAssets: true,
    canTransferResources: true,
    canRestoreAccount: true,
  },
  retirement: null,
};

function renderSection(session: SessionResult = SESSION) {
  getSession.mockResolvedValue(session);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RetireAccountSection />
    </QueryClientProvider>,
  );
  return queryClient;
}

async function openSheet() {
  fireEvent.click(screen.getByRole("button", { name: "Retire account" }));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  getSession.mockReset();
  preview.mockReset().mockResolvedValue(PREVIEW);
  retire.mockReset().mockResolvedValue(NEXT_STATE);
});

describe("retire account entry", () => {
  it("shows a red section at the foot of the profile", () => {
    renderSection();
    expect(screen.getByRole("heading", { name: "Retire account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retire account" })).toBeTruthy();
  });

  it("is hidden from a superadmin", async () => {
    renderSection({ ...SESSION, role: "SUPERADMIN" });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Retire account" })).toBeNull(),
    );
  });

  it("shows what the server says retiring changes", async () => {
    renderSection();
    const sheet = await openSheet();

    await within(sheet).findByText(/Balances are not summarised here\./);
    expect(within(sheet).getByText("Pending transfers are not cancelled.")).toBeTruthy();
    expect(within(sheet).getByText("Seed Voucher")).toBeTruthy();
    expect(within(sheet).getByText("Village Pool")).toBeTruthy();
    expect(within(sheet).getByText(/Blockchain records\s+stay public/)).toBeTruthy();
    expect(within(sheet).getByText(/Erasure cannot be undone/)).toBeTruthy();
    expect(within(sheet).getByText(/2 retirement requests are still awaiting review/)).toBeTruthy();
    const time = sheet.querySelector("time");
    expect(time?.getAttribute("datetime")).toBe(PREVIEW.closesAt);
    for (const [label, count] of [
      ["Wants", "3"],
      ["Catalogs", "1"],
      ["Posts", "4"],
      ["Reviews", "5"],
    ]) {
      expect(within(screen.getByText(label!).closest("li")!).getByText(count!)).toBeTruthy();
    }
  });

  it("offers a retry when the summary cannot be loaded", async () => {
    preview.mockRejectedValueOnce(new Error("down"));
    renderSection();
    const sheet = await openSheet();
    await within(sheet).findByText("Could not check what retiring changes.");
    expect(
      within(sheet).getByRole("button", { name: "Confirm retirement" }).hasAttribute("disabled"),
    ).toBe(true);

    fireEvent.click(within(sheet).getByRole("button", { name: "Retry" }));

    await within(sheet).findByText("Seed Voucher");
  });
});

describe("retire account confirmation", () => {
  it("needs the acknowledgement and counts the optional reason", async () => {
    renderSection();
    const sheet = await openSheet();
    await within(sheet).findByText("Seed Voucher");
    const confirm = within(sheet).getByRole("button", { name: "Confirm retirement" });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    expect(within(sheet).getByText("0/2000")).toBeTruthy();

    fireEvent.change(within(sheet).getByLabelText(/Reason/), { target: { value: "moving away" } });
    expect(within(sheet).getByText("11/2000")).toBeTruthy();
    expect(confirm.hasAttribute("disabled")).toBe(true);

    fireEvent.click(within(sheet).getByRole("checkbox"));
    expect(confirm.hasAttribute("disabled")).toBe(false);
  });

  it("starts again from a blank form after Cancel", async () => {
    renderSection();
    let sheet = await openSheet();
    await within(sheet).findByText("Seed Voucher");
    fireEvent.change(within(sheet).getByLabelText(/Reason/), { target: { value: "moving away" } });
    fireEvent.click(within(sheet).getByRole("checkbox"));

    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(retire).not.toHaveBeenCalled();

    sheet = await openSheet();
    await within(sheet).findByText("Seed Voucher");
    expect((within(sheet).getByLabelText(/Reason/) as HTMLTextAreaElement).value).toBe("");
    expect(within(sheet).getByRole("checkbox").getAttribute("aria-checked")).toBe("false");
  });

  it("retires without a reason when none is given", async () => {
    renderSection();
    const sheet = await openSheet();
    await within(sheet).findByText("Seed Voucher");
    fireEvent.click(within(sheet).getByRole("checkbox"));
    fireEvent.click(within(sheet).getByRole("button", { name: "Confirm retirement" }));

    await waitFor(() => expect(retire).toHaveBeenCalledWith({ acknowledged: true }));
  });

  it("sends the trimmed reason", async () => {
    renderSection();
    const sheet = await openSheet();
    await within(sheet).findByText("Seed Voucher");
    fireEvent.change(within(sheet).getByLabelText(/Reason/), {
      target: { value: "  moving away  " },
    });
    fireEvent.click(within(sheet).getByRole("checkbox"));
    fireEvent.click(within(sheet).getByRole("button", { name: "Confirm retirement" }));

    await waitFor(() =>
      expect(retire).toHaveBeenCalledWith({ acknowledged: true, reason: "moving away" }),
    );
  });

  it("holds the sheet open and busy while the request is in flight", async () => {
    retire.mockReturnValue(new Promise(() => {}));
    renderSection();
    const sheet = await openSheet();
    await within(sheet).findByText("Seed Voucher");
    fireEvent.click(within(sheet).getByRole("checkbox"));
    fireEvent.click(within(sheet).getByRole("button", { name: "Confirm retirement" }));

    const busy = await within(sheet).findByRole("button", { name: "Retiring…" });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.hasAttribute("disabled")).toBe(true);
    expect(within(sheet).getByRole("button", { name: "Cancel" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(
      within(sheet)
        .getByLabelText(/Reason/)
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("reports a failure and retries with the same input", async () => {
    retire.mockRejectedValueOnce(new BackendApiError(500, "Could not retire the account."));
    renderSection();
    const sheet = await openSheet();
    await within(sheet).findByText("Seed Voucher");
    fireEvent.change(within(sheet).getByLabelText(/Reason/), { target: { value: "moving away" } });
    fireEvent.click(within(sheet).getByRole("checkbox"));
    fireEvent.click(within(sheet).getByRole("button", { name: "Confirm retirement" }));

    await within(sheet).findByText("Could not retire the account.");
    fireEvent.click(within(sheet).getByRole("button", { name: "Confirm retirement" }));

    await waitFor(() => expect(retire).toHaveBeenCalledTimes(2));
    expect(retire).toHaveBeenLastCalledWith({ acknowledged: true, reason: "moving away" });
    await waitFor(() => expect(screen.queryByText("Could not retire the account.")).toBeNull());
  });

  it("moves the session into recovery and clears private caches on success", async () => {
    // The server now reports the retirement, as it would to the follow-up read.
    retire.mockImplementation(async () => {
      getSession.mockResolvedValue({ ...SESSION, ...NEXT_STATE, retirement: undefined });
      return NEXT_STATE;
    });
    const queryClient = renderSection();
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    queryClient.setQueryData(["clc", "wants", "mine"], ["private"]);
    queryClient.setQueryData(["address-book", ADDRESS], ["private"]);
    const sheet = await openSheet();
    await within(sheet).findByText("Seed Voucher");
    fireEvent.click(within(sheet).getByRole("checkbox"));
    fireEvent.click(within(sheet).getByRole("button", { name: "Confirm retirement" }));

    await waitFor(() => expect(retire).toHaveBeenCalled());
    await waitFor(() => expect(queryClient.getQueryData(["clc", "wants", "mine"])).toBeUndefined());
    expect(queryClient.getQueryData(["address-book", ADDRESS])).toBeUndefined();
    const session = queryClient.getQueriesData<SessionResult>({
      queryKey: authSessionQueryKey,
    })[0]?.[1];
    expect(session).toMatchObject({
      accountLifecycle: "RETIREMENT_SCHEDULED",
      closesAt: PREVIEW.closesAt,
      role: "USER",
    });
  });

  it("switches to recovery from the response even when the follow-up read fails", async () => {
    const queryClient = renderSection();
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    getSession.mockRejectedValue(new Error("offline"));
    const sheet = await openSheet();
    await within(sheet).findByText("Seed Voucher");
    fireEvent.click(within(sheet).getByRole("checkbox"));
    fireEvent.click(within(sheet).getByRole("button", { name: "Confirm retirement" }));

    await waitFor(() => expect(retire).toHaveBeenCalled());
    await waitFor(() => {
      const session = queryClient.getQueriesData<SessionResult>({
        queryKey: authSessionQueryKey,
      })[0]?.[1];
      expect(session?.accountLifecycle).toBe("RETIREMENT_SCHEDULED");
    });
  });
});
