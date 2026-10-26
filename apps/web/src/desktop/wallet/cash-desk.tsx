import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { RiExternalLinkLine, RiFileCopyLine } from "react-icons/ri";
import { toast } from "sonner";
import { useConnection } from "wagmi";

import { Button } from "#/components/ui/button";
import { HighlightAddress, NetworkBadge } from "#/components/wallet";
import { DeskCanvas, DeskPanel, DeskSection, DeskTitle } from "#/desktop/ui/page";
import { CHAIN_INFO } from "#/lib/chain";

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
    <DeskCanvas>
      <DeskTitle>
        <Trans>Cash</Trans>
      </DeskTitle>
      <NetworkBadge className="mt-3" />

      <DeskPanel className="mt-6">
        <p className="text-xs text-muted-foreground">
          <Trans>{CHAIN_INFO.name} wallet address</Trans>
        </p>
        {address ? (
          <>
            <HighlightAddress
              address={address}
              tailLength={8}
              className="mt-2 block break-all text-xs leading-relaxed"
            />
            <Button type="button" variant="outline" className="mt-3" onClick={copyAddress}>
              <RiFileCopyLine className="size-4" aria-hidden="true" />
              <Trans>Copy address</Trans>
            </Button>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            <Trans>No wallet address available.</Trans>
          </p>
        )}
      </DeskPanel>

      <div className="mt-8 space-y-7">
        <DeskSection title={<Trans>Buy stablecoins on Gnosis</Trans>}>
          <div className="space-y-2">
            <ProviderLink href="https://www.mtpelerin.com/buy-xdai">Mt Pelerin</ProviderLink>
            <p className="text-sm text-muted-foreground">
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
          </div>
        </DeskSection>

        <DeskSection title={<Trans>Sell to a bank account</Trans>}>
          <div className="space-y-2">
            <ProviderLink href="https://www.mtpelerin.com/sell-xdai">Mt Pelerin</ProviderLink>
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
          </div>
        </DeskSection>

        <DeskSection title={<Trans>Alternative for euros</Trans>}>
          <div className="space-y-2">
            <ProviderLink href="https://monerium.app/">Monerium</ProviderLink>
            <p className="text-sm text-muted-foreground">
              <Trans>Buy or sell EURe on Gnosis by bank transfer.</Trans>
            </p>
          </div>
        </DeskSection>

        <DeskSection title={<Trans>Local money and M-Pesa</Trans>}>
          <div className="space-y-2">
            <p className="text-sm">
              <Trans>Buy</Trans>
            </p>
            <p className="text-sm text-muted-foreground">
              <Trans>
                Use <ProviderLink href="https://www.binance.com/">Binance</ProviderLink> or another
                local exchange, then{" "}
                <ProviderLink href="https://jumper.exchange/">Jumper</ProviderLink> to send funds to
                your Gnosis wallet.
              </Trans>
            </p>
            <p className="mt-3 text-sm">
              <Trans>Sell</Trans>
            </p>
            <p className="text-sm text-muted-foreground">
              <Trans>
                Send from your Gnosis wallet through Jumper to an exchange, then withdraw to your
                bank or M-Pesa.
              </Trans>
            </p>
          </div>
        </DeskSection>

        <section className="border border-primary/30 bg-primary/5 p-4 text-sm leading-relaxed">
          <p>
            <Trans>Availability depends on your country.</Trans>
          </p>
          <p className="mt-2">
            <Trans>Always confirm that the token and network match before sending.</Trans>
          </p>
          <p className="mt-2 font-semibold">
            <Trans>Test with a small amount first.</Trans>
          </p>
        </section>
      </div>
    </DeskCanvas>
  );
}

function InstructionList({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1 ps-5 text-sm text-muted-foreground">{children}</ol>;
}

function ProviderLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-semibold text-primary underline underline-offset-4"
    >
      {children}
      <RiExternalLinkLine className="size-4" aria-hidden="true" />
    </a>
  );
}
