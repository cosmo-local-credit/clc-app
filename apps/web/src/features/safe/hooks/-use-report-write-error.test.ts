import { renderHook } from "@testing-library/react";
import { BackendApiError } from "@clc/api/client/errors";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const toast = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import {
  SafeDashboardRequiredError,
  SafePendingConflictError,
  SafeProposalError,
  SafeProposalOutcomeUnknownError,
  SafeProposedError,
} from "../api/safe-transactions";
import { SafePasskeyUnsupportedError } from "../api/sign-safe-transaction";
import { useSafeSheet } from "../state/safe-sheet";
import { useReportWriteError } from "./use-report-write-error";

const SAFE = "0x1111111111111111111111111111111111111111";
const HASH = `0x${"ab".repeat(32)}` as const;

beforeEach(() => {
  vi.clearAllMocks();
  useSafeSheet.getState().close();
});

describe("useReportWriteError", () => {
  it.each([
    ["a queued proposal", new SafeProposedError({ safe: SAFE, safeTxHash: HASH } as never)],
    ["a dashboard handoff", new SafeDashboardRequiredError(SAFE)],
    ["a pending conflict", new SafePendingConflictError(SAFE, HASH)],
  ])("hands %s to the multisig sheet so the form can close", (_name, error) => {
    const report = renderHook(() => useReportWriteError()).result.current;
    expect(report(error, "fallback")).toBe(true);
    expect(useSafeSheet.getState().safe).toBe(SAFE);
    expect(useSafeSheet.getState().safeTxHash).toBeNull();
  });

  it("keeps the form open after the API rejects the proposal", () => {
    const report = renderHook(() => useReportWriteError()).result.current;
    expect(
      report(
        new SafeProposalError(SAFE, "rejected", new BackendApiError(400, "Invalid")),
        "fallback",
      ),
    ).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("The multisig proposal was rejected.");
    expect(useSafeSheet.getState().safe).toBeNull();
  });

  it.each([
    [401, "Sign in with a signer of this multisig to continue."],
    [403, "Only signers of this multisig can submit proposals."],
    [503, "Couldn't check the multisig queue. Try again."],
  ])("keeps the form open after a %i pre-sign failure", (status, message) => {
    const report = renderHook(() => useReportWriteError()).result.current;
    expect(
      report(new SafeProposalError(SAFE, "check", new BackendApiError(status, "test")), "fallback"),
    ).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(message);
    expect(useSafeSheet.getState().safe).toBeNull();
  });

  it("opens the queue with a warning after an uncertain submission", () => {
    const report = renderHook(() => useReportWriteError()).result.current;
    expect(
      report(new SafeProposalOutcomeUnknownError(SAFE, HASH, new Error("offline")), "fallback"),
    ).toBe(true);
    expect(toast.error).toHaveBeenCalledWith(
      "Couldn't verify whether the proposal was queued. Check Safe before submitting again.",
    );
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
