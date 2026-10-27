import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RiFileCopyLine, RiShareLine } from "react-icons/ri";
import { TbNfc } from "react-icons/tb";
import { toast } from "sonner";
import { useConnection } from "wagmi";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { AddressQRCode } from "#/components/wallet";
import { useDeskTrailLabel } from "#/desktop/trail";
import { DeskInspector, DeskSplit } from "#/desktop/ui/inspector";
import { DeskKV } from "#/desktop/ui/kv";
import { useReverseRecipientResolution } from "#/features/wallet/hooks/use-recipient-resolution";
import { CHAIN_ID, CHAIN_INFO } from "#/lib/chain";
import { useWebNfcSupported } from "#/lib/nfc/ndef-adapter";
import { WalletDesk } from "./wallet-desk";

/** Receive opens as the inspector over a dimmed Wallet. */
export function ReceiveDesk() {
  const chainName = CHAIN_INFO.name;
  const { t } = useLingui();
  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const { address } = useConnection();
  const nfcSupported = useWebNfcSupported();
  const identity = useReverseRecipientResolution(address ?? null);
  const username = identity.data?.alias ?? null;
  useDeskTrailLabel(username);
  const receiveQrValue = address ? `ethereum:${address}@${CHAIN_ID}` : null;

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

  return (
    <div className="flex h-full min-h-0">
      <DeskSplit
        dimmed
        main={<WalletDesk />}
        side={
          <DeskInspector
            title={
              <span className="flex items-center gap-2">
                <Trans>Receive</Trans>
                <Badge variant="outline" size="sm">
                  {chainName}
                </Badge>
              </span>
            }
            onClose={() => {
              if (canGoBack) router.history.back();
              else void navigate({ to: "/", search: { tab: "wallet" } });
            }}
          >
            {address && receiveQrValue ? (
              <div className="w-fit border border-border bg-card">
                <AddressQRCode value={receiveQrValue} size={220} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                <Trans>No wallet address available.</Trans>
              </p>
            )}
            {address ? (
              <DeskKV
                rows={[
                  username
                    ? [
                        <Trans key="label">Username</Trans>,
                        <CopyValue
                          key="value"
                          label={t`Copy wallet username`}
                          onCopy={() => copy(username, true)}
                        >
                          <span dir="auto" className="truncate">
                            {username}
                          </span>
                        </CopyValue>,
                      ]
                    : null,
                  [
                    <Trans key="label">{chainName} address</Trans>,
                    <CopyValue
                      key="value"
                      label={t`Copy wallet address`}
                      onCopy={() => copy(address)}
                    >
                      <span dir="ltr" className="truncate">
                        {formatVoucherAddress(address)}
                      </span>
                    </CopyValue>,
                  ],
                ]}
              />
            ) : null}
            <p className="border border-border border-s-[3px] border-s-warning bg-card px-4 py-3.5 text-sm">
              <Trans>
                Only send assets on the <strong>{chainName} network</strong> to this address. Other
                networks may be lost.
              </Trans>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={!address}
                onClick={() => address && copy(address)}
              >
                <RiFileCopyLine aria-hidden="true" />
                <Trans>Copy</Trans>
              </Button>
              <Button type="button" disabled={!address} onClick={() => void share()}>
                <RiShareLine aria-hidden="true" />
                <Trans>Share</Trans>
              </Button>
            </div>
            {nfcSupported && address ? (
              <Button asChild variant="outline">
                <Link to="/wallet/collect">
                  <TbNfc aria-hidden="true" />
                  <Trans>Collect by card</Trans>
                </Link>
              </Button>
            ) : null}
          </DeskInspector>
        }
      />
    </div>
  );
}

function CopyValue({
  label,
  onCopy,
  children,
}: {
  label: string;
  onCopy: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex w-full min-w-0 items-center justify-between gap-2 text-start"
      onClick={onCopy}
    >
      {children}
      <RiFileCopyLine className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}
