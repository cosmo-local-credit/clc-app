import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const qrCode = vi.hoisted(() => ({ toDataURL: vi.fn() }));

vi.mock("qrcode", () => ({ default: qrCode }));

import { AddressQRCode } from "./wallet-qr";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;

describe("AddressQRCode", () => {
  it("renders a scan-ready QR at its final display size", async () => {
    qrCode.toDataURL.mockResolvedValue("data:image/png;base64,qr-code");
    const { container } = render(<AddressQRCode value={ADDRESS} />);

    await waitFor(() =>
      expect(qrCode.toDataURL).toHaveBeenCalledWith(ADDRESS, {
        margin: 4,
        width: 184,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      }),
    );

    const image = await waitFor(() => {
      const rendered = container.querySelector("img");
      if (!rendered) throw new Error("QR image did not render");
      return rendered;
    });
    expect(image.getAttribute("src")).toBe("data:image/png;base64,qr-code");
    expect(image.parentElement?.style.width).toBe("184px");
    expect(image.parentElement?.style.height).toBe("184px");
  });
});
