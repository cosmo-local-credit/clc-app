import { Link, useNavigate } from "@tanstack/react-router";
import { ConnectKitButton } from "connectkit";
import { KeyRound, LoaderCircle, ScanLine, Wallet, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FaApple, FaGoogle } from "react-icons/fa";
import { useAccount, useConnect } from "wagmi";
import { connect } from "wagmi/actions";
import { PaperWalletScanner } from "#/components/paper-wallet-scanner";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { normalizePrivateKey } from "#/connectors/normalize-private-key";
import { clearPrivateKey, storePrivateKey } from "#/connectors/privateKey";
import { useSiweAuth } from "#/features/auth/hooks/use-siwe-auth";
import { createRelayerClient } from "#/features/webauthn/api/relayer-client";
import { useCaliburRecovery } from "#/features/webauthn/hooks/use-calibur-recovery";
import { usePlatformPasskeyLabel } from "#/features/webauthn/hooks/use-platform-passkey-label";
import { caliburConnector, pkConnector, wagmiConfig } from "#/providers/web3";

// ── Constants ──────────────────────────────────────────────────────────────────

const RELAYER_URL: string =
	(import.meta.env.VITE_RELAYER_URL as string | undefined) ??
	"http://192.168.1.20:5003/api/v2/relayer";

const relayerClient = createRelayerClient(RELAYER_URL);

// ── Signin flow ────────────────────────────────────────────────────────────────

