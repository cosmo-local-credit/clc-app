import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { $getRoot, $selectAll, type LexicalEditor } from "lexical";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock("../hooks/use-update-voucher-profile", () => ({
  useUpdateVoucherProfile: () => ({ mutateAsync: mocks.updateProfile, isPending: false }),
}));

vi.mock("#/hooks/use-deployment", () => ({
  useTokenTags: () => ({
    data: ["Agriculture"],
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
  }),
}));

vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: () => <div data-testid="location-map" />,
}));

// The shell only defers the chunk; these tests are about the editor inside it.
vi.mock("#/components/ui/markdown-editor", async () => {
  const editor = await import("#/components/ui/markdown-editor-lexical");
  return { MarkdownEditor: editor.MarkdownEditorLexical };
});

import { VoucherProfileEditorSheet } from "./voucher-profile-editor-sheet";

const ADDRESS = "0xAbC0000000000000000000000000000000000123";

function detail(overrides: Partial<MarketVoucherDetail> = {}): MarketVoucherDetail {
  return {
    id: "2710",
    chainId: 42220,
    address: ADDRESS,
    name: "Priscilah Malii",
    symbol: "MALII",
    decimals: 2,
    ownerAddress: "0xDeF0000000000000000000000000000000000456",
    description: "Fresh produce and household goods.",
    voucherUoa: "KSH",
    voucherValue: "10",
    locationName: null,
    lat: null,
    lng: null,
    email: "",
    website: "",
    phone: "",
    terms: "https://example.org/terms",
    iconUrl: null,
    bannerUrl: null,
    tags: [],
    kind: "goods",
    ...overrides,
  };
}

function open(voucher: MarketVoucherDetail = detail()) {
  return render(<VoucherProfileEditorSheet open voucher={voucher} onClose={vi.fn()} />);
}

function termsEditor(): HTMLElement {
  return screen.getByRole("textbox", { name: "Shown to anyone holding this voucher" });
}

/** Writes into the terms and leaves the text selected for a toolbar press. */
async function writeTerms(text: string) {
  const root = termsEditor() as HTMLElement & { __lexicalEditor: LexicalEditor };
  await act(async () => {
    root.__lexicalEditor.update(() => {
      $getRoot().selectEnd().insertText(text);
    });
  });
  await act(async () => {
    root.__lexicalEditor.update(() => {
      $selectAll();
    });
  });
}

async function writeMyOwn() {
  await act(async () => {
    fireEvent.click(screen.getByRole("switch"));
  });
}

async function save() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  });
}

beforeEach(() => {
  mocks.updateProfile.mockReset().mockResolvedValue(detail());
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
});

describe("terms as a link", () => {
  it("opens on the URL field when that is what is stored", () => {
    open();

    expect((screen.getByLabelText("Terms URL") as HTMLInputElement).value).toBe(
      "https://example.org/terms",
    );
    expect(screen.queryByRole("textbox", { name: /Shown to anyone holding/ })).toBeNull();
  });

  it("saves an edited URL", async () => {
    open();

    fireEvent.change(screen.getByLabelText("Terms URL"), {
      target: { value: "https://example.org/rules" },
    });
    await save();

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledTimes(1));
    expect(mocks.updateProfile.mock.calls[0]?.[0]).toMatchObject({
      terms: "https://example.org/rules",
    });
  });

  it("refuses to save something that is not a link", async () => {
    open();

    fireEvent.change(screen.getByLabelText("Terms URL"), { target: { value: "ask at the stall" } });
    await save();

    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });
});

describe("terms written by the issuer", () => {
  it("opens on the editor when prose is stored, and shows it formatted", async () => {
    await act(async () => {
      open(detail({ terms: "## House rules\n\nRedeemable on **market days**." }));
    });

    expect(termsEditor().querySelector("h2")?.textContent).toBe("House rules");
    expect(termsEditor().querySelector("strong")?.textContent).toBe("market days");
    // No syntax to read, so no cheat sheet and nothing to preview.
    expect(screen.queryByRole("button", { name: "Preview" })).toBeNull();
    expect(screen.queryByText(/Markdown: \*\*bold\*\*/)).toBeNull();
  });

  it("saves what the toolbar wrote as markdown", async () => {
    open();
    await writeMyOwn();

    await writeTerms("Redeemable at our stall");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Bulleted list" }));
    });
    await save();

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledTimes(1));
    expect(mocks.updateProfile.mock.calls[0]?.[0]).toMatchObject({
      terms: "- Redeemable at our stall",
    });
  });

  it("clears the stored link when the owner switches to writing their own", async () => {
    open();
    await writeMyOwn();

    expect(termsEditor().textContent).toBe("");
  });

  it("refuses terms longer than the field allows", async () => {
    open();
    await writeMyOwn();

    await act(async () => {
      fireEvent.paste(termsEditor(), {
        clipboardData: {
          files: [],
          getData: (type: string) => (type === "text/plain" ? "x".repeat(5001) : ""),
          types: ["text/plain"],
        },
      });
    });

    expect(termsEditor().textContent).toBe("");
  });
});
