import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const SAFE = "0x1111111111111111111111111111111111111111";
const [FIRST, SECOND, THIRD, NEWCOMER] = [
  "0x00000000000000000000000000000000000000c3",
  "0x00000000000000000000000000000000000000a1",
  "0x00000000000000000000000000000000000000b2",
  "0x00000000000000000000000000000000000000d4",
] as const;

const mocks = vi.hoisted(() => ({
  signers: { data: undefined as unknown, isError: false, refetch: vi.fn() },
  mutate: vi.fn(),
  pending: false,
  report: vi.fn(),
}));
vi.mock("#/features/safe/hooks/use-safe-signers", () => ({
  useSafeSigners: () => mocks.signers,
  useProposeSignerChange: () => ({ mutate: mocks.mutate, isPending: mocks.pending }),
}));
vi.mock("#/features/safe/hooks/use-report-write-error", () => ({
  useReportWriteError: () => mocks.report,
}));
vi.mock("#/components/wallet/recipient-identity-label", () => ({
  RecipientIdentityLabel: ({ address }: { address: string }) => <span>{address}</span>,
}));
vi.mock("#/components/wallet/recipient-address-input", () => ({
  RecipientAddressInput: ({
    id,
    ariaLabel,
    value,
    onValueChange,
    onRecipientChange,
  }: {
    id: string;
    ariaLabel: string;
    value: string;
    onValueChange: (value: string) => void;
    onRecipientChange: (recipient: { address: string; name: null; source: string } | null) => void;
  }) => (
    <input
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => {
        onValueChange(event.target.value);
        onRecipientChange(
          /^0x[0-9a-f]{40}$/i.test(event.target.value)
            ? { address: event.target.value, name: null, source: "manual" }
            : null,
        );
      }}
    />
  ),
}));

const { useSafeSheet } = await import("#/features/safe/state/safe-sheet");
const { MultisigSettingsRows } = await import("./multisig-settings-section");

function openSheet() {
  render(
    <MultisigSettingsRows
      safes={[{ kind: "safe", owner: SAFE, signers: [SECOND, THIRD, FIRST], threshold: 2 }]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Signers and approvals/ }));
  return screen.getByRole("dialog");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signers = {
    data: { safe: SAFE, owners: [FIRST, SECOND, THIRD], threshold: 2 },
    isError: false,
    refetch: vi.fn(),
  };
  mocks.pending = false;
  act(() => useSafeSheet.getState().close());
});

describe("MultisigSettingsRows", () => {
  it("lists the signers in the Safe's own order and the approvals required", () => {
    const sheet = openSheet();
    const list = within(sheet).getByRole("region", { name: "Signers" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([FIRST, SECOND, THIRD]);
    expect(within(list).getAllByRole("button", { name: "Remove signer" })).toHaveLength(3);
    expect(within(sheet).getByRole("button", { name: /Approvals required/ }).textContent).toContain(
      "2 of 3",
    );
  });

  it("proposes an added signer with the approvals chosen", () => {
    const sheet = openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: "Add signer" }));
    const propose = within(sheet).getByRole("button", { name: "Propose" });
    expect((propose as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(sheet).getByLabelText("New signer"), { target: { value: NEWCOMER } });
    expect(within(sheet).getAllByRole("radio")).toHaveLength(4);
    fireEvent.click(within(sheet).getByRole("radio", { name: "3 of 4" }));
    fireEvent.click(propose);
    expect(mocks.mutate).toHaveBeenCalledWith(
      { kind: "addSigner", signer: NEWCOMER, threshold: 3 },
      expect.anything(),
    );
  });

  it("will not propose someone who already signs", () => {
    const sheet = openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: "Add signer" }));
    fireEvent.change(within(sheet).getByLabelText("New signer"), { target: { value: SECOND } });
    expect(within(sheet).getByText("This address is already a signer.")).toBeTruthy();
    expect(
      (within(sheet).getByRole("button", { name: "Propose" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("proposes a removal keeping approvals within the signers left", () => {
    const sheet = openSheet();
    fireEvent.click(within(sheet).getAllByRole("button", { name: "Remove signer" })[2]!);
    expect(within(sheet).getAllByRole("radio")).toHaveLength(2);
    expect(within(sheet).getByRole("radio", { name: "2 of 2" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    fireEvent.click(within(sheet).getByRole("button", { name: "Propose" }));
    expect(mocks.mutate).toHaveBeenCalledWith(
      { kind: "removeSigner", signer: THIRD, threshold: 2 },
      expect.anything(),
    );
  });

  it("proposes a changed threshold, and nothing for the same one", () => {
    const sheet = openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: /Approvals required/ }));
    const propose = within(sheet).getByRole("button", { name: "Propose" });
    expect((propose as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(sheet).getByRole("radio", { name: "3 of 3" }));
    fireEvent.click(propose);
    expect(mocks.mutate).toHaveBeenCalledWith(
      { kind: "changeThreshold", threshold: 3 },
      expect.anything(),
    );
  });

  it("does not offer to remove the last signer", () => {
    mocks.signers = {
      data: { safe: SAFE, owners: [FIRST], threshold: 1 },
      isError: false,
      refetch: vi.fn(),
    };
    const sheet = openSheet();
    expect(
      (within(sheet).getByRole("button", { name: "Remove signer" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("closes once the proposal is queued for the other signers", () => {
    mocks.report.mockReturnValue(true);
    mocks.mutate.mockImplementation((_change, options: { onError: (error: unknown) => void }) =>
      options.onError(new Error("queued")),
    );
    const sheet = openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: /Approvals required/ }));
    fireEvent.click(within(sheet).getByRole("radio", { name: "1 of 3" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Propose" }));
    expect(mocks.report).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the Safe's queue from Multisig transactions", () => {
    const sheet = openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: "Multisig transactions" }));
    expect(useSafeSheet.getState().safe).toBe(SAFE);
  });

  it("offers a retry when the signers cannot be read", () => {
    mocks.signers = { data: undefined, isError: true, refetch: vi.fn() };
    const sheet = openSheet();
    expect(within(sheet).getByRole("alert").textContent).toContain("could not be read");
    fireEvent.click(within(sheet).getByRole("button", { name: "Try again" }));
    expect(mocks.signers.refetch).toHaveBeenCalled();
  });
});
