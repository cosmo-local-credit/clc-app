import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const VIEWER = "0x1111111111111111111111111111111111111111";
const ACTOR = "0x2222222222222222222222222222222222222222";

const mocks = vi.hoisted(() => ({
  address: "0x1111111111111111111111111111111111111111" as string | undefined,
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ address: mocks.address }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: ReactNode;
    to: string;
    params?: Record<string, string>;
  }) => (
    <a
      href={
        to === "/"
          ? "/?tab=activity&section=messages"
          : to === "/pools/$poolAddress"
            ? `/pools/${params?.poolAddress}`
            : `/vouchers/${params?.voucherAddress}`
      }
    >
      {children}
    </a>
  ),
}));

import type { NotificationPayload } from "#/features/notifications/logic/payload-schema";
import { NotificationContextLinks } from "./notification-context-links";

function payload(overrides: Partial<NotificationPayload> = {}): NotificationPayload {
  return {
    notificationId: "n1",
    kind: "safe.approved",
    title: "Safe action approved",
    body: "amina approved an action",
    targetUrl: "/",
    createdAt: "2026-11-09T10:00:00Z",
    priority: "high",
    actorAddress: ACTOR,
    actorUsername: "amina",
    resources: [
      { kind: "pool", address: VIEWER, name: "Community Pool" },
      { kind: "voucher", address: ACTOR, name: "Garden Voucher" },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  mocks.address = VIEWER;
});

describe("NotificationContextLinks", () => {
  it("links another actor and each resource type", () => {
    render(<NotificationContextLinks item={payload()} />);
    expect(screen.getByRole("link", { name: "amina" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Community Pool" }).getAttribute("href")).toBe(
      `/pools/${VIEWER}`,
    );
    expect(screen.getByRole("link", { name: "Garden Voucher" }).getAttribute("href")).toBe(
      `/vouchers/${ACTOR}`,
    );
  });

  it("does not link the viewer and explains truncated resources", () => {
    render(
      <NotificationContextLinks
        item={payload({
          actorAddress: VIEWER,
          actorUsername: "me",
          resources: [
            { kind: "pool", address: "pool-1", name: "One" },
            { kind: "pool", address: "pool-2", name: "Two" },
            { kind: "pool", address: "pool-3", name: "Three" },
            { kind: "pool", address: "pool-4", name: "Four" },
          ],
        })}
      />,
    );
    expect(screen.getByText("me").tagName).toBe("SPAN");
    expect(screen.queryByText("Four")).toBeNull();
    expect(screen.getByText("View the proposal for more resources.")).toBeTruthy();
  });

  it("falls back to an address, shows a username without an address, and accepts no resources", () => {
    const { rerender } = render(
      <NotificationContextLinks
        item={payload({ actorUsername: undefined, resources: undefined })}
      />,
    );
    expect(screen.getByRole("link", { name: ACTOR })).toBeTruthy();

    rerender(
      <NotificationContextLinks
        item={payload({ actorAddress: undefined, actorUsername: "amina", resources: undefined })}
      />,
    );
    expect(screen.getByText("amina").tagName).toBe("SPAN");
    expect(screen.queryByText("View the proposal for more resources.")).toBeNull();
  });
});
