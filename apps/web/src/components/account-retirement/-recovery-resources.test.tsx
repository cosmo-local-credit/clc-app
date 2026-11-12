import type { UserPool } from "@clc/api/features/pools/client";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const WALLET = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;
const TOKEN = "0x00000000000000000000000000000000000000a1";

const SAFE = "0x5afe5afe5afe5afe5afe5afe5afe5afe5afe5afe" as const;

const { controls, flags, fee, owner, controlArgs } = vi.hoisted(() => ({
  owner: { catalog: null as string | null, chain: null as string | null | undefined },
  controlArgs: { current: undefined as undefined | { ownerAddress: string | null } },
  controls: {
    current: { contract: null, canRequestRetirement: false } as {
      contract: null | {
        tokenAddress: string;
        ownerAddress: string;
        walletAddress: string;
      };
      canRequestRetirement: boolean;
    },
  },
  flags: { poolTransfer: true },
  fee: vi.fn(),
}));

vi.mock("#/features/vouchers/hooks/use-voucher-controls", () => ({
  useVoucherControls: (args: { ownerAddress: string | null }) => {
    controlArgs.current = args;
    return controls.current;
  },
}));
vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useMarketVoucherDetail: () => ({
    data: owner.catalog ? { ownerAddress: owner.catalog } : undefined,
  }),
}));
vi.mock("#/features/ownership/hooks/use-asset-owner", () => ({
  useAssetOwner: (_address: string, catalogOwner: string | null | undefined) =>
    owner.chain === undefined ? catalogOwner : owner.chain,
}));
vi.mock("#/features/pools/ui/pool-controls-panel", () => ({
  PoolWithdrawActions: ({ pool }: { pool: { name: string } }) => (
    <button type="button">withdraw from {pool.name}</button>
  ),
}));
vi.mock("#/features/pools/hooks/use-pool-fee-settings", () => ({
  usePoolFeeSettings: (pool: unknown, enabled: boolean) => fee(pool, enabled),
}));
vi.mock("#/lib/ownership-transfer-config", () => ({
  get POOL_OWNERSHIP_TRANSFER_ENABLED() {
    return flags.poolTransfer;
  },
}));
vi.mock("#/components/vouchers/voucher-contract-actions-panel", () => ({
  VoucherOwnershipTransferSheet: ({
    open,
    onClose,
    tokenAddress,
  }: {
    open: boolean;
    onClose: () => void;
    tokenAddress: string;
  }) =>
    open ? (
      <div role="dialog" aria-label="voucher transfer">
        {tokenAddress}
        <button type="button" onClick={onClose}>
          close voucher transfer
        </button>
      </div>
    ) : null,
}));
vi.mock("#/features/pools/ui/pool-ownership-transfer-form", () => ({
  PoolOwnershipTransferForm: ({
    settings,
    onDone,
  }: {
    settings: { feeAddress: string } | undefined;
    onDone: () => void;
  }) => (
    <div>
      fee {settings?.feeAddress ?? "unread"}
      <button type="button" onClick={onDone}>
        finish pool transfer
      </button>
    </div>
  ),
}));
vi.mock("#/components/retirement/retirement-control", () => ({
  RetirementControl: ({
    type,
    name,
    viewer,
    active,
  }: {
    type: string;
    name: string;
    viewer: string;
    active?: boolean;
  }) => (
    <div>
      retire {type} {name} as {viewer} {active === false ? "retired" : "active"}
    </div>
  ),
}));
vi.mock("#/components/wallet", () => ({
  HoldingBalance: ({ token }: { token: { amount: string } }) => <span>{token.amount}</span>,
  PoolLogo: () => null,
  TokenLogo: () => null,
}));

import { RecoveryPoolRow, RecoveryVoucherRow } from "./recovery-resources";

const token = {
  id: TOKEN,
  symbol: "SEED",
  name: "Seed Voucher",
  amount: "7",
  contractAddress: TOKEN,
  tokenDecimals: 6,
} as Parameters<typeof RecoveryVoucherRow>[0]["token"];

const pool = {
  address: "0x00000000000000000000000000000000000000b2",
  name: "Village Pool",
  imageUrl: null,
  active: true,
} as unknown as UserPool;

function renderRow(row: React.ReactNode) {
  render(<ul>{row}</ul>);
}

