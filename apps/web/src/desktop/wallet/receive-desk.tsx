import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { RiFileCopyLine, RiShareLine } from "react-icons/ri";
import { TbNfc } from "react-icons/tb";
import { toast } from "sonner";
import { useConnection } from "wagmi";

import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import {
  AddressQRCode,
  HighlightAddress,
  NetworkBadge,
  TokenLogo,
  type WalletToken,
} from "#/components/wallet";
import { useDeskTrailLabel } from "#/desktop/trail";
import { DeskTable, type DeskColumn } from "#/desktop/ui/data-table";
import { DeskInspector, DeskSplit } from "#/desktop/ui/inspector";
import { DeskCanvas, DeskTitle } from "#/desktop/ui/page";
import { useReverseRecipientResolution } from "#/features/wallet/hooks/use-recipient-resolution";
import { useWalletVoucherPreview } from "#/features/wallet/hooks/use-wallet-voucher-preview";
import { CHAIN_ID, CHAIN_INFO } from "#/lib/chain";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";
import { useWebNfcSupported } from "#/lib/nfc/ndef-adapter";

export function ReceiveDesk() {
  const chainName = CHAIN_INFO.name;
  const { t } = useLingui();
  const { address } = useConnection();
  const nfcSupported = useWebNfcSupported();
  const identity = useReverseRecipientResolution(address ?? null);
  const username = identity.data?.alias ?? null;
  useDeskTrailLabel(username);
  const receiveQrValue = address ? `ethereum:${address}@${CHAIN_ID}` : null;
  const vouchers = useWalletVoucherPreview(address);

  const copy = (value: string, copyingUsername = false) => {
    if (!navigator.clipboard) {
      toast.error(copyingUsername ? t`Couldn't copy username` : t`Couldn't copy address`);
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(copyingUsername ? t`Username copied` : t`Address copied`))
      .catch(() =>
        toast.error(copyingUsername ? t`Couldn't copy username` : t`Couldn't copy address`),
      );
  };

  const share = async () => {
    if (!address) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: t`My wallet address`, text: address });
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") copy(address);
      }
      return;
    }
    copy(address);
  };

  const columns = useMemo<DeskColumn<WalletToken>[]>(
    () => [
      {
        id: "token",
        header: t`Holdings`,
        sortValue: (row) => row.symbol,
        cell: (row) => (
          <span className="flex min-w-0 items-center gap-2">
            <TokenLogo token={row} size={20} />
            <span className="truncate text-sm font-semibold">{row.symbol}</span>
          </span>
        ),
      },
      {
        id: "balance",
        header: t`Balance`,
        align: "end",
        width: "8rem",
        sortValue: (row) => Number(row.balance ?? 0),
        cell: (row) => (
          <span className="font-heading font-semibold tracking-tight" dir="ltr">
            {row.amount}
          </span>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="flex h-full min-h-0">
      <DeskSplit
        main={
          <DeskCanvas width="full">
            <DeskTitle>
              <Trans>Wallet</Trans>
            </DeskTitle>
            <p className="mt-1 font-mono text-sm text-muted-foreground" dir="ltr">
              {address ? (
                formatVoucherAddress(address)
              ) : (
                <Trans>No wallet address available.</Trans>
              )}
            </p>
            <div className="mt-6">
              {Boolean(address) && vouchers.isPending ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner />
                  <Trans>Loading vouchers…</Trans>
                </p>
              ) : vouchers.isBalanceError ? (
                <div className="space-y-2 border border-border bg-card p-4">
                  <p role="alert" className="text-sm text-muted-foreground">
                    <Trans>Couldn't load vouchers.</Trans>
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    pending={vouchers.isFetching}
                    onClick={() => void vouchers.refetchBalances()}
                  >
                    <Trans>Try again</Trans>
                  </Button>
                </div>
              ) : (
                <DeskTable
                  label={t`Holdings`}
                  rows={vouchers.holdings}
                  columns={columns}
                  rowKey={(row) => row.id}
                  empty={<Trans>No vouchers yet.</Trans>}
                  renderRow={(row, props, cells) => {
                    const voucherAddress = parseVoucherAddress(row.contractAddress ?? row.id);
                    return voucherAddress ? (
                      <Link
                        to="/vouchers/$voucherAddress"
                        params={{ voucherAddress }}
                        search={{ from: "wallet" }}
                        {...props}
                      >
                        {cells}
                      </Link>
                    ) : (
                      <div {...props}>{cells}</div>
                    );
                  }}
                />
              )}
            </div>
          </DeskCanvas>
        }
        side={
          <DeskInspector
            title={<Trans>Receive</Trans>}
            footer={
              <div className="flex flex-col gap-2">
                {nfcSupported && address ? (
                  <Button asChild variant="outline">
                    <Link to="/wallet/collect">
                      <TbNfc className="size-4" aria-hidden="true" />
                      <Trans>Collect by card</Trans>
                    </Link>
                  </Button>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={!address}
                    onClick={() => address && copy(address)}
                  >
                    <RiFileCopyLine className="size-4" aria-hidden="true" />
                    <Trans>Copy</Trans>
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    disabled={!address}
                    onClick={() => void share()}
                  >
                    <RiShareLine className="size-4" aria-hidden="true" />
                    <Trans>Share</Trans>
                  </Button>
                </div>
              </div>
            }
          >
            <div className="flex flex-col items-center">
              <NetworkBadge />
              {address && receiveQrValue ? (
                <div className="mt-4">
                  <AddressQRCode value={receiveQrValue} />
                </div>
              ) : (
                <p className="my-6 text-sm text-muted-foreground">
                  <Trans>No wallet address available.</Trans>
                </p>
              )}
            </div>
            {address ? (
              <div className="mt-4 border border-border bg-card">
                {username ? (
                  <button
                    type="button"
                    aria-label={t`Copy wallet username`}
                    className="flex w-full items-center justify-between gap-3 border-border border-b px-3 py-2 text-start"
                    onClick={() => copy(username, true)}
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground">
                        <Trans>Username</Trans>
                      </span>
                      <span dir="auto" className="truncate font-mono text-xs text-muted-foreground">
                        {username}
                      </span>
                    </span>
                    <RiFileCopyLine
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label={t`Copy wallet address`}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-start"
                  onClick={() => copy(address)}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">
                      <Trans>{chainName} address</Trans>
                    </span>
                    <HighlightAddress
                      address={address}
                      tailLength={6}
                      className="min-w-0 break-all text-xs"
                    />
                  </span>
                  <RiFileCopyLine
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              </div>
            ) : null}
            <div className="mt-3 border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs leading-relaxed">
                <Trans>
                  Only send assets on the <strong>{chainName} network</strong> to this address.
                  Other networks may be lost.
                </Trans>
              </p>
            </div>
          </DeskInspector>
        }
      />
    </div>
  );
}
