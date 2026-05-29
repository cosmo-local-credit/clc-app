import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { connect } from "wagmi/actions";

import { Button } from "#/components/ui/button";
import { clearPrivateKey, storePrivateKey } from "#/connectors/privateKey";
import { buildPaperWalletUrl } from "#/lib/paper-wallet";
import { pkConnector, wagmiConfig } from "#/providers/web3-config";
import { usePaperWalletSetup } from "./paper-wallet-setup";

type Props = {
	onBack: () => void;
};

export function PaperWalletCreate({ onBack }: Props) {
	const keyRef = useRef<`0x${string}` | null>(null);
	if (!keyRef.current) keyRef.current = generatePrivateKey();
	const key = keyRef.current;

	const account = useMemo(() => privateKeyToAccount(key), [key]);
	const address = account.address;
	const qrUrl = buildPaperWalletUrl(key);

	const { card, controls, downloadButton } = usePaperWalletSetup({
		address,
		qrUrl,
		defaultName: "Paper wallet",
	});

	const [acked, setAcked] = useState(false);
	const [connecting, setConnecting] = useState(false);
	const [connectError, setConnectError] = useState<string | null>(null);

	async function handleContinue() {
		setConnecting(true);
		setConnectError(null);
		try {
			storePrivateKey(key);
			await connect(wagmiConfig, { connector: pkConnector });
		} catch (err) {
			clearPrivateKey();
			setConnectError(
				err instanceof Error ? err.message : "Connection failed.",
			);
			setConnecting(false);
		}
	}

	return (
		<div className="flex min-h-[100svh] flex-col bg-background">
			<div className="flex flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+1rem)]">
				<button
					type="button"
					onClick={onBack}
					className="-ml-2 mb-3 flex h-11 items-center gap-1.5 self-start px-2 text-sm text-muted-foreground hover:text-foreground"
					aria-label="Go back"
				>
					<ArrowLeft className="size-4" />
					Back
				</button>

				<div className="mb-5 space-y-1">
					<h1 className="font-heading text-[1.75rem] font-bold leading-tight">
						Your paper wallet
					</h1>
					<p className="text-sm text-muted-foreground">
						Download or photograph this card. Anyone who scans the QR code will
						have full access to this wallet.
					</p>
				</div>

				{card}

				{downloadButton}

				{controls}

				<label className="mt-6 flex cursor-pointer items-start gap-3">
					<input
						type="checkbox"
						checked={acked}
						onChange={(e) => setAcked(e.target.checked)}
						className="mt-0.5 size-4 cursor-pointer accent-primary"
					/>
					<span className="text-sm text-muted-foreground">
						I have saved this key. If lost, my wallet cannot be recovered.
					</span>
				</label>

				<Button
					className="mt-4 h-11 w-full"
					disabled={!acked || connecting}
					onClick={handleContinue}
				>
					{connecting ? (
						<LoaderCircle className="mr-2 size-4 animate-spin" />
					) : null}
					{connecting ? "Connecting..." : "Continue"}
				</Button>
				{connectError ? (
					<p className="mt-2 text-xs text-destructive">{connectError}</p>
				) : null}
			</div>
		</div>
	);
}
