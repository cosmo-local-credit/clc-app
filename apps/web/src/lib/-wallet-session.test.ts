import { describe, expect, it } from "vite-plus/test";

import { abortWalletSwitch, beginWalletSwitch } from "./wallet-session";

describe("wallet-session switch gate", () => {
  it("returns a non-aborted signal when a switch begins", () => {
    const signal = beginWalletSwitch();
    expect(signal.aborted).toBe(false);
  });

  it("aborts the active switch signal", () => {
    const signal = beginWalletSwitch();
    abortWalletSwitch();
    expect(signal.aborted).toBe(true);
  });

  it("aborts the previous switch when a new one begins", () => {
    const first = beginWalletSwitch();
    const second = beginWalletSwitch();
    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);
  });

  it("is a no-op when there is no active switch", () => {
    expect(() => abortWalletSwitch()).not.toThrow();
  });
});
