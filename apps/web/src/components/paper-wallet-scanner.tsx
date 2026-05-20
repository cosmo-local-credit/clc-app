import { Html5Qrcode } from "html5-qrcode";
import { Camera, LoaderCircle, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "#/components/ui";

type ScanMode = "choose" | "camera" | "upload";

interface PaperWalletScannerProps {
	onKeyDecoded: (key: string) => void;
	onCancel: () => void;
}

const SCANNER_ELEMENT_ID = "paper-wallet-scanner";

export function PaperWalletScanner({
	onKeyDecoded,
	onCancel,
}: PaperWalletScannerProps) {
	const [mode, setMode] = useState<ScanMode>("choose");
	const [error, setError] = useState<string | null>(null);
	const [cameraStarting, setCameraStarting] = useState(false);
	const scannerRef = useRef<Html5Qrcode | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Cleanup scanner on unmount
	useEffect(() => {
		return () => {
			const scanner = scannerRef.current;
			if (scanner) {
				scannerRef.current = null;
				if (scanner.isScanning) {
					scanner
						.stop()
						.then(() => scanner.clear())
						.catch(() => {});
				} else {
					try {
						scanner.clear();
					} catch {}
				}
			}
		};
	}, []);

	const handleCameraScan = useCallback(async () => {
		setError(null);
		setCameraStarting(true);
		setMode("camera");

		const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
		scannerRef.current = scanner;

		try {
			const devices = await Html5Qrcode.getCameras();
			if (!devices.length) {
				setError("No camera found on this device.");
				setCameraStarting(false);
				return;
			}

			// Prefer back camera
			const backCamera =
				devices.find(
					(d) =>
						d.label.toLowerCase().includes("back") ||
						d.label.toLowerCase().includes("rear") ||
						d.label.toLowerCase().includes("environment"),
				) ?? devices[0];

			await scanner.start(
				backCamera.id,
				{ fps: 10, qrbox: { width: 250, height: 250 } },
				(decodedText) => {
					onKeyDecoded(decodedText);
					scanner.stop().then(() => scanner.clear());
					scannerRef.current = null;
				},
				() => {
					// Scanning... ignore continuous failures
				},
			);
		} catch (err) {
			scannerRef.current = null;
			const msg =
				err instanceof DOMException && err.name === "NotAllowedError"
					? "Camera access denied."
					: err instanceof Error
						? err.message
						: "Failed to start camera.";
			setError(msg);
		} finally {
			setCameraStarting(false);
		}
	}, [onKeyDecoded]);

	const handleFileUpload = useCallback(
		async (event: React.ChangeEvent<HTMLInputElement>) => {
			setError(null);
			const file = event.target.files?.[0];
			if (!file) return;

			const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
			scannerRef.current = scanner;

			try {
				const decoded = await scanner.scanFile(file, false);
				onKeyDecoded(decoded);
			} catch {
				setError("No QR code found. Try again with a clearer image.");
			} finally {
				scannerRef.current = null;
				// Reset file input so the same file can be re-selected
				if (fileInputRef.current) fileInputRef.current.value = "";
			}
		},
		[onKeyDecoded],
	);

	const handleCancel = useCallback(() => {
		const scanner = scannerRef.current;
		if (scanner) {
			scanner
				.stop()
				.then(() => scanner.clear())
				.catch(() => {})
				.finally(() => {
					scannerRef.current = null;
				});
		}
		setError(null);
		setMode("choose");
	}, []);

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<p className="text-sm font-medium">Paper Wallet</p>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Close paper wallet scanner"
					onClick={onCancel}
				>
					<X className="size-4" />
				</Button>
			</div>

			{/*
				Mount point for html5-qrcode.
				Visible during camera mode so the video feed renders.
				Visually hidden but still in DOM during upload mode
				so scanFile can use the internal canvas.
			*/}
			<div
				id={SCANNER_ELEMENT_ID}
				className={mode !== "camera" ? "sr-only size-0 overflow-hidden" : ""}
			/>

			{mode === "choose" ? (
				<div className="space-y-2">
					<Button
						className="h-11 w-full"
						onClick={handleCameraScan}
						disabled={cameraStarting}
					>
						<Camera className="mr-2 size-4" />
						Scan QR Code
					</Button>
					<Button
						variant="outline"
						className="h-11 w-full"
						onClick={() => {
							setMode("upload");
							setError(null);
						}}
					>
						<Upload className="mr-2 size-4" />
						Upload Image
					</Button>
				</div>
			) : mode === "camera" ? (
				<div className="space-y-3">
					{cameraStarting ? (
						<div className="flex h-[280px] items-center justify-center rounded-none border border-border bg-card">
							<LoaderCircle className="size-6 animate-spin text-muted-foreground" />
						</div>
					) : null}
					{error && cameraStarting === false ? (
						<div className="space-y-2">
							<p className="text-xs text-destructive">{error}</p>
							{error === "Camera access denied." ? (
								<Button
									variant="outline"
									className="h-11 w-full"
									onClick={() => {
										setMode("upload");
										setError(null);
									}}
								>
									<Upload className="mr-2 size-4" />
									Upload Image Instead
								</Button>
							) : null}
						</div>
					) : null}
					<Button variant="ghost" className="w-full" onClick={handleCancel}>
						Back
					</Button>
				</div>
			) : mode === "upload" ? (
				<div className="space-y-3">
					<input
						ref={fileInputRef}
						type="file"
						accept="image/*"
						onChange={handleFileUpload}
						className="hidden"
						aria-label="Upload QR code image"
					/>
					<Button
						variant="outline"
						className="h-11 w-full"
						onClick={() => fileInputRef.current?.click()}
					>
						<Upload className="mr-2 size-4" />
						Choose Image
					</Button>
					{error ? <p className="text-xs text-destructive">{error}</p> : null}
					<Button variant="ghost" className="w-full" onClick={handleCancel}>
						Back
					</Button>
				</div>
			) : null}
		</div>
	);
}
