import { ConnectKitButton } from "connectkit";
import { KeyRound, LoaderCircle, ScanLine, Wallet, X } from "lucide-react";
import { useState } from "react";
import { connect } from "wagmi/actions";
import { PaperWalletScanner } from "#/components/paper-wallet-scanner";
import { Button, Input } from "#/components/ui";
import { normalizePrivateKey } from "#/connectors/normalize-private-key";
import {
	clearPrivateKey,
	privateKeyConnector,
	storePrivateKey,
} from "#/connectors/privateKey";
import { createRelayerClient } from "#/features/webauthn/api/relayer-client";
import { SignupWithPasskey } from "#/features/webauthn/ui/signup-with-passkey";
import { wagmiConfig } from "#/providers/web3";

const RELAYER_URL =
	import.meta.env.VITE_RELAYER_URL ?? "http://localhost:3001/api/v2/relayer";
const relayerClient = createRelayerClient(RELAYER_URL);

export function WalletAccessPanel() {
	const [pkInput, setPkInput] = useState("");
	const [pkError, setPkError] = useState<string | null>(null);
	const [showPkInput, setShowPkInput] = useState(false);
	const [showPaperWallet, setShowPaperWallet] = useState(false);
	const [connecting, setConnecting] = useState(false);

	async function connectWithKey(key: `0x${string}`) {
		setConnecting(true);
		try {
			storePrivateKey(key);
			await connect(wagmiConfig, { connector: privateKeyConnector() });
			setPkInput("");
			setShowPkInput(false);
			setShowPaperWallet(false);
		} catch (error) {
			clearPrivateKey();
			setPkError(error instanceof Error ? error.message : "Connection failed.");
		} finally {
			setConnecting(false);
		}
	}

	async function handlePkConnect(event?: React.FormEvent<HTMLFormElement>) {
		event?.preventDefault();
		setPkError(null);

		const result = normalizePrivateKey(pkInput);
		if (!result.ok) {
			setPkError(result.error);
			return;
		}

		await connectWithKey(result.key);
	}

	function handleKeyScanned(raw: string) {
		setPkError(null);
		const result = normalizePrivateKey(raw);
		if (!result.ok) {
			setPkError("This QR code does not contain a valid private key.");
			return;
		}
		connectWithKey(result.key);
	}

	return (
		<div className="flex min-h-screen flex-col bg-background">
			<div className="flex flex-col px-6 pb-12 pt-20">
				<div className="mb-12 flex flex-col items-center gap-4 text-center">
					<div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-foreground text-background">
						<Wallet className="size-7" />
					</div>
					<div className="space-y-1">
						<h1 className="font-heading text-2xl font-semibold">
							Connect your wallet
						</h1>
						<p className="text-sm text-muted-foreground">
							Sign in to start exchanging vouchers and joining pools.
						</p>
					</div>
				</div>

				{connecting ? (
					<div className="flex flex-col items-center gap-2 py-8">
						<LoaderCircle className="size-6 animate-spin text-primary" />
						<p className="text-sm text-muted-foreground">Connecting…</p>
					</div>
				) : (
					<div className="space-y-3">
						{showPaperWallet ? (
							<PaperWalletScanner
								onKeyDecoded={handleKeyScanned}
								onCancel={() => {
									setShowPaperWallet(false);
									setPkError(null);
								}}
							/>
						) : showPkInput ? (
							<form onSubmit={handlePkConnect} className="space-y-3">
								<div className="flex items-center justify-between">
									<p className="text-sm font-medium">Private key</p>
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label="Close private key form"
										onClick={() => {
											setShowPkInput(false);
											setPkInput("");
											setPkError(null);
										}}
									>
										<X className="size-4" />
									</Button>
								</div>
								<Input
									type="password"
									autoComplete="off"
									value={pkInput}
									onChange={(event) => setPkInput(event.target.value)}
									placeholder="0x..."
									className="font-mono"
									aria-label="Private key"
								/>
								<Button
									type="submit"
									disabled={!pkInput.trim()}
									className="h-11 w-full"
								>
									<KeyRound className="mr-2 size-4" />
									Sign In With Private Key
								</Button>
							</form>
						) : null}

						{pkError ? (
							<p className="text-xs text-destructive">{pkError}</p>
						) : null}

						{!showPaperWallet && !showPkInput ? (
							<SignupWithPasskey client={relayerClient} onSuccess={() => {}} />
						) : null}

						{!showPaperWallet && !showPkInput ? (
							<div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
								<div className="h-px flex-1 bg-border" />
								<span>or</span>
								<div className="h-px flex-1 bg-border" />
							</div>
						) : null}

						{!showPaperWallet && !showPkInput ? (
							<Button
								className="h-11 w-full"
								onClick={() => {
									setShowPaperWallet(true);
									setPkError(null);
								}}
							>
								<ScanLine className="mr-2 size-4" />
								Paper Wallet
							</Button>
						) : null}

						{!showPaperWallet && !showPkInput ? (
							<>
								<div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
									<div className="h-px flex-1 bg-border" />
									<span>or</span>
									<div className="h-px flex-1 bg-border" />
								</div>

								<ConnectKitButton.Custom>
									{({ show }) => (
										<Button
											variant="outline"
											className="h-11 w-full"
											onClick={show}
										>
											<Wallet className="mr-2 size-4" />
											Connect Wallet
										</Button>
									)}
								</ConnectKitButton.Custom>

								<Button
									variant="outline"
									className="h-11 w-full"
									onClick={() => {
										setShowPkInput(true);
										setPkError(null);
									}}
								>
									<KeyRound className="mr-2 size-4" />
									Private Key
								</Button>
							</>
						) : null}
					</div>
				)}
			</div>
		</div>
	);
}
