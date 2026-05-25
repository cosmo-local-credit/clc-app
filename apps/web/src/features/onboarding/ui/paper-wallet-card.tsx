import QRCode from "qrcode";
import { forwardRef, type ReactNode, useEffect, useState } from "react";

import { CLCLogo } from "#/components/ui/clc-logo";

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

export type PaperWalletCardProps = {
	/** The wallet address to display and encode in the QR code */
	address: `0x${string}`;
	/** Full URL encoded in the QR code */
	qrUrl: string;
	/** Human-readable label printed on the card */
	label: string;
	/** Optional logo override; defaults to CLC logo */
	logo?: ReactNode;
};

/**
 * Renders a business-card-sized wallet card suitable for html-to-image capture.
 *
 * Layout:
 *   [logo + label] | [QR code]
 *   [address]
 *
 * Forward ref so the parent can pass it to toPng().
 */
export const PaperWalletCard = forwardRef<HTMLDivElement, PaperWalletCardProps>(
	function PaperWalletCard({ address, qrUrl, label, logo }, ref) {
		const qrDataUrl = useQrDataUrl(qrUrl);

		return (
			<div
				ref={ref}
				className="grid aspect-[7/4] w-full grid-rows-[1fr_auto] overflow-hidden rounded-lg border border-dotted border-gray-300 bg-white px-5 py-4"
				style={{ backgroundColor: "#ffffff" }}
			>
				<div className="grid min-h-0 grid-cols-[40%_60%] gap-4">
					<div className="flex min-w-0 flex-col justify-between pr-2">
						<div className="flex size-16 shrink-0 items-center justify-center">
							{logo ?? <CLCLogo className="size-16" />}
						</div>
						<p
							className="break-words font-heading text-[1.05rem] font-semibold leading-tight text-gray-800"
							style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
						>
							{label}
						</p>
					</div>

					<div className="flex min-h-0 items-center justify-end">
						{qrDataUrl ? (
							<img
								src={qrDataUrl}
								alt="Wallet QR code"
								className="aspect-square h-auto w-full max-w-[178px] object-contain"
								crossOrigin="anonymous"
							/>
						) : (
							<div className="size-16 animate-pulse rounded bg-gray-100" />
						)}
					</div>
				</div>

				<p
					className="mt-3 break-all font-mono text-[0.78rem] leading-tight text-gray-600"
					style={{ fontFamily: "JetBrains Mono, monospace" }}
				>
					{address}
				</p>
			</div>
		);
	},
);
