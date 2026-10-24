import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Want } from "@clc/core/features/wants/logic";
import { WantDetail } from "./want-detail";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const WANT: Want = {
  id: "7",
  ownerUserId: "3",
  name: "Bicycle repair",
  description: "Looking for help repairing a wheel",
  locationName: "Nairobi",
  geoLat: -1.286,
  geoLng: 36.817,
  startsAt: "2026-10-24T08:00:00.000Z",
  expiresAt: null,
  status: "OPEN",
  state: "active",
  tags: ["Repair", "Bicycle"],
  imageUrl: null,
  effectiveImageUrl: null,
  markerIcon: "question",
  markerColor: "orange",
  ownerName: "Amina",
  ownerUsername: "amina",
  contact: {
    text: "Meet near the market",
    email: "amina@example.test",
    phone: "+254700000000",
  },
};

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
  Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => vi.restoreAllMocks());

describe("Want detail", () => {
  it("shows public scheduling, location, tags, description, and only supplied contact actions", () => {
    render(<WantDetail want={WANT} distanceOrigin={{ lat: -1.28, lng: 36.82 }} />);

    expect(screen.getByRole("heading", { name: "Bicycle repair" })).toBeTruthy();
    expect(screen.getByText("Wanted by Amina")).toBeTruthy();
    expect(screen.getByText("Repair")).toBeTruthy();
    expect(screen.getByText("Bicycle")).toBeTruthy();
    expect(screen.getByText("Looking for help repairing a wheel")).toBeTruthy();
    expect(screen.getByText("Meet near the market")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Email" }).getAttribute("href")).toBe(
      "mailto:amina@example.test",
    );
    expect(screen.getByRole("link", { name: "Call" }).getAttribute("href")).toBe(
      "tel:+254700000000",
    );
    expect(screen.getByText("No ending date")).toBeTruthy();
  });

  it("uses the canonical public URL for native Share", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    render(<WantDetail want={WANT} />);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: "Bicycle repair",
        url: `${window.location.origin}/wants/7`,
      }),
    );
  });

  it("falls back to the clipboard and reports a failed share without exposing contacts", async () => {
    const clipboard = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboard },
    });
    const { rerender } = render(<WantDetail want={{ ...WANT, contact: undefined }} />);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() =>
      expect(clipboard).toHaveBeenCalledWith(`${window.location.origin}/wants/7`),
    );
    expect(toast.success).toHaveBeenCalledWith("Link copied");
    expect(screen.queryByRole("link", { name: "Email" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Call" })).toBeNull();

    clipboard.mockRejectedValueOnce(new Error("blocked"));
    rerender(<WantDetail want={WANT} />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't share this Want."));
  });
});
