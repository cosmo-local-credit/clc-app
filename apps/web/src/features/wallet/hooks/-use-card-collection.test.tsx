import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { clearIdentitySecrets } from "#/features/auth/api/identity-reset";
import { createFakeNdef, urlRecord } from "#/lib/-fixtures/nfc/fake-ndef-reader";
import { useCollectPayerKey } from "../state/collect-payer-key";
import { useCollectSession } from "../state/collect-session";
import { useCollectSubmissions } from "../state/collect-submissions";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  submit: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("#/features/wallet/api/collect-payment", () => ({
  prepareCollectPayment: mocks.prepare,
  submitCollectRequest: mocks.submit,
  reconcileCollectRequest: mocks.reconcile,
}));

vi.mock("@clc/api/features/relayer/queries", () => ({
  relayerHealthQueryOptions: () => ({
    queryKey: ["clc", "relayer", "health"],
    queryFn: async () => ({ chainId: 100, relayerAddress: "0x9", idempotentRelay: true }),
  }),
}));

// Balance and delegation reads run inside the mocked prepare step; the hook
// only needs a client to hand it.
vi.mock("wagmi", () => ({ useClient: () => ({}) }));

import { useCardCollection } from "./use-card-collection";

const PAYER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const PAYER = privateKeyToAccount(PAYER_KEY).address;
const OTHER_KEY = "0x8166f546bab6da521a8369cab06c5d2b9e46670292d85c875ee9ec20e84ffb61" as const;
const COLLECTOR_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const COLLECTOR = privateKeyToAccount(COLLECTOR_KEY).address;

const DRAFT = {
  token: { address: "0x4444444444444444444444444444444444444444", symbol: "SRF", decimals: 6 },
  amountRaw: "2500000",
  amountLabel: "2.5",
} as const;

const card = (key: string) => [urlRecord(`https://cosmolocal.credit/?w=${key}`)];

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
  document.dispatchEvent(new Event("visibilitychange"));
}

async function mountCollection() {
  const fake = createFakeNdef();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useCardCollection({ collector: COLLECTOR, Reader: fake.Reader }), {
    wrapper,
  });
  await waitFor(() => expect(hook.result.current.health.data).toBeDefined());
  return { fake, hook };
}

async function armAndListen(hook: Awaited<ReturnType<typeof mountCollection>>["hook"]) {
  act(() => {
    hook.result.current.arm({ ...DRAFT, token: { ...DRAFT.token } });
  });
  await waitFor(() => expect(hook.result.current.scan.phase).toBe("ready"));
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  useCollectSubmissions.setState({ submissions: [] });
  useCollectSession.getState().reset();
  useCollectPayerKey.getState().clear();
  mocks.prepare.mockReset().mockResolvedValue({
    kind: "signed",
    request: { operationId: "x", userAddress: PAYER },
    expiresAt: Date.now() + 300_000,
  });
  mocks.submit.mockReset().mockResolvedValue({ kind: "submitted", trackingId: "track-1" });
  mocks.reconcile.mockReset().mockResolvedValue({ kind: "aborted" });
});

afterEach(() => setVisibility("visible"));

