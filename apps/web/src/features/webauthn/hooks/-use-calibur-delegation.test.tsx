import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const { CALIBUR, DELEGATION_CODE, OTHER_CODE } = vi.hoisted(() => {
  const c = "0x1289fE793392fb1a905f78Ea23f632EDD3d15b85" as `0x${string}`;
  return {
    CALIBUR: c,
    DELEGATION_CODE: `0xef0100${c.slice(2).toLowerCase()}` as `0x${string}`,
    OTHER_CODE: "0xdeadbeef" as `0x${string}`,
  };
});
const ADDR = "0xabcdef1234567890abcdef1234567890abcdef12" as `0x${string}`;

type UseBytecodeReturn = { data: `0x${string}` | undefined; isPending: boolean };

const mockUseBytecode = vi.fn<(_args: unknown) => UseBytecodeReturn>(() => ({
  data: undefined,
  isPending: true,
}));

vi.mock("wagmi", () => ({
  useBytecode: (args: unknown) => mockUseBytecode(args),
}));

vi.mock("@clc/api/lib/backend-config", () => ({
  CALIBUR_ADDRESS: CALIBUR,
}));

import { useCaliburDelegation } from "./use-calibur-delegation";

describe("useCaliburDelegation", () => {
  it("returns 'checking' when address is undefined", () => {
    mockUseBytecode.mockReturnValue({ data: undefined, isPending: false });
    const { result } = renderHook(() => useCaliburDelegation(undefined));
    expect(result.current).toBe("checking");
  });

  it("returns 'checking' while bytecode read is pending", () => {
    mockUseBytecode.mockReturnValue({ data: undefined, isPending: true });
    const { result } = renderHook(() => useCaliburDelegation(ADDR));
    expect(result.current).toBe("checking");
  });

  it("returns 'delegated' when bytecode matches the Calibur delegation code", () => {
    mockUseBytecode.mockReturnValue({ data: DELEGATION_CODE, isPending: false });
    const { result } = renderHook(() => useCaliburDelegation(ADDR));
    expect(result.current).toBe("delegated");
  });

  it("returns 'not-delegated' when bytecode is present but does not match", () => {
    mockUseBytecode.mockReturnValue({ data: OTHER_CODE, isPending: false });
    const { result } = renderHook(() => useCaliburDelegation(ADDR));
    expect(result.current).toBe("not-delegated");
  });

  it("returns 'not-delegated' when bytecode is undefined and not pending", () => {
    mockUseBytecode.mockReturnValue({ data: undefined, isPending: false });
    const { result } = renderHook(() => useCaliburDelegation(ADDR));
    expect(result.current).toBe("not-delegated");
  });
});
