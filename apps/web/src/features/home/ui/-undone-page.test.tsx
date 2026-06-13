import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { UndonePage } from "./undone-page";

describe("UndonePage", () => {
  it("shows the Activity heading and activity description for activity tab", () => {
    render(<UndonePage tab="activity" />);
    expect(screen.getByText("Activity")).toBeTruthy();
    expect(screen.getByText(/voucher sends/i)).toBeTruthy();
  });

  it("shows 'Pools' heading and pool description for pool tab", () => {
    render(<UndonePage tab="pool" />);
    expect(screen.getByText("Pools")).toBeTruthy();
    expect(screen.getByText(/pool membership/i)).toBeTruthy();
  });
});
