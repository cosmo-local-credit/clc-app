import type { SafeProposal } from "@clc/api/features/safe/client";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const SAFE = "0x1111111111111111111111111111111111111111" as const;
const ME = "0x00000000000000000000000000000000000000a1" as const;

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  pendingData: [] as unknown[],
  confirm: vi.fn(),
  confirmPending: false,
  confirmHash: undefined as string | undefined,
  execute: vi.fn(),
  executePending: false,
  executeHash: undefined as string | undefined,
  reject: vi.fn(),
  rejectPending: false,
  rejectHash: undefined as string | undefined,
  report: vi.fn(),
  refreshAfterExecution: vi.fn(),
  refreshSigners: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  queryOptions: <T,>(options: T) => options,
  useQuery: (options: { queryKey?: readonly unknown[] }) => mocks.query(options),
}));
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: (strings: TemplateStringsArray) => strings.join("") }),
}));
vi.mock("wagmi", () => ({
  useClient: () => ({ chain: { id: 100 } }),
  useConnection: () => ({ address: ME, connector: { id: "private-key" } }),
}));
vi.mock("#/connectors/calibur-webauthn", () => ({
  CALIBUR_WEBAUTHN_CONNECTOR_ID: "calibur-webauthn",
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, session: { address: ME } }),
}));
vi.mock("#/features/ownership/hooks/use-asset-owner-info", () => ({
  useSafeOwnersSignedBy: () => new Set([SAFE]),
}));
vi.mock("#/lib/api/safe", () => ({ safeClient: { pending: vi.fn() } }));
vi.mock("#/lib/chain", () => ({ CHAIN_ID: 100 }));
vi.mock("#/lib/safe-config", () => ({
  SAFE_MULTISEND_CALL_ONLY: "0x2222222222222222222222222222222222222222",
}));
vi.mock("./use-report-write-error", () => ({
  useReportWriteError: () => mocks.report,
}));
vi.mock("./use-safe-confirm", () => ({
  useSafeConfirm: () => ({
    mutate: mocks.confirm,
    isPending: mocks.confirmPending,
    variables: mocks.confirmHash ? { safeTxHash: mocks.confirmHash } : undefined,
  }),
}));
vi.mock("./use-safe-execute", () => ({
  useSafeExecute: () => ({
    mutate: mocks.execute,
    isPending: mocks.executePending,
    variables: mocks.executeHash ? { safeTxHash: mocks.executeHash } : undefined,
  }),
}));
vi.mock("./use-safe-reject", () => ({
  useSafeReject: () => ({
    mutate: mocks.reject,
    isPending: mocks.rejectPending,
    variables: mocks.rejectHash ? { safeTxHash: mocks.rejectHash } : undefined,
  }),
}));
vi.mock("./use-refresh-after-safe-execution", () => ({
  useRefreshAfterSafeExecution: () => mocks.refreshAfterExecution,
}));
vi.mock("./use-safe-signers", () => ({
  useRefreshSafeSigners: () => mocks.refreshSigners,
}));

import { useSafePending } from "./use-safe-pending";

function proposal(overrides: Partial<SafeProposal> = {}): SafeProposal {
  return {
    safe: SAFE,
    safeTxHash: `0x${"ab".repeat(32)}`,
    to: "0x3333333333333333333333333333333333333333",
    value: "0",
    data: "0x",
    operation: 0,
    safeTxGas: "0",
    baseGas: "0",
    gasPrice: "0",
    gasToken: "0x0000000000000000000000000000000000000000",
    refundReceiver: "0x0000000000000000000000000000000000000000",
    nonce: "1",
    confirmations: [],
    confirmationsRequired: 2,
    isExecuted: false,
    isSuccessful: null,
    transactionHash: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pendingData = [];
  mocks.confirmPending = false;
  mocks.confirmHash = undefined;
  mocks.executePending = false;
  mocks.executeHash = undefined;
  mocks.rejectPending = false;
  mocks.rejectHash = undefined;
  mocks.query.mockImplementation((options: { queryKey?: readonly unknown[] }) =>
    options.queryKey?.[2] === "pending"
      ? { data: mocks.pendingData, isPending: false, isError: false }
      : { data: null, isSuccess: false },
  );
});

describe("useSafePending", () => {
  it("maps mutation state and safely ignores an unresolved rejection link", () => {
    const action = proposal({ rejectedBySafeTxHash: `0x${"cd".repeat(32)}` });
    mocks.pendingData = [action];
    mocks.confirmPending = true;
    mocks.confirmHash = action.safeTxHash;
    mocks.executePending = true;
    mocks.executeHash = action.safeTxHash;
    mocks.rejectPending = true;
    mocks.rejectHash = action.safeTxHash;

    const { result, rerender } = renderHook(() => useSafePending(SAFE));
    const pending = result.current.proposals[0]!;
    expect(pending).toMatchObject({
      confirming: true,
      requestingExecution: true,
      rejecting: true,
      rejection: null,
      rejectionAction: null,
      requestingRejectionExecution: false,
    });
    expect(result.current.confirmBusy).toBe(true);

    act(() => pending.executeRejection());
    expect(mocks.execute).not.toHaveBeenCalled();

    mocks.confirmPending = false;
    mocks.executePending = false;
    rerender();
    expect(result.current.confirmBusy).toBe(true);

    mocks.rejectPending = false;
    rerender();
    expect(result.current.confirmBusy).toBe(false);
  });

  it("maps a linked rejection and reports a failed rejection execution", () => {
    const rejectionHash = `0x${"cd".repeat(32)}` as const;
    const action = proposal({ rejectedBySafeTxHash: rejectionHash });
    const rejection = proposal({
      safeTxHash: rejectionHash,
      transactionKind: "rejection",
      rejectsSafeTxHashes: [action.safeTxHash],
      to: SAFE,
    });
    mocks.pendingData = [action, rejection];
    mocks.executePending = true;
    mocks.executeHash = rejectionHash;

    const { result } = renderHook(() => useSafePending(SAFE));
    expect(result.current.proposals).toHaveLength(1);
    const pending = result.current.proposals[0]!;
    expect(pending.rejection).toBe(rejection);
    expect(pending.rejectionAction).not.toBeNull();
    expect(pending.requestingExecution).toBe(false);
    expect(pending.requestingRejectionExecution).toBe(true);
    expect(result.current.confirmBusy).toBe(true);

    act(() => pending.executeRejection());
    expect(mocks.execute).toHaveBeenCalledWith(rejection, expect.anything());
    const options = mocks.execute.mock.calls[0]?.[1] as {
      onError: (error: Error) => void;
    };
    const error = new Error("rejection execution failed");
    act(() => options.onError(error));
    expect(mocks.report).toHaveBeenCalledWith(error, "Execution failed");
  });
});
