import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PaperWalletCustomization } from "./paper-wallet-types";

const { FAKE_QR_DATA_URL } = vi.hoisted(() => ({
	FAKE_QR_DATA_URL: "data:image/png;base64,fakeqrcode",
}));

vi.mock("qrcode", () => ({
	default: {
		toDataURL: vi.fn().mockResolvedValue(FAKE_QR_DATA_URL),
	},
}));

import { PaperWalletCard } from "./paper-wallet-card";

const ADDRESS = "0x37f944fe60D10350a2AAFBAf14FaA824811153a2" as `0x${string}`;
const QR_URL = "https://cosmolocal.credit/?w=0xabc";

function defaults(
	overrides?: Partial<PaperWalletCustomization>,
): PaperWalletCustomization {
	return {
		name: "My Wallet",
		website: "cosmolocal.credit",
		description: "",
		logoDataUrl: null,
		...overrides,
	};
}

describe("PaperWalletCard", () => {
	it("renders the address in the footer", () => {
		render(
			<PaperWalletCard
				address={ADDRESS}
				qrUrl={QR_URL}
				customization={defaults()}
			/>,
		);
		expect(screen.getByText(ADDRESS)).toBeTruthy();
	});

	it("renders the customization name", () => {
		render(
			<PaperWalletCard
				address={ADDRESS}
				qrUrl={QR_URL}
				customization={defaults({ name: "Alice's Vault" })}
			/>,
		);
		expect(screen.getByText("Alice's Vault")).toBeTruthy();
	});

	it("renders the website", () => {
		render(
			<PaperWalletCard
				address={ADDRESS}
				qrUrl={QR_URL}
				customization={defaults({ website: "example.org" })}
			/>,
		);
		expect(screen.getByText("example.org")).toBeTruthy();
	});

	it("renders the description when non-empty", () => {
		render(
			<PaperWalletCard
				address={ADDRESS}
				qrUrl={QR_URL}
				customization={defaults({ description: "A community voucher" })}
			/>,
		);
		expect(screen.getByText("A community voucher")).toBeTruthy();
	});

	it("does not render the description slot when description is empty", () => {
		render(
			<PaperWalletCard
				address={ADDRESS}
				qrUrl={QR_URL}
				customization={defaults({ description: "" })}
			/>,
		);
		// The description element should not be in the DOM
		expect(document.querySelector("[data-slot='description']")).toBeNull();
	});

	it("does not render the description slot when description is whitespace-only", () => {
		render(
			<PaperWalletCard
				address={ADDRESS}
				qrUrl={QR_URL}
				customization={defaults({ description: "   " })}
			/>,
		);
		expect(document.querySelector("[data-slot='description']")).toBeNull();
	});

	it("renders default CLC logo when logoDataUrl is null", () => {
		render(
			<PaperWalletCard
				address={ADDRESS}
				qrUrl={QR_URL}
				customization={defaults({ logoDataUrl: null })}
			/>,
		);
		// CLCLogo renders an SVG with viewbox 0 0 256 256
		const svg = document.querySelector("svg");
		expect(svg).toBeTruthy();
		expect(svg?.getAttribute("viewBox")).toBe("0 0 256 256");
	});

	it("renders uploaded logo when logoDataUrl is set", () => {
		render(
			<PaperWalletCard
				address={ADDRESS}
				qrUrl={QR_URL}
				customization={defaults({
					logoDataUrl: "data:image/png;base64,abc123",
				})}
			/>,
		);
		const img = document.querySelector(
			"img[data-slot='logo']",
		) as HTMLImageElement;
		expect(img).toBeTruthy();
		expect(img.src).toBe("data:image/png;base64,abc123");
	});

	it("renders the QR code image with the generated data URL", async () => {
		render(
			<PaperWalletCard
				address={ADDRESS}
				qrUrl={QR_URL}
				customization={defaults()}
			/>,
		);
		const qrImg = (await screen.findByAltText(
			"Wallet QR code",
		)) as HTMLImageElement;
		expect(qrImg.src).toBe(FAKE_QR_DATA_URL);
	});

	it("has fixed inline dimensions of 600x378 on the root element", () => {
		render(
			<PaperWalletCard
				address={ADDRESS}
				qrUrl={QR_URL}
				customization={defaults()}
			/>,
		);
		const root = document.querySelector(
			"[data-slot='paper-wallet-root']",
		) as HTMLDivElement;
		expect(root).toBeTruthy();
		expect(root.style.width).toBe("600px");
		expect(root.style.height).toBe("378px");
		expect(root.style.backgroundColor).toBe("rgb(255, 255, 255)");
	});

	it("name has line-clamp-2 for overflow protection", () => {
		render(
			<PaperWalletCard
				address={ADDRESS}
				qrUrl={QR_URL}
				customization={defaults({
					name: "A very long wallet name that should be clamped to two lines max",
				})}
			/>,
		);
		const nameEl = document.querySelector("[data-slot='name']") as HTMLElement;
		expect(nameEl).toBeTruthy();
		expect(nameEl.className).toContain("line-clamp-2");
	});

	it("website uses truncate for single-line overflow", () => {
		render(
			<PaperWalletCard
				address={ADDRESS}
				qrUrl={QR_URL}
				customization={defaults({ website: "a-very-long-website.example.org" })}
			/>,
		);
		const websiteEl = document.querySelector(
			"[data-slot='website']",
		) as HTMLElement;
		expect(websiteEl).toBeTruthy();
		expect(websiteEl.className).toContain("truncate");
	});
});
