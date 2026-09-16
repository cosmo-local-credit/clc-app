import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { SectionState } from "./section-state";

const props = {
  errorTitle: "Could not load vouchers",
  emptyTitle: "No vouchers",
  emptyDescription: "This pool allows no vouchers yet.",
};

describe("SectionState", () => {
  it("renders children when ready", () => {
    render(
      <SectionState state={{ kind: "ready" }} {...props}>
        <p>row content</p>
      </SectionState>,
    );
    expect(screen.getByText("row content")).toBeTruthy();
  });

  it("renders the error title, not the empty state, on failure", () => {
    // A failed section must never read as "no rows".
    render(
      <SectionState state={{ kind: "error", message: "Failed to fetch" }} {...props}>
        <p>row content</p>
      </SectionState>,
    );

    expect(screen.getByText("Could not load vouchers")).toBeTruthy();
    expect(screen.getByText("Failed to fetch")).toBeTruthy();
    expect(screen.queryByText("No vouchers")).toBeNull();
    expect(screen.queryByText("row content")).toBeNull();
  });

  it("renders the empty state only for a successful empty result", () => {
    render(
      <SectionState state={{ kind: "empty" }} {...props}>
        <p>row content</p>
      </SectionState>,
    );

    expect(screen.getByText("No vouchers")).toBeTruthy();
    expect(screen.queryByText("Could not load vouchers")).toBeNull();
  });

  it("keeps cached rows visible and warns when a refresh failed", () => {
    // Replacing a populated section with an error block on a failed refetch
    // destroys information the operator already had.
    render(
      <SectionState state={{ kind: "stale", message: "network down" }} {...props}>
        <p>row content</p>
      </SectionState>,
    );

    expect(screen.getByText("row content")).toBeTruthy();
    expect(screen.getByText("Showing data that may be out of date")).toBeTruthy();
    expect(screen.getByText("network down")).toBeTruthy();
    expect(screen.queryByText("Could not load vouchers")).toBeNull();
  });

  it("withholds children while pending", () => {
    render(
      <SectionState state={{ kind: "pending" }} {...props}>
        <p>row content</p>
      </SectionState>,
    );
    expect(screen.queryByText("row content")).toBeNull();
  });
});
