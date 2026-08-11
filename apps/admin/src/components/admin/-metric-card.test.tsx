import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { MetricCard } from "./metric-card";

describe("MetricCard", () => {
  it("renders a formatted figure when the value is available", () => {
    render(<MetricCard label="Pools" value={1234} />);
    expect(screen.getByText("1,234")).toBeTruthy();
  });

  it("renders unavailable instead of the value when the figure could not be obtained", () => {
    // The regression this exists to prevent: a failed request rendering as a
    // real number. Zero is the dangerous case — it reads as a healthy empty
    // backend, so an operator cannot tell breakage from emptiness.
    render(<MetricCard label="Pools" value={0} unavailable />);

    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("unavailable")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("suppresses a supplied detail line in favour of the unavailable notice", () => {
    render(<MetricCard label="Pools" value={9} detail="sample of 100" unavailable />);

    expect(screen.getByText("unavailable")).toBeTruthy();
    expect(screen.queryByText("sample of 100")).toBeNull();
  });

  it("drops a success tone when unavailable so a failure never reads as healthy", () => {
    const { container } = render(
      <MetricCard label="Vouchers" value={5} tone="success" unavailable />,
    );
    expect(container.querySelector(".text-state-active")).toBeNull();
  });

  it("keeps the sample label visible when the figure is available", () => {
    render(<MetricCard label="Pools" value={12} detail="sample of 100" />);
    expect(screen.getByText("sample of 100")).toBeTruthy();
    expect(screen.queryByText("unavailable")).toBeNull();
  });
});
