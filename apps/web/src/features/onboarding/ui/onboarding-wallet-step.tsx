import type { ProfileInput } from "@clc/core/features/signup/logic";
import { toPng } from "html-to-image";
import { ArrowLeft, Download, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FaApple, FaGoogle } from "react-icons/fa";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { connect } from "wagmi/actions";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { clearPrivateKey, storePrivateKey } from "#/connectors/privateKey";
import { createRelayerClient } from "#/features/webauthn/api/relayer-client";
import { useCaliburFromPk } from "#/features/webauthn/hooks/use-calibur-from-pk";
import {
	isPasskeyPlatformAvailable,
	pickPasskeyProvider,
} from "#/features/webauthn/hooks/use-platform-passkey-label";
import { buildPaperWalletUrl } from "#/lib/paper-wallet";
import {
	caliburConnector,
	pkConnector,
	wagmiConfig,
} from "#/providers/web3-config";
import { PaperWalletCard } from "./paper-wallet-card";

const RELAYER_URL: string =
	(import.meta.env.VITE_RELAYER_URL as string | undefined) ??
	"http://192.168.1.20:5003/api/v2/relayer";

const relayerClient = createRelayerClient(RELAYER_URL);

type Props = {
	profileData: ProfileInput;
	onBack: () => void;
	onDone: () => void;
};

export function OnboardingWalletStep({ profileData, onBack, onDone }: Props) {
	const keyRef = useRef<`0x${string}` | null>(null);
	if (!keyRef.current) keyRef.current = generatePrivateKey();
	const pk = keyRef.current;

	const account = useMemo(() => privateKeyToAccount(pk), [pk]);
	const address = account.address;
	const qrUrl = buildPaperWalletUrl(pk);

	const cardRef = useRef<HTMLDivElement>(null);
	const [acked, setAcked] = useState(false);
	const [downloading, setDownloading] = useState(false);
	const [downloadError, setDownloadError] = useState<string | null>(null);
	const [connecting, setConnecting] = useState(false);
	const [connectError, setConnectError] = useState<string | null>(null);
	const [linkConnectError, setLinkConnectError] = useState<string | null>(null);
	const [walletLabel, setWalletLabel] = useState("");
	const cardLabel = walletLabel.trim() || profileData.name;

	const available = isPasskeyPlatformAvailable();
	const provider = pickPasskeyProvider();
	const ProviderIcon = provider === "apple" ? FaApple : FaGoogle;
	const providerLabel = provider === "apple" ? "Apple ID" : "Google";

	const {
		step: upgradeStep,
		error: upgradeError,
		upgradeAndLink,
	} = useCaliburFromPk(pk, relayerClient);

	const isUpgrading = [
		"authorizing",
		"creating-passkey",
		"registering",
	].includes(upgradeStep);
	const isLinked = upgradeStep === "done";

	useEffect(() => {
		if (upgradeStep === "done") {
			setLinkConnectError(null);
			void connect(wagmiConfig, { connector: caliburConnector })
				.then(() => {
					onDone();
				})
				.catch((err: unknown) => {
					setLinkConnectError(
						err instanceof Error
							? err.message
							: "Passkey linked, but wallet connection failed.",
					);
				});
		}
	}, [upgradeStep, onDone]);

	async function handleDownload() {
		if (!cardRef.current) return;
		setDownloading(true);
		setDownloadError(null);
		try {
			const dataUrl = await toPng(cardRef.current, { pixelRatio: 3 });
			const a = document.createElement("a");
			a.href = dataUrl;
			a.download = `clc-wallet-${address.slice(2, 10)}.png`;
			a.click();
		} catch {
			setDownloadError("Download failed. Try a screenshot instead.");
		} finally {
			setDownloading(false);
		}
	}

	async function handleContinue() {
		setConnecting(true);
		setConnectError(null);
		try {
			storePrivateKey(pk);
			console.log("[onboarding] profile saved:", profileData);
			await connect(wagmiConfig, { connector: pkConnector });
			onDone();
		} catch (err) {
			clearPrivateKey();
			setConnectError(
				err instanceof Error ? err.message : "Connection failed.",
			);
			setConnecting(false);
		}
	}

	return (
		<div className="flex min-h-screen flex-col bg-background">
			<div className="flex flex-col px-6 pb-12 pt-12">
				<button
					type="button"
					onClick={onBack}
					className="mb-8 flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground"
					aria-label="Back"
				>
					<ArrowLeft className="size-4" />
					Back
				</button>

				<div className="mb-6 space-y-1">
					<h1 className="font-heading text-2xl font-semibold">
						Your paper wallet
					</h1>
					<p className="text-sm text-muted-foreground">
						Download or photograph this card. Anyone who scans the QR code will
						have full access to this wallet.
					</p>
				</div>

				<div className="mb-4 space-y-2">
					<label
						htmlFor="paper-wallet-label"
						className="text-sm font-medium text-foreground"
					>
						Name on wallet
					</label>
					<Input
						id="paper-wallet-label"
						value={walletLabel}
						onChange={(event) => setWalletLabel(event.target.value)}
						placeholder={profileData.name}
					/>
				</div>

				<PaperWalletCard
					ref={cardRef}
					address={address}
					qrUrl={qrUrl}
					label={cardLabel}
				/>

				<Button
					className="mt-4 h-11 w-full"
					onClick={handleDownload}
					disabled={downloading}
					aria-label="Download card"
				>
					{downloading ? (
						<LoaderCircle className="mr-2 size-4 animate-spin" />
					) : (
						<Download className="mr-2 size-4" />
					)}
					{downloading ? "Preparing…" : "Download card"}
				</Button>
				{downloadError ? (
					<p className="mt-2 text-xs text-destructive">{downloadError}</p>
				) : null}

				<label className="mt-6 flex cursor-pointer items-start gap-3">
					<input
						type="checkbox"
						aria-label="I have saved this key"
						checked={acked}
						onChange={(e) => setAcked(e.target.checked)}
						className="mt-0.5 size-4 cursor-pointer accent-primary"
					/>
					<span className="text-sm text-muted-foreground">
						I have saved this key. If lost, my wallet cannot be recovered.
					</span>
				</label>

				<div className="mt-4 space-y-3">
					{available ? (
						<Button
							className="h-11 w-full"
							onClick={() => upgradeAndLink.mutate()}
							disabled={isUpgrading || isLinked}
						>
							{isUpgrading ? (
								<LoaderCircle className="mr-2 size-4 animate-spin" />
							) : (
								<ProviderIcon className="mr-2 size-4" />
							)}
							{isUpgrading
								? "Linking passkey..."
								: isLinked
									? "Passkey linked"
									: `Link wallet to ${providerLabel} passkey`}
						</Button>
					) : null}

					{upgradeError ? (
						<p className="text-xs text-destructive">{upgradeError}</p>
					) : null}
					{linkConnectError ? (
						<p className="text-xs text-destructive">{linkConnectError}</p>
					) : null}

					<button
						type="button"
						className="w-full py-2 text-center text-sm font-medium text-foreground underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-50"
						disabled={!acked || connecting || isUpgrading || isLinked}
						onClick={handleContinue}
					>
						{connecting ? (
							<LoaderCircle className="mr-2 inline size-4 animate-spin" />
						) : null}
						{connecting
							? "Opening paper wallet..."
							: available
								? "Continue with paper wallet only"
								: "Continue to wallet"}
					</button>
					{connectError ? (
						<p className="text-xs text-destructive">{connectError}</p>
					) : null}
				</div>
			</div>
		</div>
	);
}
