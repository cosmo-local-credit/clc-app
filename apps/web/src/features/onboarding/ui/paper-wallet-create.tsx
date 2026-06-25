import { Trans, useLingui } from "@lingui/react/macro";
import { FiArrowLeft, FiLoader } from "react-icons/fi";
import { useEffect, useMemo, useRef, useState } from "react";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { connect } from "wagmi/actions";

import { OnboardingMenu } from "#/components/language-selector";
import { Button } from "#/components/ui/button";
import { clearPrivateKey, storePrivateKey } from "#/connectors/privateKey";
import { pkConnector, wagmiConfig } from "#/providers/web3-config";
import { usePaperWalletProtection } from "./paper-wallet-protection";
import { usePaperWalletSetup } from "./paper-wallet-setup";

type Props = {
  onBack: () => void;
};

export function PaperWalletCreate({ onBack }: Props) {
  const { t } = useLingui();
  const keyRef = useRef<`0x${string}` | null>(null);
  if (!keyRef.current) keyRef.current = generatePrivateKey();
  const key = keyRef.current;

  const account = useMemo(() => privateKeyToAccount(key), [key]);
  const address = account.address;
  const {
    qrUrl,
    controls: protectionControls,
    isReady: paperWalletReady,
    isEncrypting: paperWalletEncrypting,
  } = usePaperWalletProtection({ privateKey: key });

  const { card, controls, downloadButton } = usePaperWalletSetup({
    address,
    qrUrl,
    defaultName: t`Paper wallet`,
    downloadDisabled: !paperWalletReady || paperWalletEncrypting,
  });

  const [acked, setAcked] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    if (!paperWalletReady || paperWalletEncrypting) {
      setAcked(false);
    }
  }, [paperWalletReady, paperWalletEncrypting]);

  async function handleContinue() {
    setConnecting(true);
    setConnectError(null);
    try {
      storePrivateKey(key);
      await connect(wagmiConfig, { connector: pkConnector });
    } catch (err) {
      clearPrivateKey();
      setConnectError(err instanceof Error ? err.message : t`Connection failed.`);
      setConnecting(false);
    }
  }

  return (
    <div className="bg-background relative flex min-h-[100svh] flex-col">
      <OnboardingMenu />
      <div className="flex flex-col px-6 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground mb-3 -ml-2 flex h-11 items-center gap-1.5 self-start px-2 text-sm"
          aria-label={t`Go back`}
        >
          <FiArrowLeft className="size-4" />
          <Trans>Back</Trans>
        </button>

        <div className="mb-5 space-y-1">
          <h1 className="font-heading text-[1.75rem] leading-tight font-bold">
            <Trans>Your paper wallet</Trans>
          </h1>
          <p className="text-muted-foreground text-sm">
            <Trans>
              Download or photograph this card. Anyone who scans the QR code will have full access
              to this wallet.
            </Trans>
          </p>
        </div>

        {card}

        {protectionControls}

        {downloadButton}

        {controls}

        <label className="mt-6 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={acked}
            disabled={!paperWalletReady || paperWalletEncrypting}
            onChange={(e) => setAcked(e.target.checked)}
            className="accent-primary mt-0.5 size-4 cursor-pointer"
          />
          <span className="text-muted-foreground text-sm">
            <Trans>I have saved this key. If lost, my wallet cannot be recovered.</Trans>
          </span>
        </label>

        <Button
          className="mt-4 h-11 w-full"
          disabled={!acked || connecting || !paperWalletReady || paperWalletEncrypting}
          onClick={handleContinue}
        >
          {connecting ? <FiLoader className="mr-2 size-4 animate-spin" /> : null}
          {connecting ? t`Connecting...` : t`Continue`}
        </Button>
        {connectError ? <p className="text-destructive mt-2 text-xs">{connectError}</p> : null}
      </div>
    </div>
  );
}
