import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { StateBadge } from "./state-badge";

describe("StateBadge account lifecycle", () => {
  it.each([
    ["RETIREMENT_SCHEDULED", "retiring"],
    ["ERASURE_PENDING", "erasure pending"],
    ["ERASED", "erased"],
  ])("labels %s as %s", (state, label) => {
    render(<StateBadge state={state} kind="account lifecycle" />);
    expect(screen.getByLabelText(`account lifecycle state ${label}`)).toBeTruthy();
  });

  it("appends a detail to the label and the accessible name", () => {
    render(
      <StateBadge state="RETIREMENT_SCHEDULED" kind="account lifecycle" detail="closes soon" />,
    );
    expect(screen.getByLabelText("account lifecycle state retiring · closes soon")).toBeTruthy();
    expect(screen.getByText("retiring · closes soon")).toBeTruthy();
  });
});
