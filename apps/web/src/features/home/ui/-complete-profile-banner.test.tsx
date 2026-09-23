import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { profile } = vi.hoisted(() => ({ profile: { data: undefined as unknown } }));

vi.mock("#/features/auth/hooks/use-profile", () => ({ useAuthProfile: () => profile }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

import { CompleteProfileBanner } from "./complete-profile-banner";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";

describe("CompleteProfileBanner", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("asks a bulk-issued account to fill in its placeholders", () => {
    profile.data = {
      name: "Paper wallet",
      email: "pending+1a3e@clc.local",
      phone: "",
      avatarUrl: null,
    };
    render(<CompleteProfileBanner address={ADDRESS} />);

    expect(screen.getByText("Complete your profile")).toBeTruthy();
    expect(
      screen.getByText(/your name, a profile photo, and an email or phone number/),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit profile" }).getAttribute("href")).toBe(
      "/settings/profile",
    );
  });

  it("stays hidden for a complete profile", () => {
    profile.data = {
      name: "Amina",
      email: "amina@example.com",
      phone: "",
      avatarUrl: "https://storage.example/a.webp",
    };
    const { container } = render(<CompleteProfileBanner address={ADDRESS} />);
    expect(container.innerHTML).toBe("");
  });

  it("remembers a dismissal for this account", () => {
    profile.data = { name: "Amina", email: "a@b.co", phone: "", avatarUrl: null };
    const { unmount } = render(<CompleteProfileBanner address={ADDRESS} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Complete your profile")).toBeNull();
    unmount();

    render(<CompleteProfileBanner address={ADDRESS} />);
    expect(screen.queryByText("Complete your profile")).toBeNull();
  });
});
