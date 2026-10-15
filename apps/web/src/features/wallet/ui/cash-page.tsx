import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { RiExternalLinkLine, RiFileCopyLine } from "react-icons/ri";
import { toast } from "sonner";
import { useConnection } from "wagmi";

import { Button } from "#/components/ui/button";
import { BackChevron, HighlightAddress, NetworkBadge } from "#/components/wallet";
import { CHAIN_INFO } from "#/lib/chain";

export function CashPage() {
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
    <main className="min-h-[100svh] bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Wallet`} to="/" search={{ tab: "wallet" }} />

      <div className="mt-2 text-center">
        <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
          <Trans>Cash</Trans>
        </h1>
        <NetworkBadge className="mt-3" />
      </div>

      <section className="mt-6 border border-border bg-card p-4" aria-labelledby="cash-address">
        <p id="cash-address" className="text-muted-foreground text-xs">
          <Trans>{CHAIN_INFO.name} wallet address</Trans>
        </p>
        {address ? (
          <>
            <HighlightAddress
              address={address}
              tailLength={8}
              className="mt-2 block break-all text-xs leading-relaxed"
            />
            <Button variant="outline" className="mt-3 h-11 w-full bg-card" onClick={copyAddress}>
              <RiFileCopyLine className="size-4" aria-hidden="true" />
              <Trans>Copy address</Trans>
            </Button>
          </>
        ) : (
          <p className="mt-2 text-muted-foreground text-sm">
            <Trans>No wallet address available.</Trans>
          </p>
        )}
      </section>

      <div className="mt-6 space-y-7">
        <InstructionSection title={<Trans>Buy stablecoins on Gnosis</Trans>}>
          <ProviderLink href="https://www.mtpelerin.com/buy-xdai">Mt Pelerin</ProviderLink>
          <p className="text-muted-foreground text-sm">
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
        </InstructionSection>

        <InstructionSection title={<Trans>Sell to a bank account</Trans>}>
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
        </InstructionSection>

        <InstructionSection title={<Trans>Alternative for euros</Trans>}>
          <ProviderLink href="https://monerium.app/">Monerium</ProviderLink>
          <p className="text-muted-foreground text-sm">
            <Trans>Buy or sell EURe on Gnosis by bank transfer.</Trans>
          </p>
        </InstructionSection>

        <InstructionSection title={<Trans>Local money and M-Pesa</Trans>}>
          <p className="text-sm">
            <Trans>Buy</Trans>
          </p>
          <p className="text-muted-foreground text-sm">
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
          <p className="text-muted-foreground text-sm">
            <Trans>
              Send from your Gnosis wallet through Jumper to an exchange, then withdraw to your bank
              or M-Pesa.
            </Trans>
          </p>
        </InstructionSection>

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
    </main>
  );
}

function InstructionSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-heading text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function InstructionList({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1 ps-5 text-muted-foreground text-sm">{children}</ol>;
}

function ProviderLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary underline underline-offset-4"
    >
      {children}
      <RiExternalLinkLine className="size-4" aria-hidden="true" />
    </a>
  );
}
