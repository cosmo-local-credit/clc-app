import { Link, useNavigate } from "@tanstack/react-router";
import { KeyRound, LoaderCircle, ScanLine, UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FaApple, FaGoogle } from "react-icons/fa";
import { useAccount, useConnect } from "wagmi";
import { connect as connectAction } from "wagmi/actions";

import { PaperWalletScanner } from "#/components/paper-wallet-scanner";
import { Button } from "#/components/ui/button";
import { CLCLogo } from "#/components/ui/clc-logo";
import { Input } from "#/components/ui/input";
import { normalizePrivateKey } from "#/connectors/normalize-private-key";
import { clearPrivateKey, storePrivateKey } from "#/connectors/privateKey";
import { useSiweAuth } from "#/features/auth/hooks/use-siwe-auth";
import { createRelayerClient } from "#/features/webauthn/api/relayer-client";
import { useCaliburRecovery } from "#/features/webauthn/hooks/use-calibur-recovery";
import { usePlatformPasskeyLabel } from "#/features/webauthn/hooks/use-platform-passkey-label";
import {
	caliburConnector,
	pkConnector,
	wagmiConfig,
} from "#/providers/web3-config";

const RELAYER_URL: string =
	(import.meta.env.VITE_RELAYER_URL as string | undefined) ??
	"http://192.168.1.20:5003/api/v2/relayer";

const relayerClient = createRelayerClient(RELAYER_URL);

export function LandingPage() {
	const navigate = useNavigate();
	const { connect: wagmiConnect } = useConnect();
	const { isConnected } = useAccount();
	const siweAttempted = useRef(false);
	const { authenticate } = useSiweAuth();
	const [showScanner, setShowScanner] = useState(false);
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [showPkInput, setShowPkInput] = useState(false);
	const [pkInput, setPkInput] = useState("");
	const [pkError, setPkError] = useState<string | null>(null);
	const [pkConnecting, setPkConnecting] = useState(false);

	const {
		available,
		provider,
		label: providerLabel,
	} = usePlatformPasskeyLabel();
	const ProviderIcon = provider === "apple" ? FaApple : FaGoogle;

	const {
		step: recoveryStep,
		outcome,
		error: recoveryError,
		recover,
	} = useCaliburRecovery(relayerClient);

	const isRecovering = ["challenging", "asserting", "verifying"].includes(
		recoveryStep,
	);
	const connecting = isRecovering || pkConnecting;

	useEffect(() => {
		if (recoveryStep === "done") {
			wagmiConnect({ connector: caliburConnector });
		}
	}, [recoveryStep, wagmiConnect]);

	useEffect(() => {
		if (isConnected && !siweAttempted.current) {
			siweAttempted.current = true;
			void authenticate().catch((err: unknown) => {
				console.warn("[landing] SIWE auth failed:", err);
			});
		}
	}, [isConnected, authenticate]);

	async function connectWithKey(key: `0x${string}`) {
		setPkConnecting(true);
		setPkError(null);
		try {
			storePrivateKey(key);
			await connectAction(wagmiConfig, { connector: pkConnector });
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

	return (
		<div className="flex min-h-[100svh] flex-col bg-background px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-12 sm:min-h-screen sm:pb-12 sm:pt-20">
			<div className="flex flex-col items-center gap-5 text-center">
				<CLCLogo className="size-20" />
				<div className="space-y-1">
					<h1 className="font-heading text-[1.75rem] font-semibold leading-tight">
						CLC
					</h1>
					<p className="text-sm text-muted-foreground">
						Route redeemable claims across curated markets with shared
						standards.
					</p>
				</div>
			</div>

			<div className="mt-auto space-y-3 pb-2 pt-8 sm:pt-16">
				{connecting ? (
					<div className="flex flex-col items-center gap-2 py-3">
						<LoaderCircle className="size-6 animate-spin text-primary" />
						<p className="text-sm text-muted-foreground">Connecting...</p>
					</div>
				) : null}

				{showScanner && !connecting ? (
					<PaperWalletScanner
						onKeyDecoded={handleKeyScanned}
						onCancel={() => {
							setShowScanner(false);
							setPkError(null);
						}}
					/>
				) : null}

				{!showScanner && !showPkInput && !connecting ? (
					<Button
						className="h-11 w-full bg-foreground text-background hover:bg-foreground/90"
						onClick={() => void navigate({ to: "/onboarding" })}
					>
						<UserPlus className="mr-2 size-4" aria-hidden="true" />
						Create an account
					</Button>
				) : null}

				{outcome === "not_found" ? (
					<div className="rounded-xl border border-border bg-card p-4 space-y-1">
						<p className="text-sm font-medium">No passkey found</p>
						<p className="text-xs text-muted-foreground">
							No passkey is registered on this device.{" "}
							<Link
								to="/onboarding"
								className="font-medium text-foreground underline-offset-4 hover:underline"
							>
								Create an account
							</Link>{" "}
							or{" "}
							<button
								type="button"
								className="font-medium text-foreground underline-offset-4 hover:underline"
								onClick={() => recover.mutate()}
							>
								try again
							</button>
						</p>
					</div>
				) : recoveryError ? (
					<p className="text-xs text-destructive">{recoveryError}</p>
				) : null}

				{!showScanner && !showPkInput && !connecting ? (
					<>
						<div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
							<div className="h-px flex-1 bg-border" />
							<span>or</span>
							<div className="h-px flex-1 bg-border" />
						</div>

						{available ? (
							<Button
								className="h-11 w-full"
								onClick={() => recover.mutate()}
								disabled={isRecovering}
							>
								{isRecovering ? null : <ProviderIcon className="mr-2 size-4" />}
								{isRecovering
									? "Connecting..."
									: `Continue with ${providerLabel}`}
							</Button>
						) : null}

						<Button
							className="h-11 w-full"
							onClick={() => {
								setShowScanner(true);
								setPkError(null);
							}}
						>
							<ScanLine className="mr-2 size-4" />
							Continue with Paper Wallet
						</Button>

						<button
							type="button"
							className="w-full pt-1 text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
							onClick={() => {
								setShowAdvanced((current) => !current);
								setShowPkInput(false);
								setPkError(null);
							}}
						>
							Advanced options
						</button>

						{showAdvanced ? (
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
						) : null}
					</>
				) : null}

				{showPkInput && !connecting ? (
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
							Sign in with private key
						</Button>
					</form>
				) : null}

				{pkError ? <p className="text-xs text-destructive">{pkError}</p> : null}
			</div>
		</div>
	);
}
