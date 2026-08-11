import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { client, readContractMock } = vi.hoisted(() => ({
  client: { uid: "celo-client" },
  readContractMock: vi.fn(),
}));

vi.mock("wagmi", () => ({ useClient: () => client }));
vi.mock("viem/actions", () => ({ readContract: readContractMock }));

import { useVoucherSupply } from "./use-voucher-supply";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useVoucherSupply", () => {
  it("reads total supply from the deployed voucher", async () => {
    const address = "0x1111111111111111111111111111111111111111" as const;
    readContractMock.mockResolvedValue(10_000_000_000n);

    const { result } = renderHook(() => useVoucherSupply(address), { wrapper });

    await waitFor(() => expect(result.current.data).toBe("10000000000"));
    expect(readContractMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ address, functionName: "totalSupply" }),
    );
  });

  it("does not read until the voucher address is known", () => {
    renderHook(() => useVoucherSupply(undefined), { wrapper });

    expect(readContractMock).not.toHaveBeenCalled();
  });
});