export function SigninFlow() {
	const { isConnected } = useAccount();
	const navigate = useNavigate();
	const { connect: wagmiConnect } = useConnect();
	const siweAttempted = useRef(false);

	const [showScanner, setShowScanner] = useState(false);
	const [showPkInput, setShowPkInput] = useState(false);
	const [pkInput, setPkInput] = useState("");
	const [pkError, setPkError] = useState<string | null>(null);
	const [pkConnecting, setPkConnecting] = useState(false);

	const { authenticate } = useSiweAuth();

	const {
		step: recoveryStep,
		outcome,
		error: recoveryError,
		recover,
	} = useCaliburRecovery(relayerClient);

	const { provider } = usePlatformPasskeyLabel();
	const ProviderIcon = provider === "apple" ? FaApple : FaGoogle;
	const providerLabel = provider === "apple" ? "Apple ID" : "Google";

	const isRecovering = ["challenging", "asserting", "verifying"].includes(
		recoveryStep,
	);

	// After wallet connects, run SIWE once to establish a backend session.
	useEffect(() => {
		if (isConnected && !siweAttempted.current) {
			siweAttempted.current = true;
			void authenticate().catch((err: unknown) => {
				console.warn("[signin] SIWE auth failed:", err);
			});
		}
	}, [isConnected, authenticate]);

	// Navigate once connected
	useEffect(() => {
		if (isConnected) {
			void navigate({ to: "/", replace: true });
		}
	}, [isConnected, navigate]);

	// Connect calibur connector after passkey recovery completes
	useEffect(() => {
		if (recoveryStep === "done") {
			wagmiConnect({ connector: caliburConnector });
		}
	}, [recoveryStep, wagmiConnect]);

	async function connectWithKey(key: `0x${string}`) {
		setPkConnecting(true);
		setPkError(null);
		try {
			storePrivateKey(key);
			await connect(wagmiConfig, { connector: pkConnector });
			setPkInput("");
			setShowPkInput(false);
			setShowScanner(false);
		} catch (err) {
			clearPrivateKey();
			setPkError(err instanceof Error ? err.message : "Connection failed.");
		} finally {
			setPkConnecting(false);
		}
	}

	function handlePkSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setPkError(null);
		const result = normalizePrivateKey(pkInput);
		if (!result.ok) {
			setPkError(result.error);
			return;
		}
		void connectWithKey(result.key);
	}

	function handleKeyScanned(raw: string) {
		setPkError(null);
		const result = normalizePrivateKey(raw);
		if (!result.ok) {
			setPkError("This QR code does not contain a valid private key.");
			return;
		}
		void connectWithKey(result.key);
	}

	const connecting = isRecovering || pkConnecting;

	return (
		<div className="flex min-h-screen flex-col bg-background">
			<div className="flex flex-col px-6 pb-12 pt-20">
				<div className="mb-12 flex flex-col items-center gap-4 text-center">
					<div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-foreground text-background">
						<Wallet className="size-7" />
					</div>
					<div className="space-y-1">
						<h1 className="font-heading text-2xl font-semibold">Sign in</h1>
						<p className="text-sm text-muted-foreground">
							Access your wallet to continue.
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
						{/* Paper wallet scanner (expanded) */}
						{showScanner ? (
							<PaperWalletScanner
								onKeyDecoded={handleKeyScanned}
								onCancel={() => {
									setShowScanner(false);
									setPkError(null);
								}}
							/>
						) : null}

						{/* Private key input (expanded) */}
						{showPkInput ? (
							<form onSubmit={handlePkSubmit} className="space-y-3">
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
									onChange={(e) => setPkInput(e.target.value)}
									placeholder="0x…"
									className="font-mono"
									aria-label="Private key"
								/>
								<Button
									type="submit"
									disabled={!pkInput.trim()}
									className="h-11 w-full"
								>
									<KeyRound className="mr-2 size-4" />
									Sign in with private key
								</Button>
							</form>
						) : null}

						{/* Shared error display */}
						{pkError ? (
							<p className="text-xs text-destructive">{pkError}</p>
						) : null}

						{/* Passkey (primary) — always visible when not expanded */}
						{!showScanner && !showPkInput ? (
							<>
								<Button
									className="h-11 w-full"
									onClick={() => recover.mutate()}
									disabled={isRecovering}
								>
									<ProviderIcon className="mr-2 size-4" />
									Continue with {providerLabel}
								</Button>

								{/* Passkey not_found error */}
								{outcome === "not_found" ? (
									<div className="rounded-xl border border-border bg-card p-4 space-y-1">
										<p className="text-sm font-medium">No wallet found</p>
										<p className="text-xs text-muted-foreground">
											No passkey is registered with this device.{" "}
											<Link
												to="/signup"
												className="font-medium text-foreground underline-offset-4 hover:underline"
											>
												Create a new wallet
											</Link>
										</p>
										<button
											type="button"
											className="text-xs text-muted-foreground underline-offset-4 hover:underline"
											onClick={() => recover.mutate()}
										>
											Try a different passkey
										</button>
									</div>
								) : recoveryError ? (
									<p className="text-xs text-destructive">{recoveryError}</p>
								) : null}

								{/* Divider */}
								<div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
									<div className="h-px flex-1 bg-border" />
									<span>or</span>
									<div className="h-px flex-1 bg-border" />
								</div>

								{/* Paper wallet (primary) */}
								<Button
									className="h-11 w-full"
									onClick={() => {
										setShowScanner(true);
										setPkError(null);
									}}
								>
									<ScanLine className="mr-2 size-4" />
									Paper wallet
								</Button>

								{/* Divider */}
								<div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
									<div className="h-px flex-1 bg-border" />
									<span>or</span>
									<div className="h-px flex-1 bg-border" />
								</div>

								{/* ConnectKit (outline) */}
								<ConnectKitButton.Custom>
									{({ show }) => (
										<Button
											variant="outline"
											className="h-11 w-full"
											onClick={show}
										>
											<Wallet className="mr-2 size-4" />
											Connect wallet
										</Button>
									)}
								</ConnectKitButton.Custom>

								{/* Private key (outline) */}
								<Button
									variant="outline"
									className="h-11 w-full"
									onClick={() => {
										setShowPkInput(true);
										setPkError(null);
									}}
								>
									<KeyRound className="mr-2 size-4" />
									Private key
								</Button>

								{/* Sign-up link */}
								<p className="pt-2 text-center text-sm text-muted-foreground">
									Don't have an account?{" "}
									<Link
										to="/signup"
										className="font-medium text-foreground underline-offset-4 hover:underline"
									>
										Create a wallet
									</Link>
								</p>
							</>
						) : null}
					</div>
				)}
			</div>
		</div>
	);
}