describe("useCardCollection", () => {
  it("charges once for a card held against the phone", async () => {
    const { fake, hook } = await mountCollection();
    await armAndListen(hook);
    act(() => {
      fake.latest().emit(card(PAYER_KEY));
      fake.latest().emit(card(PAYER_KEY));
      fake.latest().emit(card(PAYER_KEY));
    });
    await waitFor(() => expect(hook.result.current.session.state.phase).toBe("submitted"));
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(mocks.prepare.mock.calls[0]?.[1]).toBe(PAYER_KEY);
  });

  it("never touches the collector's identity or writes the payer's key anywhere", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { fake, hook } = await mountCollection();
    await armAndListen(hook);
    act(() => fake.latest().emit(card(PAYER_KEY)));
    await waitFor(() => expect(hook.result.current.session.state.phase).toBe("submitted"));
    expect(localStorage.getItem("clc_pk_raw")).toBeNull();
    for (const [, value] of setItem.mock.calls) {
      expect(String(value)).not.toContain(PAYER_KEY.slice(2));
    }
    setItem.mockRestore();
  });

  it("ignores a card when nothing is armed", async () => {
    const { fake, hook } = await mountCollection();
    await armAndListen(hook);
    act(() => hook.result.current.cancelArmed());
    act(() => fake.latest().emit(card(PAYER_KEY)));
    await waitFor(() => expect(hook.result.current.notice).toEqual({ kind: "not-armed" }));
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("latches the card that just paid; only collect-again charges it", async () => {
    const { fake, hook } = await mountCollection();
    await armAndListen(hook);
    act(() => fake.latest().emit(card(PAYER_KEY)));
    await waitFor(() => expect(hook.result.current.session.state.phase).toBe("submitted"));
    act(() => hook.result.current.settle(mocks.prepare.mock.calls[0]?.[0].id, "confirmed"));

    await armAndListen(hook);
    act(() => fake.latest().emit(card(PAYER_KEY)));
    await waitFor(() => expect(hook.result.current.notice).toEqual({ kind: "latched" }));
    expect(mocks.prepare).toHaveBeenCalledTimes(1);

    act(() => {
      hook.result.current.collectAgain({ ...DRAFT, amountLabel: "1", amountRaw: "1000000" });
    });
    await waitFor(() => expect(mocks.prepare).toHaveBeenCalledTimes(2));
    expect(mocks.prepare.mock.calls[1]?.[0]).toMatchObject({ amountRaw: "1000000" });
  });

  it("charges a different card on the next armed intent", async () => {
    const { fake, hook } = await mountCollection();
    await armAndListen(hook);
    act(() => fake.latest().emit(card(PAYER_KEY)));
    await waitFor(() => expect(hook.result.current.session.state.phase).toBe("submitted"));
    await armAndListen(hook);
    act(() => fake.latest().emit(card(OTHER_KEY)));
    await waitFor(() => expect(mocks.prepare).toHaveBeenCalledTimes(2));
  });

  it("refuses to charge a card whose last payment has not settled", async () => {
    const { fake, hook } = await mountCollection();
    await armAndListen(hook);
    act(() => fake.latest().emit(card(PAYER_KEY)));
    await waitFor(() => expect(hook.result.current.session.state.phase).toBe("submitted"));
    let charged = true;
    act(() => {
      charged = hook.result.current.collectAgain({ ...DRAFT });
    });
    expect(charged).toBe(false);
    expect(hook.result.current.notice).toEqual({ kind: "payer-unresolved" });
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
  });

  it("refuses the collector's own card and keeps the intent armed", async () => {
    const { fake, hook } = await mountCollection();
    await armAndListen(hook);
    act(() => fake.latest().emit(card(COLLECTOR_KEY)));
    await waitFor(() => expect(hook.result.current.notice).toEqual({ kind: "self-payment" }));
    expect(hook.result.current.session.state.phase).toBe("armed");
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("disarms when the page is hidden, so returning charges nothing", async () => {
    const { fake, hook } = await mountCollection();
    await armAndListen(hook);
    const reader = fake.latest();
    act(() => setVisibility("hidden"));
    expect(hook.result.current.session.state.phase).toBe("idle");
    act(() => setVisibility("visible"));
    act(() => reader.emit(card(PAYER_KEY)));
    await Promise.resolve();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("reconciles an unanswered submission by resending, not re-signing", async () => {
    mocks.submit.mockResolvedValueOnce({ kind: "uncertain" });
    mocks.reconcile.mockResolvedValueOnce({ kind: "submitted", trackingId: "original" });
    const { fake, hook } = await mountCollection();
    await armAndListen(hook);
    act(() => fake.latest().emit(card(PAYER_KEY)));
    await waitFor(() =>
      expect(hook.result.current.session.state).toMatchObject({
        phase: "submitted",
        trackingId: "original",
      }),
    );
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    expect(mocks.reconcile).toHaveBeenCalledTimes(1);
    expect(useCollectSubmissions.getState().submissions[0]).toMatchObject({
      trackingId: "original",
      request: null,
    });
  });

  it("resumes reconciling after a reload without the payer's key", async () => {
    const operationId = "op-reload";
    sessionStorage.setItem(
      "clc.collect.submissions",
      JSON.stringify({
        state: {
          submissions: [
            {
              operationId,
              collector: COLLECTOR,
              payer: PAYER,
              token: DRAFT.token,
              amountLabel: "2.5",
              createdAt: Date.now(),
              expiresAt: Date.now() + 120_000,
              trackingId: null,
              request: { operationId, userAddress: PAYER },
              status: "pending",
            },
          ],
        },
        version: 1,
      }),
    );
    const { hook } = await mountCollection();
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalledTimes(1));
    expect(mocks.reconcile.mock.calls[0]?.[0]).toEqual({ operationId, userAddress: PAYER });
    expect(hook.result.current.session.unresolved[PAYER.toLowerCase()]).toBe(operationId);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("forgets the payer's key when the route is left", async () => {
    const { fake, hook } = await mountCollection();
    await armAndListen(hook);
    act(() => fake.latest().emit(card(PAYER_KEY)));
    await waitFor(() => expect(useCollectPayerKey.getState().key).toBe(PAYER_KEY));
    hook.unmount();
    expect(useCollectPayerKey.getState()).toMatchObject({ key: null, payer: null });
    expect(useCollectSession.getState().session.latchedPayer).toBeNull();
  });

  it("forgets the payer's key on Done and on sign-out", async () => {
    const { fake, hook } = await mountCollection();
    await armAndListen(hook);
    act(() => fake.latest().emit(card(PAYER_KEY)));
    await waitFor(() => expect(hook.result.current.heldPayer).toBe(PAYER));
    act(() => hook.result.current.finishCustomer());
    expect(useCollectPayerKey.getState().key).toBeNull();

    useCollectPayerKey.getState().retain(PAYER_KEY);
    clearIdentitySecrets("none");
    expect(useCollectPayerKey.getState().key).toBeNull();
  });
});

describe("payer key custody", () => {
  it("carries no persist or devtools middleware", () => {
    const store = useCollectPayerKey as unknown as Record<string, unknown>;
    expect(store.persist).toBeUndefined();
    expect(store.devtools).toBeUndefined();
  });

  it("never writes to browser storage", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    useCollectPayerKey.getState().retain(PAYER_KEY);
    useCollectPayerKey.getState().clear();
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
