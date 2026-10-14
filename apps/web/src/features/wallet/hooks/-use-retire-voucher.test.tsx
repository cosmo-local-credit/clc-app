import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";
import { offeringKeys } from "@clc/api/features/offerings/queries";
import { voucherKeys } from "@clc/api/features/market/queries";
import { useRetireVoucher } from "./use-retire-voucher";

const mocks = vi.hoisted(() => ({ retireVoucher: vi.fn() }));
vi.mock("#/lib/api/market", () => ({ marketClient: mocks }));
const address = "0x1111111111111111111111111111111111111111";

it("clears retired offers and dependent views while preserving unrelated account data", async () => {
  mocks.retireVoucher.mockResolvedValue(undefined);
  const client = new QueryClient();
  const lists = [
    offeringKeys.byVoucher(address, 20),
    ["clc", "offerings", "pool", "pool"],
    ["clc", "marketplace", "list"],
    ["clc", "pools", "list"],
    ["clc", "catalogs", "list"],
  ];
  for (const key of lists) client.setQueryData(key, { stale: true });
  client.setQueryData(voucherKeys.detail(address), { stale: true });
  client.setQueryData(["profile"], { name: "Alice" });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useRetireVoucher(address), { wrapper });
  await act(async () => {
    await result.current.mutateAsync();
  });
  for (const key of lists) expect(client.getQueryData(key)).toBeUndefined();
  expect(client.getQueryData(voucherKeys.detail(address))).toBeUndefined();
  expect(client.getQueryData(["profile"])).toEqual({ name: "Alice" });
  client.clear();
});
