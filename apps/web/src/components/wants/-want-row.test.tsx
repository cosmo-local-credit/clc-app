import type { Want } from "@clc/core/features/wants/logic";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { WantPicture, WantRow } from "./want-row";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a href="/wants/7" className={className}>
      {children}
    </a>
  ),
}));

const WANT: Want = {
  id: "7",
  name: "Bicycle repair",
  description: "Looking for help repairing a wheel",
  locationName: "Nairobi Market",
  geoLat: -1.286,
  geoLng: 36.817,
  startsAt: "2026-10-24T08:00:00.000Z",
  expiresAt: null,
  status: "OPEN",
  state: "active",
  tags: ["Repair"],
  imageUrl: null,
  markerIcon: "message",
  markerColor: "orange",
};

describe("Want row privacy", () => {
  it("shows Want-owned content and location without a creator identity", () => {
    render(<WantRow want={WANT} />);

    expect(screen.getByText("Bicycle repair")).toBeTruthy();
    expect(screen.getByText("Nairobi Market")).toBeTruthy();
    expect(screen.queryByText(/Wanted by/)).toBeNull();
    expect(screen.queryByText(/Amina/)).toBeNull();
  });

  it("uses the selected marker unless the Want has an explicit image", () => {
    const { container, rerender } = render(<WantPicture want={WANT} />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('path[fill="#EA580C"]')).toBeTruthy();

    rerender(<WantPicture want={{ ...WANT, imageUrl: "https://storage.example/want.webp" }} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://storage.example/want.webp",
    );
  });
});
