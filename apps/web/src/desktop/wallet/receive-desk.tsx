import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RiFileCopyLine, RiShareLine } from "react-icons/ri";
import { TbNfc } from "react-icons/tb";
import { toast } from "sonner";
import { useConnection } from "wagmi";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { AddressQRCode } from "#/components/wallet";
import { useDeskTrailLabel } from "#/desktop/trail";
import { DeskKV } from "#/desktop/ui/kv";
import {
  DeskCanvas,
  DeskRow,
  DeskRowList,
  DeskSection,
  DeskTitle,
  deskSectionLinkClass,
} from "#/desktop/ui/page";
import { FullValue } from "#/desktop/ui/full-value";
import {
  ActivityAmount,
  ActivityTitle,
  Empty,
  ErrorRetry,
  Loading,
} from "#/desktop/wallet/wallet-parts";
import { useAccountActivityInfinite } from "#/features/wallet/hooks/use-account-balances";
import { useReverseRecipientResolution } from "#/features/wallet/hooks/use-recipient-resolution";
import { activityRowKey } from "#/desktop/activity/activity-desk";
import { formatTransferDate } from "#/features/wallet/logic/transfer-display";
import { CHAIN_ID, CHAIN_INFO } from "#/lib/chain";
import { useWebNfcSupported } from "#/lib/nfc/ndef-adapter";

/**
 * Receive is a focused page: the QR and the address to give out, the network
 * warning, and the latest activity so an arriving payment is seen where the
 * sender is waiting. It does not mount the Wallet behind a dimmed pane.
 */
export function ReceiveDesk() {
  const chainName = CHAIN_INFO.name;
  const { i18n, t } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const { address } = useConnection();
  const activityQuery = useAccountActivityInfinite(address, { poll: true });
  const recentActivity = (activityQuery.data?.pages[0]?.activity ?? []).slice(0, 3);
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
    <DeskCanvas className="max-w-[1000px]">
      <div className="flex min-w-0 items-center gap-3">
        <DeskTitle>
          <Trans>Receive</Trans>
        </DeskTitle>
        <Badge variant="outline" size="sm">
          {chainName}
        </Badge>
      </div>

      <div className="grid min-w-0 items-start gap-6 @3xl:grid-cols-[auto_minmax(0,1fr)]">
        {address && receiveQrValue ? (
          <div className="w-fit border border-border bg-card">
            <AddressQRCode value={receiveQrValue} size={240} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            <Trans>No wallet address available.</Trans>
          </p>
        )}
        <div className="grid min-w-0 gap-4">
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
                        <span dir="auto" className="[overflow-wrap:anywhere]">
                          {username}
                        </span>
                      </CopyValue>,
                    ]
                  : null,
                [
                  <Trans key="label">{chainName} address</Trans>,
                  <FullValue
                    key="value"
                    value={address}
                    initiallyFull
                    copyLabel={t`Copy wallet address`}
                    copiedMessage={t`Address copied`}
                    failedMessage={t`Couldn't copy address`}
                  />,
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
        </div>
      </div>

      <DeskSection
        title={<Trans>Activity</Trans>}
        action={
          <Link
            to="/"
            search={{ tab: "activity" }}
            aria-label={`${t`View all`} ${t`Activity`}`}
            className={deskSectionLinkClass()}
          >
            <Trans>View all</Trans>
          </Link>
        }
      >
        {Boolean(address) && activityQuery.isPending ? (
          <Loading label={<Trans>Loading activity…</Trans>} />
        ) : activityQuery.isError ? (
          <ErrorRetry
            message={<Trans>Couldn't load activity.</Trans>}
            pending={activityQuery.isFetching}
            onRetry={() => void activityQuery.refetch()}
          />
        ) : recentActivity.length === 0 ? (
          <Empty>
            <Trans>No activity yet.</Trans>
          </Empty>
        ) : (
          <DeskRowList>
            {recentActivity.map((item) => (
              <Link
                key={activityRowKey(item)}
                to="/"
                search={{ tab: "activity", tx: activityRowKey(item) }}
                className="block hover:bg-muted/60"
              >
                <DeskRow
                  title={<ActivityTitle item={item} />}
                  subtitle={
                    <time className="font-mono" dateTime={item.dateBlock}>
                      {formatTransferDate(item.dateBlock, locale)}
                    </time>
                  }
                  trail={<ActivityAmount item={item} />}
                />
              </Link>
            ))}
          </DeskRowList>
        )}
      </DeskSection>
    </DeskCanvas>
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