beforeEach(() => {
  owner.catalog = null;
  owner.chain = undefined;
  controlArgs.current = undefined;
  controls.current = { contract: null, canRequestRetirement: false };
  flags.poolTransfer = true;
  fee.mockReset().mockReturnValue({ data: undefined });
});

describe("recovery voucher row", () => {
  it("offers a transfer and a retirement request to the owner", () => {
    controls.current = {
      contract: { tokenAddress: TOKEN, ownerAddress: WALLET, walletAddress: WALLET },
      canRequestRetirement: true,
    };
    renderRow(<RecoveryVoucherRow token={token} walletAddress={WALLET} />);

    expect(screen.getByText("Seed Voucher")).toBeTruthy();
    expect(screen.getByText(`retire voucher Seed Voucher as ${WALLET} active`)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Transfer ownership of Seed Voucher" }));
    const sheet = screen.getByRole("dialog", { name: "voucher transfer" });
    expect(within(sheet).getByText(TOKEN)).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "close voucher transfer" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hands the chain owner, not the signer, to the transfer for a Safe-owned voucher", () => {
    owner.catalog = SAFE;
    renderRow(<RecoveryVoucherRow token={token} walletAddress={WALLET} />);
    expect(controlArgs.current?.ownerAddress).toBe(SAFE);
  });

  it("prefers a confirmed local handover over the catalog owner", () => {
    owner.catalog = SAFE;
    owner.chain = WALLET;
    renderRow(<RecoveryVoucherRow token={token} walletAddress={WALLET} />);
    expect(controlArgs.current?.ownerAddress).toBe(WALLET);
  });

  it("passes no owner while it is unknown, so no transfer is offered on a guess", () => {
    renderRow(<RecoveryVoucherRow token={token} walletAddress={WALLET} />);
    expect(controlArgs.current?.ownerAddress).toBeNull();
  });

  it("offers nothing the wallet cannot sign", () => {
    renderRow(<RecoveryVoucherRow token={token} walletAddress={WALLET} />);

    expect(screen.queryByRole("button", { name: /Transfer ownership/ })).toBeNull();
    expect(screen.queryByText(/retire voucher/)).toBeNull();
  });

  it("does not offer retirement for a voucher with no contract address", () => {
    controls.current = { contract: null, canRequestRetirement: true };
    renderRow(
      <RecoveryVoucherRow
        token={{ ...token, contractAddress: undefined }}
        walletAddress={WALLET}
      />,
    );
    expect(screen.queryByText(/retire voucher/)).toBeNull();
  });
});

describe("recovery pool row", () => {
  it("offers withdrawing from the pool in the shell", () => {
    renderRow(<RecoveryPoolRow pool={pool} walletAddress={WALLET} />);
    expect(screen.getByRole("button", { name: "withdraw from Village Pool" })).toBeTruthy();
  });

  it("transfers ownership with the fee settings read once the sheet opens", () => {
    fee.mockImplementation((_, enabled: boolean) => ({
      data: enabled ? { feeAddress: "0xfee" } : undefined,
    }));
    renderRow(<RecoveryPoolRow pool={pool} walletAddress={WALLET} />);

    expect(fee).toHaveBeenLastCalledWith(pool, false);
    expect(screen.getByText(`retire pool Village Pool as ${WALLET} active`)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Transfer ownership of Village Pool" }));
    expect(screen.getByText("fee 0xfee")).toBeTruthy();
    expect(fee).toHaveBeenLastCalledWith(pool, true);

    fireEvent.click(screen.getByRole("button", { name: "finish pool transfer" }));
    expect(screen.queryByText("fee 0xfee")).toBeNull();
  });

  it("marks a retired pool and passes that on to the retirement control", () => {
    renderRow(<RecoveryPoolRow pool={{ ...pool, active: false }} walletAddress={WALLET} />);

    expect(screen.getByText("Retired — withdrawals available")).toBeTruthy();
    expect(screen.getByText(`retire pool Village Pool as ${WALLET} retired`)).toBeTruthy();
  });

  it("leaves transfer out where ownership transfer is not enabled", () => {
    flags.poolTransfer = false;
    renderRow(<RecoveryPoolRow pool={pool} walletAddress={WALLET} />);

    expect(screen.queryByRole("button", { name: /Transfer ownership/ })).toBeNull();
    expect(screen.getByText(`retire pool Village Pool as ${WALLET} active`)).toBeTruthy();
  });
});
