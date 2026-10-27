import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { RiExternalLinkLine, RiFileCopyLine } from "react-icons/ri";
import { toast } from "sonner";
import { useConnection } from "wagmi";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import { DeskCanvas, DeskPanel, DeskTitle } from "#/desktop/ui/page";
import { CHAIN_INFO } from "#/lib/chain";

/** The guide to outside providers: address on top, the four routes in a 2 × 2 grid. */
export function CashDesk() {
  const { t } = useLingui();
  const { address } = useConnection();

  const copyAddress = () => {
    if (!address || !navigator.clipboard) {
      toast.error(t`Couldn't copy address`);
      return;
    }
    void navigator.clipboard
      .writeText(address)
      .then(() => toast.success(t`Address copied`))
      .catch(() => toast.error(t`Couldn't copy address`));
  };

  return (
    <DeskCanvas className="max-w-[1100px]">
      <div className="flex min-w-0 items-center gap-3">
        <DeskTitle>
          <Trans>Cash</Trans>
        </DeskTitle>
        <Badge variant="outline" size="sm">
          {CHAIN_INFO.name}
        </Badge>
      </div>

      <DeskPanel className="flex min-w-0 items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            <Trans>{CHAIN_INFO.name} wallet address</Trans>
          </p>
          {address ? (
            <p className="truncate font-mono text-sm font-semibold" dir="ltr">
              {address}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              <Trans>No wallet address available.</Trans>
            </p>
          )}
        </div>
        {address ? (
          <Button type="button" variant="outline" onClick={copyAddress}>
            <RiFileCopyLine aria-hidden="true" />
            <Trans>Copy address</Trans>
          </Button>
        ) : null}
      </DeskPanel>

      <div className="grid grid-cols-2 gap-4">
        <GuidePanel
          title={<Trans>Buy stablecoins on Gnosis</Trans>}
          provider="Mt Pelerin"
          links={[["Mt Pelerin", "https://www.mtpelerin.com/buy-xdai"]]}
        >
          <p>
            <Trans>Pay by card or bank transfer.</Trans>
          </p>
          <InstructionList>
            <li>
              <Trans>Enter the amount.</Trans>
            </li>
            <li>
              <Trans>Enter your Gnosis wallet address.</Trans>
            </li>
            <li>
              <Trans>Pay and receive xDAI directly.</Trans>
            </li>
          </InstructionList>
        </GuidePanel>

        <GuidePanel
          title={<Trans>Sell to a bank account</Trans>}
          provider="Mt Pelerin"
          links={[["Mt Pelerin", "https://www.mtpelerin.com/sell-xdai"]]}
        >
          <InstructionList>
            <li>
              <Trans>Enter the amount and your bank details.</Trans>
            </li>
            <li>
              <Trans>Send xDAI as instructed.</Trans>
            </li>
            <li>
              <Trans>Receive the bank transfer.</Trans>
            </li>
          </InstructionList>
        </GuidePanel>

        <GuidePanel
          title={<Trans>Alternative for euros</Trans>}
          provider="Monerium · EURe"
          links={[["Monerium", "https://monerium.app/"]]}
        >
          <p>
            <Trans>Buy or sell EURe on Gnosis by bank transfer.</Trans>
          </p>
        </GuidePanel>

        <GuidePanel
          title={<Trans>Local money and M-Pesa</Trans>}
          provider="Binance · Jumper"
          links={[
            ["Binance", "https://www.binance.com/"],
            ["Jumper", "https://jumper.exchange/"],
          ]}
        >
          <p>
            <span className="font-semibold text-foreground">
              <Trans>Buy</Trans>
            </span>{" "}
            <Trans>
              Use <InlineLink href="https://www.binance.com/">Binance</InlineLink> or another local
              exchange, then <InlineLink href="https://jumper.exchange/">Jumper</InlineLink> to send
              funds to your Gnosis wallet.
            </Trans>
          </p>
          <p>
            <span className="font-semibold text-foreground">
              <Trans>Sell</Trans>
            </span>{" "}
            <Trans>
              Send from your Gnosis wallet through Jumper to an exchange, then withdraw to your bank
              or M-Pesa.
            </Trans>
          </p>
        </GuidePanel>
      </div>

      <p className="border border-border border-s-[3px] border-s-warning bg-card px-4 py-3.5 text-sm">
        <Trans>Availability depends on your country.</Trans>{" "}
        <Trans>Always confirm that the token and network match before sending.</Trans>{" "}
        <strong className="font-semibold">
          <Trans>Test with a small amount first.</Trans>
        </strong>
      </p>
    </DeskCanvas>
  );
}

function GuidePanel({
  title,
  provider,
  links,
  children,
}: {
  title: ReactNode;
  provider: string;
  links: readonly (readonly [string, string])[];
  children: ReactNode;
}) {
  return (
    <DeskPanel className="flex min-w-0 flex-col gap-3">
      <div className="grid gap-0.5">
        <SectionHeading as="h2" variant="section">
          {title}
        </SectionHeading>
        <p className="text-sm text-muted-foreground">{provider}</p>
      </div>
      <div className="grid gap-2 text-sm text-muted-foreground">{children}</div>
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {links.map(([label, href]) => (
          <Button key={href} asChild variant="outline">
            <a href={href} target="_blank" rel="noopener noreferrer">
              {label}
              <RiExternalLinkLine aria-hidden="true" />
            </a>
          </Button>
        ))}
      </div>
    </DeskPanel>
  );
}

function InstructionList({ children }: { children: ReactNode }) {
  return <ol className="grid list-decimal gap-1 ps-5">{children}</ol>;
}

function InlineLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-foreground underline underline-offset-4"
    >
      {children}
    </a>
  );
}
