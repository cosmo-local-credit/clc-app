import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { testQueryClient } from "./-messaging-fixtures";
import { AbuseReportsOpenBadge, HelpdeskNeedsReplyBadge } from "./messaging-counts";

const mocks = vi.hoisted(() => ({ counts: vi.fn() }));
vi.mock("#/lib/messaging", () => ({ adminMessaging: mocks }));

function mount() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <HelpdeskNeedsReplyBadge />
      <AbuseReportsOpenBadge />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("messaging sidebar counters", () => {
  it("counts conversations waiting on a reply and open reports", async () => {
    mocks.counts.mockResolvedValue({ helpdeskNeedsReply: 3, abuseReportsOpen: 2 });
    mount();
    expect(
      await screen.findByLabelText("3 helpdesk conversations waiting for a reply"),
    ).toBeTruthy();
    expect(screen.getByLabelText("2 open abuse reports")).toBeTruthy();
    expect(mocks.counts).toHaveBeenCalledTimes(1);
  });

  it("draws nothing when nothing is waiting", async () => {
    mocks.counts.mockResolvedValue({ helpdeskNeedsReply: 0, abuseReportsOpen: 0 });
    const { container } = mount();
    await waitFor(() => expect(mocks.counts).toHaveBeenCalled());
    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("draws nothing rather than a guess when the count fails", async () => {
    mocks.counts.mockRejectedValue(new Error("Service unavailable"));
    const { container } = mount();
    await waitFor(() => expect(mocks.counts).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
