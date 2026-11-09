import type { UserPool } from "@clc/api/features/pools/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * A steward's pool write across the phone/desktop view swap. The phone sheet
 * and the desktop side panel both relay through `usePoolAdminRelay`; a batch
 * still waiting for the chain when the first view unmounts must keep the other
 * view's Save busy, or a second press relays the same change twice.
 */
const POOL = "0x8e0a000000000000000000000000000000000b41";
const OWNER = "0x1234000000000000000000000000000000005678";
const RECIPIENT = "0x9911000000000000000000000000000000002244";
const FEE_POLICY = "0x70c1000000000000000000000000000000003b55";

const mocks = vi.hoisted(() => ({ relay: vi.fn(), waitRelay: vi.fn() }));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: OWNER, connector: { id: "paper-wallet" } }),
  useClient: () => undefined,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock("#/features/webauthn/api/relay-calibur-batch", () => ({ relayCaliburBatch: mocks.relay }));
vi.mock("#/features/webauthn/hooks/use-calibur-delegation", () => ({
  useCaliburDelegation: () => "delegated",
}));
vi.mock("#/features/ownership/api/wait-for-ownership-relay", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  waitForOwnershipRelay: mocks.waitRelay,
}));
vi.mock("#/features/safe/hooks/use-safe-write", () => ({
  useSafeWrite: () => ({ write: vi.fn() }),
}));
vi.mock("#/features/safe/hooks/use-report-write-error", () => ({
  useReportWriteError: () => () => false,
}));
vi.mock("#/features/ownership/hooks/use-asset-owner-info", () => ({
  useAssetOwnerInfo: () => ({
    owner: undefined,
    info: undefined,
    isSafeOwned: false,
    isSafeSigner: false,
    canManage: true,
  }),
}));
vi.mock("#/features/wallet/hooks/use-account-balances", () => ({
  useAllAccountTokens: () => ({ tokens: [], isPending: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("#/features/pools/hooks/use-pool-treasury", () => ({
  usePoolTreasury: () => ({ data: new Map() }),
  poolTreasuryQueryKeys: { all: ["pool-treasury"] },
}));
vi.mock("#/features/pools/hooks/use-pool-fee-settings", () => ({
  usePoolFeeSettings: () => ({
    data: { feePpm: "10000", feePercent: "1", feeAddress: RECIPIENT },
  }),
  poolFeeSettingsQueryKeys: { all: ["pool-fee-settings"] },
}));
vi.mock("#/features/wallet/hooks/use-recipient-resolution", () => ({
  useRecipientSearch: () => ({ data: null, error: null, isPending: false }),
  useReverseRecipientResolution: () => ({ data: null, error: null, isPending: false }),
}));
vi.mock("#/components/retirement/retirement-control", () => ({ RetirementControl: () => null }));
vi.mock("#/components/safe/recipient-owner-notice", () => ({ RecipientOwnerNotice: () => null }));

import { PoolControlSide } from "#/desktop/pools/detail/pool-manage-desk";
import { PoolControlsPanel } from "#/features/pools/ui/pool-controls-panel";

const pool = {
  id: "7",
  chainId: 100,
  address: POOL,
  name: "Kilifi Traders",
  symbol: "KLF",
  ownerAddress: OWNER,
  feePpm: 10_000,
  feeAddress: RECIPIENT,
  tokenRegistryAddress: null,
  limiterAddress: null,
  quoterAddress: null,
  quoterType: "relative",
  feePolicyAddress: FEE_POLICY,
  protocolFeeControllerAddress: null,
  feesDecoupled: true,
  decimals: 6,
  description: "",
  unitOfAccount: "KES",
  locationName: null,
  geoLat: null,
  geoLng: null,
  email: null,
  website: null,
  phone: null,
  imageUrl: null,
  bannerUrl: null,
  terms: null,
  defaultVoucherId: null,
  voucherCount: 0,
  tags: [],
} as UserPool;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.waitRelay.mockResolvedValue({ trackingId: "t1", txHash: `0x${"ab".repeat(32)}` });
});

describe("Pool fee settings across a phone/desktop view switch", () => {
  it("keeps Save busy in the other view while the first change is still relaying", async () => {
    const relayed = deferred<{ trackingId: string }>();
    mocks.relay.mockReturnValue(relayed.promise);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const withClient = (ui: ReactNode) => (
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    );

    const phone = render(
      withClient(<PoolControlsPanel pool={pool} vouchers={[]} canManageOnChain />),
    );
    fireEvent.click(screen.getByRole("button", { name: /Fee % and recipient/ }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.change(within(sheet).getByLabelText("Swap fee (%)"), { target: { value: "2" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save fee settings" }));
    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    phone.unmount();

    render(
      withClient(
        <PoolControlSide
          side={{ kind: "feeSettings" }}
          pool={pool}
          vouchers={[]}
          canManageOnChain
          viewerAddress={OWNER}
          onClose={vi.fn()}
        />,
      ),
    );

    const waiting = screen.getByRole("button", { name: /Waiting for the chain/ });
    expect(waiting.getAttribute("aria-busy")).toBe("true");
    expect((waiting as HTMLButtonElement).disabled).toBe(true);

    await act(async () => relayed.resolve({ trackingId: "t1" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save fee settings" }).getAttribute("aria-busy"),
      ).toBeNull(),
    );
    fireEvent.change(screen.getByLabelText("Swap fee (%)"), { target: { value: "3" } });
    expect(
      (screen.getByRole("button", { name: "Save fee settings" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(mocks.relay).toHaveBeenCalledTimes(1);
  });
});
