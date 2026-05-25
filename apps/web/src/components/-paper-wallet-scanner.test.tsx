import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockScanFile, mockClear } = vi.hoisted(() => ({
	mockScanFile: vi.fn(),
	mockClear: vi.fn(),
}));

vi.mock("html5-qrcode", () => {
	return {
		Html5Qrcode: class {
			scanFile = mockScanFile;
			clear = mockClear;
			start = vi.fn().mockResolvedValue(undefined);
			stop = vi.fn().mockResolvedValue(undefined);
			isScanning = false;
			getState = vi.fn(() => 0);
		},
	};
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_IMAGE = join(
	__dirname,
	"../connectors/0xaCB673ea3B8B868cAb37c1bEb59E66Af31dE2e87.png",
);

import { PaperWalletScanner } from "#/components/paper-wallet-scanner";

describe("PaperWalletScanner", () => {
	const onKeyDecoded = vi.fn();
	const onCancel = vi.fn();

	beforeEach(() => {
		onKeyDecoded.mockReset();
		onCancel.mockReset();
		mockScanFile.mockReset();
		mockClear.mockReset();
	});

	it("returns to choose mode when Back is clicked", () => {
		render(
			<PaperWalletScanner onKeyDecoded={onKeyDecoded} onCancel={onCancel} />,
		);

		fireEvent.click(screen.getByRole("button", { name: /upload image/i }));
		expect(screen.getByRole("button", { name: /choose image/i })).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /back/i }));

		expect(screen.getByRole("button", { name: /scan qr code/i })).toBeTruthy();
		expect(screen.getByRole("button", { name: /upload image/i })).toBeTruthy();
	});

	it("decodes a QR code from an uploaded image and calls onKeyDecoded", async () => {
		const decodedAddress = "0xaCB673ea3B8B868cAb37c1bEb59E66Af31dE2e87";

		let resolveScan: (value: string) => void;
		mockScanFile.mockReturnValue(
			new Promise<string>((resolve) => {
				resolveScan = resolve;
			}),
		);

		const { container } = render(
			<PaperWalletScanner onKeyDecoded={onKeyDecoded} onCancel={onCancel} />,
		);

		await act(() => {
			fireEvent.click(screen.getByRole("button", { name: /upload image/i }));
		});

		const pngBuffer = readFileSync(TEST_IMAGE);
		const file = new File([pngBuffer], "test-qr.png", { type: "image/png" });
		const fileInput = screen.getByLabelText(/upload qr code image/i);

		await act(() => {
			fireEvent.change(fileInput, { target: { files: [file] } });
		});

		await act(() => {
			resolveScan?.(decodedAddress);
		});

		expect(onKeyDecoded).toHaveBeenCalledWith(decodedAddress);
		expect(container).toBeTruthy();
	});

	it("shows an error when uploaded image has no QR code", async () => {
		let rejectScan: (error: Error) => void;
		mockScanFile.mockReturnValue(
			new Promise((_, reject) => {
				rejectScan = reject;
			}),
		);

		const { container } = render(
			<PaperWalletScanner onKeyDecoded={onKeyDecoded} onCancel={onCancel} />,
		);

		await act(() => {
			fireEvent.click(screen.getByRole("button", { name: /upload image/i }));
		});

		const file = new File(["not-an-image"], "blank.png", { type: "image/png" });
		const fileInput = screen.getByLabelText(/upload qr code image/i);

		await act(() => {
			fireEvent.change(fileInput, { target: { files: [file] } });
		});

		await act(() => {
			rejectScan?.(new Error("QR parse error"));
		});

		expect(container.querySelector(".text-destructive")).toBeTruthy();
		expect(onKeyDecoded).not.toHaveBeenCalled();
	});

	it("allows retrying upload after an error", async () => {
		mockScanFile
			.mockRejectedValueOnce(new Error("QR parse error"))
			.mockResolvedValueOnce("0xretrykey");

		render(
			<PaperWalletScanner onKeyDecoded={onKeyDecoded} onCancel={onCancel} />,
		);

		fireEvent.click(screen.getByRole("button", { name: /upload image/i }));

		const file1 = new File(["bad"], "bad.png", { type: "image/png" });
		const fileInput = screen.getByLabelText(/upload qr code image/i);

		await act(() => {
			fireEvent.change(fileInput, { target: { files: [file1] } });
		});

		const file2 = new File(["good"], "good.png", { type: "image/png" });
		await act(() => {
			fireEvent.change(fileInput, { target: { files: [file2] } });
		});

		expect(onKeyDecoded).toHaveBeenCalledWith("0xretrykey");
	});

	it("ignores a late scan result after Back is clicked", async () => {
		let resolveScan: (value: string) => void;
		mockScanFile.mockReturnValue(
			new Promise<string>((resolve) => {
				resolveScan = resolve;
			}),
		);

		render(
			<PaperWalletScanner onKeyDecoded={onKeyDecoded} onCancel={onCancel} />,
		);

		await act(() => {
			fireEvent.click(screen.getByRole("button", { name: /upload image/i }));
		});

		const file = new File(["data"], "qr.png", { type: "image/png" });
		const fileInput = screen.getByLabelText(/upload qr code image/i);
		await act(() => {
			fireEvent.change(fileInput, { target: { files: [file] } });
		});

		await act(() => {
			fireEvent.click(screen.getByRole("button", { name: /back/i }));
		});

		await act(() => {
			resolveScan?.("0xlatekey");
		});

		expect(onKeyDecoded).not.toHaveBeenCalled();
	});
});
