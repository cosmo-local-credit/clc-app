import { Wallet } from "lucide-react";
import QRCode from "qrcode";
import { forwardRef, type ReactNode, useEffect, useState } from "react";

import { PAPER_WALLET_ORIGIN } from "#/lib/paper-wallet";

// ── QR code generator ──────────────────────────────────────────────────────────

function useQrDataUrl(url: string): string | null {
	const [dataUrl, setDataUrl] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void QRCode.toDataURL(url, {
			type: "image/png",
			margin: 1,
			width: 256,
			color: { dark: "#000000", light: "#ffffff" },
		}).then((result) => {
			if (!cancelled) setDataUrl(result);
		});
		return () => {
			cancelled = true;
		};
	}, [url]);

	return dataUrl;
}

// ── Business-card component ────────────────────────────────────────────────────

export type PaperWalletCardProps = {
	/** The wallet address to display and encode in the QR code */
	address: `0x${string}`;
	/** Full URL encoded in the QR code */
	qrUrl: string;
	/** Optional logo override; defaults to a simple Wallet icon */
	logo?: ReactNode;
};

/**
 * Renders a business-card-sized wallet card suitable for html-to-image capture.
 *
 * Layout (left-to-right, top-to-bottom):
 *   [Logo / CLC App / URL] | [QR code]
 *   [full address]
 *
 * Forward ref so the parent can pass it to toPng().
 */
export const PaperWalletCard = forwardRef<HTMLDivElement, PaperWalletCardProps>(
	function PaperWalletCard({ address, qrUrl, logo }, ref) {
		const qrDataUrl = useQrDataUrl(qrUrl);

		return (
			<div
				ref={ref}
				// aspect-[7/4] = standard business card ratio (3.5 × 2 in)
				className="flex aspect-[7/4] w-full flex-col overflow-hidden rounded-xl border border-border bg-white"
				// Explicit white background for image capture
				style={{ backgroundColor: "#ffffff" }}
			>
				{/* Top row: branding + QR */}
				<div className="flex flex-1 min-h-0">
					{/* Left: logo + name + URL */}
					<div className="flex w-[38%] flex-col items-start justify-center gap-1.5 border-r border-gray-200 px-4 py-3">
						<div className="flex size-8 items-center justify-center rounded-lg bg-gray-900 text-white">
							{logo ?? <Wallet className="size-4" />}
						</div>
						<p
							className="font-heading text-sm font-semibold leading-tight text-gray-900"
							style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
						>
							CLC App
						</p>
						<p
							className="font-mono text-[9px] leading-tight text-gray-500 break-all"
							style={{ fontFamily: "JetBrains Mono, monospace" }}
						>
							{PAPER_WALLET_ORIGIN.replace(/^https?:\/\//, "")}
						</p>
					</div>

					{/* Right: QR code */}
					<div className="flex flex-1 items-center justify-center p-3">
						{qrDataUrl ? (
							<img
								src={qrDataUrl}
								alt="Wallet QR code"
								className="h-full w-auto max-h-full object-contain"
								// Prevent cross-origin tainting html-to-image
								crossOrigin="anonymous"
							/>
						) : (
							<div className="size-16 animate-pulse rounded bg-gray-100" />
						)}
					</div>
				</div>

				{/* Bottom: address */}
				<div className="border-t border-gray-200 px-4 py-2">
					<p
						className="truncate font-mono text-[9px] text-gray-600"
						style={{ fontFamily: "JetBrains Mono, monospace" }}
					>
						{address}
					</p>
				</div>
			</div>
		);
	},
);
