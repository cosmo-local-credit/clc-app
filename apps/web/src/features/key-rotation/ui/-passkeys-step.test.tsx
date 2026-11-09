import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ relink: vi.fn() }));
vi.mock("../api/relink-passkey", () => ({ relinkMovedPasskeys: mocks.relink }));
vi.mock("wagmi/actions", () => ({ connect: vi.fn(), disconnect: vi.fn() }));
vi.mock("#/providers/web3-config", () => ({ wagmiConfig: {}, pkConnector: { id: "private-key" } }));

import { useRotationSession } from "../state/rotation-session";
import { DoneStep, PasskeysStep } from "./passkeys-step";

const OLD_KEY = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const OLD = privateKeyToAccount(OLD_KEY).address;

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

let client: QueryClient;
function mount(onFinished: (moved: boolean) => void) {
  return render(
    <QueryClientProvider client={client}>
      <PasskeysStep onFinished={onFinished} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  client = new QueryClient();
  useRotationSession.getState().begin(OLD, { kind: "card", key: OLD_KEY });
  useRotationSession.getState().setStep("passkeys");
});

afterEach(() => {
  useRotationSession.getState().clear();
  mocks.relink.mockReset();
});

describe("PasskeysStep", () => {
  it("finishes on the step mounted after a layout switch once the registration lands", async () => {
    const registration = deferred();
    mocks.relink.mockReturnValue(registration.promise);
    const first = vi.fn();
    const before = mount(first);
    fireEvent.click(screen.getByRole("button", { name: "Move my passkey" }));
    await waitFor(() => expect(mocks.relink).toHaveBeenCalledTimes(1));
    before.unmount();

    const second = vi.fn();
    mount(second);
    const busy = screen.getByRole("button", { name: /Registering/ });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect((screen.getByRole("button", { name: "Skip" }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => registration.resolve());
    await waitFor(() => expect(second).toHaveBeenCalledWith(true));
    expect(first).not.toHaveBeenCalled();
    expect(mocks.relink).toHaveBeenCalledTimes(1);
  });

  it("shows a failure from before the switch on the step mounted after it", async () => {
    const registration = deferred();
    mocks.relink.mockReturnValue(registration.promise);
    const before = mount(vi.fn());
    fireEvent.click(screen.getByRole("button", { name: "Move my passkey" }));
    await waitFor(() => expect(mocks.relink).toHaveBeenCalled());
    before.unmount();

    const onFinished = vi.fn();
    mount(onFinished);
    await act(async () => registration.reject(new Error("Registration reverted")));
    expect((await screen.findByRole("alert")).textContent).toBe("Registration reverted");
    expect(onFinished).not.toHaveBeenCalled();
  });

  it("does not take an earlier replacement's registration for this one", async () => {
    mocks.relink.mockResolvedValue(undefined);
    const earlier = mount(vi.fn());
    fireEvent.click(screen.getByRole("button", { name: "Move my passkey" }));
    await waitFor(() => expect(mocks.relink).toHaveBeenCalled());
    earlier.unmount();

    // A second replacement in the same session generates another new card.
    useRotationSession.getState().begin(OLD, { kind: "card", key: OLD_KEY });
    useRotationSession.getState().setStep("passkeys");
    const onFinished = vi.fn();
    mount(onFinished);
    expect(screen.getByRole("button", { name: "Move my passkey" })).toBeTruthy();
    expect(onFinished).not.toHaveBeenCalled();
  });
});

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
