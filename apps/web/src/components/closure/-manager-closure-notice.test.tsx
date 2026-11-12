import type { ManagerClosure } from "@clc/core/features/account-retirement/logic";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { ManagerClosureNotice } from "./manager-closure-notice";

afterEach(cleanup);

const CLOSES_AT = "2026-12-15T12:00:00Z";
const scheduled: ManagerClosure = { state: "SCHEDULED", closesAt: CLOSES_AT };
const closed: ManagerClosure = { state: "CLOSED", closesAt: null };

describe("ManagerClosureNotice", () => {
  it.each(["voucher", "pool"] as const)("announces a scheduled closure for a %s", (resource) => {
    render(<ManagerClosureNotice closure={scheduled} resource={resource} />);
    const notice = screen.getByRole("status");
    expect(notice.textContent).toMatch(
      new RegExp(
        `^The account managing this ${resource} is scheduled to close on December 1[45], 2026\\. This ${resource} remains active\\.$`,
      ),
    );
  });

  it.each(["voucher", "pool"] as const)("announces a closed account for a %s", (resource) => {
    render(<ManagerClosureNotice closure={closed} resource={resource} />);
    expect(screen.getByRole("status").textContent).toBe(
      `The account managing this ${resource} has closed. This ${resource} remains active.`,
    );
  });

  it("renders nothing without a closure", () => {
    const { container, rerender } = render(<ManagerClosureNotice closure={null} resource="pool" />);
    expect(container.innerHTML).toBe("");
    rerender(<ManagerClosureNotice closure={undefined} resource="voucher" />);
    expect(container.innerHTML).toBe("");
  });

  it("yields to the retired-resource notice, which would otherwise be contradicted", () => {
    const { container, rerender } = render(
      <ManagerClosureNotice closure={closed} resource="voucher" active={false} />,
    );
    expect(container.innerHTML).toBe("");
    rerender(<ManagerClosureNotice closure={scheduled} resource="pool" active={false} />);
    expect(container.innerHTML).toBe("");
    rerender(<ManagerClosureNotice closure={closed} resource="pool" active />);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("shows nothing for a scheduled closure without a usable date", () => {
    const { container, rerender } = render(
      <ManagerClosureNotice closure={{ state: "SCHEDULED", closesAt: null }} resource="pool" />,
    );
    expect(container.innerHTML).toBe("");
    rerender(
      <ManagerClosureNotice closure={{ state: "SCHEDULED", closesAt: "soon" }} resource="pool" />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("draws the compact variant as plain helper text without a box or live region", () => {
    const { container } = render(<ManagerClosureNotice closure={closed} resource="pool" compact />);
    expect(screen.queryByRole("status")).toBeNull();
    const text = container.querySelector("p");
    expect(text?.className).toContain("text-xs");
    expect(text?.className).not.toContain("border");
    expect(text?.textContent).toContain("has closed");
  });

  it("carries no reason or identity, whatever else the payload holds", () => {
    const leaky = {
      ...scheduled,
      reason: "Fraud suspected",
      userId: 4242,
      name: "Amina Wanjiru",
    } as ManagerClosure;
    const { container } = render(<ManagerClosureNotice closure={leaky} resource="voucher" />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("Fraud");
    expect(text).not.toContain("4242");
    expect(text).not.toContain("Amina");
  });
});
