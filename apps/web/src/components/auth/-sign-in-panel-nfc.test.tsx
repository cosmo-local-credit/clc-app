import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { getStoredKey } from "#/connectors/privateKey";
import { createFakeNdef, urlRecord } from "#/lib/-fixtures/nfc/fake-ndef-reader";

const RAW_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const ENCRYPTED = `6P${"Rf".repeat(28)}`;

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  connect: vi.fn(),
  backendSignin: vi.fn(),
  nfc: null as ReturnType<typeof createFakeNdef> | null,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/", searchStr: "", hash: "" }),
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({ isConnected: false, connector: undefined }),
  useDisconnect: () => ({ mutateAsync: mocks.disconnect }),
}));

vi.mock("wagmi/actions", () => ({ connect: mocks.connect }));

vi.mock("#/providers/web3-config", () => ({
  wagmiConfig: {},
  pkConnector: { id: "private-key" },
  caliburConnector: { id: "calibur-webauthn" },
}));

vi.mock("#/features/auth/hooks/use-backend-auth", () => ({
  useBackendPrivateKeySignin: () => ({ mutateAsync: mocks.backendSignin, isPending: false }),
}));

vi.mock("#/features/webauthn/hooks/use-calibur-signin", () => ({
  useCaliburSignin: () => ({ step: "idle", signin: { mutateAsync: vi.fn() } }),
}));

vi.mock("#/features/webauthn/hooks/use-platform-passkey-label", () => ({
  usePlatformPasskeyLabel: () => ({ available: false, provider: "google", label: "Google" }),
}));

vi.mock("#/components/paper-wallet-scanner", () => ({ PaperWalletScanner: () => null }));

// The adapter's own behaviour is covered beside it; here only the browser
// lookup is replaced, with the injectable fake constructor.
vi.mock("#/lib/nfc/ndef-adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/lib/nfc/ndef-adapter")>();
  return {
    ...actual,
    getNdefReaderConstructor: () => mocks.nfc?.Reader ?? null,
    useWebNfcSupported: () => mocks.nfc !== null,
  };
});

import { SignInPanel } from "./sign-in-panel";

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SignInPanel onAuthenticated={vi.fn()} />
    </QueryClientProvider>,
  );
}

async function tapToSignIn() {
  fireEvent.click(screen.getByRole("button", { name: /tap nfc card/i }));
  await screen.findByText(/hold the card flat/i);
  return mocks.nfc?.latest();
}

beforeEach(() => {
  localStorage.clear();
  mocks.nfc = createFakeNdef();
  mocks.disconnect.mockReset().mockResolvedValue(undefined);
  mocks.connect.mockReset().mockResolvedValue(undefined);
  mocks.backendSignin.mockReset().mockResolvedValue(undefined);
});

describe("NFC card sign-in", () => {
  it("offers the card only where Web NFC exists", () => {
    mocks.nfc = null;
    renderPanel();
    expect(screen.queryByRole("button", { name: /tap nfc card/i })).toBeNull();
    expect(screen.getByRole("button", { name: /continue with paper wallet/i })).toBeTruthy();
  });

  it("signs a raw card in through the existing SIWE path without a confirmation", async () => {
    renderPanel();
    const reader = await tapToSignIn();
    act(() => reader?.emit([urlRecord(`https://cosmolocal.credit/?w=${RAW_KEY}`)]));

    await waitFor(() => expect(mocks.connect).toHaveBeenCalledTimes(1));
    expect(mocks.backendSignin).toHaveBeenCalledWith({ privateKey: RAW_KEY });
    expect(getStoredKey()).toBe(RAW_KEY);
    // A login scan ends after one valid card.
    expect(reader?.signal?.aborted).toBe(true);
  });

  it("signs in once for a card held against the phone", async () => {
    renderPanel();
    const reader = await tapToSignIn();
    const card = [urlRecord(`https://cosmolocal.credit/?w=${RAW_KEY}`)];
    act(() => {
      reader?.emit(card);
      reader?.emit(card);
    });
    await waitFor(() => expect(mocks.connect).toHaveBeenCalledTimes(1));
    expect(mocks.backendSignin).toHaveBeenCalledTimes(1);
  });

  it("sends an encrypted card to the password step", async () => {
    renderPanel();
    const reader = await tapToSignIn();
    act(() => reader?.emit([urlRecord(`https://cosmolocal.credit/?w=${ENCRYPTED}`)]));

    expect(await screen.findByText(/password-protected paper wallet/i)).toBeTruthy();
    expect(mocks.backendSignin).not.toHaveBeenCalled();
    expect(reader?.signal?.aborted).toBe(true);
  });

  it("explains a card without a wallet and keeps listening", async () => {
    renderPanel();
    const reader = await tapToSignIn();
    act(() => reader?.emit([urlRecord("https://example.com/menu")]));
    expect(await screen.findByText(/doesn't hold a CLC wallet/i)).toBeTruthy();
    expect(reader?.signal?.aborted).toBe(false);

    act(() => reader?.emit([urlRecord(`https://cosmolocal.credit/?w=${RAW_KEY}`)]));
    await waitFor(() => expect(mocks.connect).toHaveBeenCalledTimes(1));
  });

  it("rejects an out-of-range key before any sign-in starts", async () => {
    renderPanel();
    const reader = await tapToSignIn();
    act(() => reader?.emit([urlRecord(`https://cosmolocal.credit/?w=0x${"f".repeat(64)}`)]));
    expect(await screen.findByText(/wallet key is damaged/i)).toBeTruthy();
    expect(mocks.backendSignin).not.toHaveBeenCalled();
  });

  it("stops the reader on cancel, so a late tap signs nobody in", async () => {
    renderPanel();
    const reader = await tapToSignIn();
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(reader?.signal?.aborted).toBe(true);
    act(() => reader?.emit([urlRecord(`https://cosmolocal.credit/?w=${RAW_KEY}`)]));
    await Promise.resolve();
    expect(mocks.backendSignin).not.toHaveBeenCalled();
  });

  it("stops the reader when the panel unmounts", async () => {
    const view = renderPanel();
    const reader = await tapToSignIn();
    view.unmount();
    expect(reader?.signal?.aborted).toBe(true);
  });
});
