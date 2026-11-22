import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const POOL = "0x2222222222222222222222222222222222222222" as const;
const VOUCHER = "0x3333333333333333333333333333333333333333" as const;
const identity = {
  kind: "user" as const,
  name: "Pool owner",
  alias: "pool-owner",
  address: OWNER,
  chainId: 100,
};

const mocks = vi.hoisted(() => ({
  flow: {} as Record<string, unknown>,
  openThread: undefined as
    | ((conversationId: number, context?: { kind: string; resourceId: string }) => void)
    | undefined,
  navigate: vi.fn(),
  choose: vi.fn(),
  consumed: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("#/features/messaging/hooks/use-new-message", () => ({
  useNewMessage: (
    openThread: (conversationId: number, context?: { kind: string; resourceId: string }) => void,
  ) => {
    mocks.openThread = openThread;
    return mocks.flow;
  },
}));
vi.mock("#/components/ui/dialog", () => ({
  DialogRoot: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogPortal: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogBackdrop: () => null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("#/components/messaging/resource-context-card", () => ({
  ResourceContextCard: () => <div>Resource context</div>,
}));
vi.mock("#/components/messaging/voucher-proposal-picker", () => ({
  VoucherProposalPicker: () => <div>Voucher proposal picker</div>,
}));
vi.mock("#/components/messaging/conversation-lookup-state", () => ({
  ConversationLookupState: () => <div>Looking up conversation</div>,
}));
vi.mock("#/components/wallet/recipient-identity-label", () => ({
  RecipientIdentityText: ({ identity: value }: { identity: typeof identity }) => (
    <span>{value.name}</span>
  ),
}));
vi.mock("#/components/wallet/wallet-address", () => ({
  EllipsizedAddress: ({ address }: { address: string }) => <span>{address}</span>,
}));

import { NewMessageDialog } from "./new-message-dialog";

function baseFlow(overrides: Record<string, unknown> = {}) {
  return {
    term: "",
    search: { data: [], isDebouncing: false, isFetching: false },
    users: [],
    ownerUsers: [],
    selected: null,
    failure: null,
    lookupStatus: "idle",
    targetSearch: { isPending: false, isError: false, isSuccess: false },
    query: "",
    intro: "",
    context: undefined,
    request: { isPending: false },
    setQuery: vi.fn(),
    setIntro: vi.fn(),
    setProposedVoucher: vi.fn(),
    choose: mocks.choose,
    reset: vi.fn(),
    retryLookup: vi.fn(),
    unselect: vi.fn(),
    submit: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.openThread = undefined;
  mocks.flow = baseFlow();
});

describe("NewMessageDialog resource flows", () => {
  it("navigates with Pool proposal context and without optional context", () => {
    render(<NewMessageDialog />);
    const poolContext = {
      kind: "pool" as const,
      resourceId: POOL,
      proposedVoucherAddress: VOUCHER,
    };
    act(() => mocks.openThread?.(9, poolContext));
    expect(mocks.navigate).toHaveBeenLastCalledWith({
      to: "/messages/$conversationId",
      params: { conversationId: "9" },
      search: {
        messageKind: "pool",
        messageResource: POOL,
        messageVoucher: VOUCHER,
      },
    });

    act(() => mocks.openThread?.(10));
    expect(mocks.navigate).toHaveBeenLastCalledWith({
      to: "/messages/$conversationId",
      params: { conversationId: "10" },
      search: {},
    });
  });

  it("omits a proposal parameter for non-Pool context", () => {
    render(<NewMessageDialog />);
    act(() => mocks.openThread?.(11, { kind: "want", resourceId: "want-1" }));
    expect(mocks.navigate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: {
          messageKind: "want",
          messageResource: "want-1",
          messageVoucher: undefined,
        },
      }),
    );
  });

  it("automatically chooses the only resolved owner and keeps the context until handoff", () => {
    mocks.flow = baseFlow({
      ownerUsers: [identity],
      targetSearch: { isPending: false, isError: false, isSuccess: true },
    });
    const context = { kind: "pool" as const, resourceId: POOL };
    render(<NewMessageDialog messageContext={context} onMessageToConsumed={mocks.consumed} />);
    expect(mocks.choose).toHaveBeenCalledWith(identity, context);
    expect(mocks.consumed).not.toHaveBeenCalled();
    act(() => mocks.openThread?.(9, context));
    expect(mocks.consumed).toHaveBeenCalledOnce();
  });

  it.each([true, false])("returns from a chosen recipient with directed=%s", (directed) => {
    mocks.flow = baseFlow({ selected: identity, ownerUsers: [identity] });
    render(
      <NewMessageDialog
        messageTo={directed ? OWNER : undefined}
        onMessageToConsumed={mocks.consumed}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    if (directed) {
      expect(mocks.consumed).toHaveBeenCalledOnce();
      expect(mocks.flow.reset).toHaveBeenCalledOnce();
    } else {
      expect(mocks.flow.unselect).toHaveBeenCalledOnce();
      expect(mocks.consumed).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["loading", { targetSearch: { isSuccess: false }, ownerUsers: [identity] }],
    ["multiple owners", { targetSearch: { isSuccess: true }, ownerUsers: [identity, identity] }],
    ["selected", { targetSearch: { isSuccess: true }, ownerUsers: [identity], selected: identity }],
    [
      "lookup pending",
      { targetSearch: { isSuccess: true }, ownerUsers: [identity], lookupStatus: "pending" },
    ],
  ])("does not auto-choose while %s", (_label, state) => {
    mocks.flow = baseFlow(state);
    render(<NewMessageDialog messageTo={OWNER} />);
    expect(mocks.choose).not.toHaveBeenCalled();
  });

  it("shows resource context and the Pool voucher picker only for Pool context", () => {
    mocks.flow = baseFlow({
      selected: identity,
      context: { kind: "pool", resourceId: POOL },
    });
    const { rerender } = render(<NewMessageDialog />);
    expect(screen.getByText("Resource context")).toBeTruthy();
    expect(screen.getByText("Voucher proposal picker")).toBeTruthy();

    mocks.flow = baseFlow({
      selected: identity,
      context: { kind: "want", resourceId: "want-1" },
    });
    rerender(<NewMessageDialog />);
    expect(screen.getByText("Resource context")).toBeTruthy();
    expect(screen.queryByText("Voucher proposal picker")).toBeNull();

    mocks.flow = baseFlow({ selected: identity });
    rerender(<NewMessageDialog />);
    expect(screen.queryByText("Resource context")).toBeNull();
  });
});
