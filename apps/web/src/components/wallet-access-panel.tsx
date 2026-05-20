import { ConnectKitButton } from "connectkit";
import { KeyRound, LoaderCircle, Wallet, X } from "lucide-react";
import { useState } from "react";
import { connect } from "wagmi/actions";
import { Button, Input } from "#/components/ui";
import {
	clearPrivateKey,
	privateKeyConnector,
	storePrivateKey,
} from "#/connectors/privateKey";
import { wagmiConfig } from "#/providers/web3";

export function WalletAccessPanel() {
	const [pkInput, setPkInput] = useState("");
	const [pkError, setPkError] = useState<string | null>(null);
	const [showPkInput, setShowPkInput] = useState(false);
	const [connecting, setConnecting] = useState(false);

	async function handlePkConnect(event?: React.FormEvent<HTMLFormElement>) {
		event?.preventDefault();
		setPkError(null);

		const key = pkInput.trim() as `0x${string}`;
		if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
			setPkError("Invalid private key. Must be 0x-prefixed 64-char hex.");
			return;
		}

		setConnecting(true);
		try {
			storePrivateKey(key);
			await connect(wagmiConfig, { connector: privateKeyConnector() });
			setPkInput("");
			setShowPkInput(false);
		} catch (error) {
			clearPrivateKey();
			setPkError(error instanceof Error ? error.message : "Connection failed.");
		} finally {
			setConnecting(false);
		}
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

				<div className="space-y-3">
					<ConnectKitButton.Custom>
						{({ show }) => (
							<Button onClick={show} className="h-11 w-full" size="lg">
								<Wallet className="mr-2 size-4" />
								Connect Wallet
							</Button>
						)}
					</ConnectKitButton.Custom>

					<div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
						<div className="h-px flex-1 bg-border" />
						<span>or</span>
						<div className="h-px flex-1 bg-border" />
					</div>

					{showPkInput ? (
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
							{pkError ? (
								<p className="text-xs text-destructive">{pkError}</p>
							) : null}
							<Button
								type="submit"
								disabled={!pkInput.trim() || connecting}
								className="h-11 w-full"
							>
								{connecting ? (
									<>
										<LoaderCircle className="mr-2 size-4 animate-spin" />
										Connecting…
									</>
								) : (
									<>
										<KeyRound className="mr-2 size-4" />
										Sign In With Private Key
									</>
								)}
							</Button>
						</form>
					) : (
						<Button
							variant="outline"
							className="h-11 w-full"
							onClick={() => setShowPkInput(true)}
						>
							<KeyRound className="mr-2 size-4" />
							Private Key
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
