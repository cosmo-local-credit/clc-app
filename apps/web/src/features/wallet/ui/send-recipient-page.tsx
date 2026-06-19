import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { RiCheckLine, RiQrScan2Line, RiUser3Line } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { HighlightAddress, HueAvatar, NetworkBadge } from "#/components/wallet";
import { RECENT_RECIPIENTS, type Recipient } from "#/components/wallet/wallet-data";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { cn } from "#/lib/utils";

const RESOLVED_LABEL = "jamila.clc";

function ResolutionPreview({ recipient }: { recipient: Recipient }) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5 border border-primary/30 bg-primary/5 p-3">
      <HueAvatar
        seed={recipient.seed}
        size={34}
        icon={<RiUser3Line className="size-4" aria-hidden="true" />}
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm">{recipient.label}</p>
        {recipient.address ? (
          <HighlightAddress address={recipient.address} />
        ) : (
          <p className="font-mono text-muted-foreground text-xs">{recipient.sub}</p>
        )}
      </div>
      <span className="flex items-center gap-1 text-primary">
        <RiCheckLine className="size-3.5" aria-hidden="true" />
        <span className="text-xs font-semibold">
          <Trans>Resolved</Trans>
        </span>
      </span>
    </div>
  );
}

export function SendRecipientPage() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [query, setQuery] = useState(RESOLVED_LABEL);
  const resolved = RECENT_RECIPIENTS.find((recipient) => recipient.id === "jamila");

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Send`} onClick={() => window.history.back()} />

      <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
        <Trans>Send to</Trans>
      </h1>
      <p className="mt-1 mb-3.5 text-muted-foreground text-sm">
        <Trans>Enter an address, ENS or phone number.</Trans>
      </p>

      <div className="mb-2.5 flex gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={t`Recipient address, ENS or phone`}
          className="h-12 font-mono text-sm"
          placeholder="0x… · jane.clc · +254…"
        />
        <Button
          variant="outline"
          size="icon-lg"
          className="h-12 w-12 shrink-0"
          aria-label={t`Scan QR`}
        >
          <RiQrScan2Line className="size-5" aria-hidden="true" />
        </Button>
      </div>

      {resolved ? <ResolutionPreview recipient={resolved} /> : null}

      <p className="mb-2 font-semibold text-muted-foreground text-xs tracking-[0.06em] uppercase">
        <Trans>Recent</Trans>
      </p>
      <div className="mb-4 border border-border bg-card">
        {RECENT_RECIPIENTS.map((recipient, index, list) => (
          <div
            key={recipient.id}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 p-3",
              index < list.length - 1 && "border-b border-border",
            )}
          >
            <HueAvatar seed={recipient.seed} label={recipient.label} size={30} />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm">{recipient.label}</p>
              {recipient.address ? (
                <HighlightAddress address={recipient.address} />
              ) : (
                <p className="font-mono text-muted-foreground text-xs">{recipient.sub}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1" />

      <NetworkBadge className="self-start" />
      <Button
        className="mt-2.5 h-11 w-full"
        onClick={() => {
          void navigate({ to: "/wallet/send/amount" });
        }}
      >
        {t`Continue`}
      </Button>
    </div>
  );
}
