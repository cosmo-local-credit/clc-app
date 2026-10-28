import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const toast = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import {
  SafeDashboardRequiredError,
  SafePendingConflictError,
  SafeProposedError,
} from "../api/safe-transactions";
import { SafePasskeyUnsupportedError } from "../api/sign-safe-transaction";
import { useSafeSheet } from "../state/safe-sheet";
import { useReportWriteError } from "./use-report-write-error";

const SAFE = "0x1111111111111111111111111111111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  useSafeSheet.getState().close();
});

describe("useReportWriteError", () => {
  it.each([
    ["a queued proposal", new SafeProposedError({ safe: SAFE } as never)],
    ["a dashboard handoff", new SafeDashboardRequiredError(SAFE)],
    ["a pending conflict", new SafePendingConflictError(SAFE, `0x${"ab".repeat(32)}`)],
  ])("hands %s to the multisig sheet so the form can close", (_name, error) => {
    const report = renderHook(() => useReportWriteError()).result.current;
    expect(report(error, "fallback")).toBe(true);
    expect(useSafeSheet.getState().safe).toBe(SAFE);
  });

  it("tells a passkey on an older Safe to use the paper wallet, without the dashboard", () => {
    const report = renderHook(() => useReportWriteError()).result.current;
    expect(report(new SafePasskeyUnsupportedError(SAFE), "fallback")).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(
      "Passkeys can sign for multisigs on Safe 1.5 or later. Use your sign-in card.",
    );
    expect(useSafeSheet.getState().safe).toBeNull();
  });

  it("stays quiet when the passkey prompt is dismissed", () => {
    const report = renderHook(() => useReportWriteError()).result.current;
    expect(report(new DOMException("cancelled", "NotAllowedError"), "fallback")).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
    expect(useSafeSheet.getState().safe).toBeNull();
  });

  it("keeps an ordinary failure on the form so it can be retried", () => {
    const report = renderHook(() => useReportWriteError()).result.current;
    expect(report(new Error("relay rejected"), "fallback")).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("relay rejected");
    expect(useSafeSheet.getState().safe).toBeNull();
  });
});
