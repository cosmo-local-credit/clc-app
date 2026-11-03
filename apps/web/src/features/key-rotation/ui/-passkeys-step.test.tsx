import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { DoneStep } from "./passkeys-step";

describe("DoneStep", () => {
  it("tells the holder how to rename a moved passkey", () => {
    render(<DoneStep onDone={() => {}} passkeyMoved />);
    expect(screen.getByText(/still shows the old address/)).toBeTruthy();
    expect(screen.getByText(/iPhone/)).toBeTruthy();
    expect(screen.getByText(/Google Password Manager/)).toBeTruthy();
  });

  it("stays quiet when no passkey moved", () => {
    render(<DoneStep onDone={() => {}} passkeyMoved={false} />);
    expect(screen.queryByText(/still shows the old address/)).toBeNull();
  });
});
