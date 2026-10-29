import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ deploy: vi.fn(), save: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useRouter: () => ({ history: {} }),
}));
vi.mock("wagmi", () => ({
  useConnection: () => ({ address: "0x1111111111111111111111111111111111111111", chainId: 100 }),
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ address: "0x1111111111111111111111111111111111111111" }),
}));
vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({ data: undefined }),
}));
vi.mock("#/features/pools/hooks/use-pool-deployment", () => ({
  useDeployPool: () => ({ mutateAsync: mocks.deploy, isPending: false }),
}));
vi.mock("#/features/vouchers/hooks/use-voucher-deployment", () => ({
  useDeployVoucher: () => ({ mutateAsync: mocks.deploy, isPending: false }),
}));
vi.mock("#/lib/api/catalogs", () => ({
  catalogsClient: { create: mocks.save, update: mocks.save },
}));
vi.mock("#/lib/api/wants", () => ({ wantsClient: { create: mocks.save, update: mocks.save } }));
vi.mock("#/hooks/use-resource-usage", () => ({
  useResourceUsage: () => ({ data: { vouchers: { canCreate: true }, pools: { canCreate: true } } }),
}));
vi.mock("#/hooks/use-deployment", () => ({ useTokenTags: () => ({ data: [] }) }));
vi.mock("#/hooks/use-name-availability", () => ({ useNameAvailabilityValidator: () => vi.fn() }));
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: true }));
vi.mock("#/lib/navigation/pool-create-history", () => ({ beginPoolCreateHistory: vi.fn() }));
vi.mock("#/lib/navigation/voucher-create-history", () => ({ beginVoucherCreateHistory: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn() } }));

import { DESKTOP_MEDIA } from "#/desktop/layout";
import { LayoutSwitch } from "#/desktop/switch";
import { useCatalogForm } from "#/features/catalogs/hooks/use-catalog-form";
import { useCreatePoolForm } from "#/features/pools/hooks/use-create-pool-form";
import { usePoolCreateDraft } from "#/features/pools/state/pool-create-draft";
import { useCreateVoucherForm } from "#/features/vouchers/hooks/use-create-voucher-form";
import { useVoucherCreateDraft } from "#/features/vouchers/state/voucher-create-draft";
import { useWantForm, type WantFormProfile } from "#/features/wants/hooks/use-want-form";
import { clearViewDrafts, useViewDraftStore } from "#/lib/view-drafts";

const COMPLETED = "https://storage.example/completed-image.webp";
const PROFILE = {
  country: "KE",
  geoLat: -3.51,
  geoLng: 39.9,
  locationName: "Kilifi",
} as WantFormProfile;

function MediaFields({
  image,
  name,
  accepted,
  setImage,
  setName,
  accept,
}: {
  image: string | null;
  name: string;
  accepted?: boolean;
  setImage: (value: string) => void;
  setName: (value: string) => void;
  accept?: () => void;
}) {
  return (
    <>
      <output aria-label="Image">{image ?? ""}</output>
      <output aria-label="Name">{name}</output>
      <output aria-label="Terms">{String(accepted ?? false)}</output>
      <button type="button" onClick={() => setImage(COMPLETED)}>
        Complete upload
      </button>
      <button type="button" onClick={() => setImage("")}>
        Remove image
      </button>
      <button
        type="button"
        onClick={() => {
          setName("Edited name");
          setImage("blob:https://app.test/pending");
        }}
      >
        Pending upload
      </button>
      <button type="button" onClick={accept}>
        Accept terms
      </button>
    </>
  );
}

function WantEditor() {
  const editor = useWantForm({ profile: PROFILE });
  return (
    <MediaFields
      image={editor.imageUrl}
      name={editor.name}
      setImage={editor.setImageUrl}
      setName={editor.setName}
    />
  );
}
function CatalogEditor() {
  const { form } = useCatalogForm({ onSaved: vi.fn() });
  return (
    <form.Subscribe selector={(state) => state.values}>
      {(values) => (
        <MediaFields
          image={values.imageUrl ?? ""}
          name={values.name}
          setImage={(value) => form.setFieldValue("imageUrl", value)}
          setName={(value) => form.setFieldValue("name", value)}
        />
      )}
    </form.Subscribe>
  );
}
function VoucherEditor() {
  const { form } = useCreateVoucherForm({ step: "voucher" });
  return (
    <form.Subscribe selector={(state) => state.values}>
      {(values) => (
        <>
          <output aria-label="Form values">{JSON.stringify(values)}</output>
          <MediaFields
            image={values.iconUrl}
            name={values.name}
            accepted={values.acceptedTerms}
            accept={() => form.setFieldValue("acceptedTerms", true)}
            setImage={(value) => form.setFieldValue("iconUrl", value)}
            setName={(value) => form.setFieldValue("name", value)}
          />
        </>
      )}
    </form.Subscribe>
  );
}
function PoolEditor() {
  const { form } = useCreatePoolForm({ step: "pool", revealAdvanced: vi.fn() });
  return (
    <form.Subscribe selector={(state) => state.values}>
      {(values) => (
        <>
          <output aria-label="Form values">{JSON.stringify(values)}</output>
          <MediaFields
            image={values.imageUrl ?? ""}
            name={values.name}
            accepted={values.acceptedTerms}
            accept={() => form.setFieldValue("acceptedTerms", true)}
            setImage={(value) => form.setFieldValue("imageUrl", value)}
            setName={(value) => form.setFieldValue("name", value)}
          />
        </>
      )}
    </form.Subscribe>
  );
}

const media = { matches: false, listeners: new Set<() => void>() };
function resize(desktop: boolean) {
  act(() => {
    media.matches = desktop;
    for (const listener of media.listeners) listener();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearViewDrafts();
  usePoolCreateDraft.getState().clearDraft();
  useVoucherCreateDraft.getState().clearDraft();
  media.matches = false;
  media.listeners.clear();
  document.documentElement.dataset.layout = "mobile";
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query === DESKTOP_MEDIA && media.matches;
    },
    addEventListener: (_: string, listener: () => void) => media.listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => media.listeners.delete(listener),
  }));
});

describe.each([
  ["voucher", VoucherEditor, useVoucherCreateDraft],
  ["pool", PoolEditor, usePoolCreateDraft],
] as const)("%s retry confirmation across a layout switch", (_, Editor, draftStore) => {
  it("does not inherit terms acceptance from the submitted retry snapshot", () => {
    const first = render(
      <QueryClientProvider client={new QueryClient()}>
        <Editor />
      </QueryClientProvider>,
    );
    const previousInput = JSON.parse(screen.getByLabelText("Form values").textContent ?? "{}");
    first.unmount();
    draftStore.getState().setDraft({ ...previousInput, acceptedTerms: true });
    function Mobile() {
      return <Editor />;
    }
    function Desktop() {
      return <Editor />;
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LayoutSwitch mobile={<Mobile />} desktop={<Desktop />} />
      </QueryClientProvider>,
    );
    resize(true);
    expect(screen.getByLabelText("Terms").textContent).toBe("false");
    expect(mocks.deploy).not.toHaveBeenCalled();
  });
});
afterEach(() => {
  clearViewDrafts();
  delete document.documentElement.dataset.layout;
  vi.unstubAllGlobals();
});

describe.each([
  ["Want", WantEditor],
  ["catalog", CatalogEditor],
  ["voucher", VoucherEditor],
  ["pool", PoolEditor],
] as const)("Completed %s image across a layout switch", (_, Editor) => {
  function open() {
    function Mobile() {
      return <Editor />;
    }
    function Desktop() {
      return <Editor />;
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LayoutSwitch mobile={<Mobile />} desktop={<Desktop />} />
      </QueryClientProvider>,
    );
  }
  it("keeps the completed URL in both directions without saving or deploying", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Complete upload" }));
    resize(true);
    expect(screen.getByLabelText("Image").textContent).toBe(COMPLETED);
    resize(false);
    expect(screen.getByLabelText("Image").textContent).toBe(COMPLETED);
    expect(mocks.deploy).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("keeps image removal and requires terms acceptance again", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Complete upload" }));
    resize(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    fireEvent.click(screen.getByRole("button", { name: "Accept terms" }));
    resize(false);
    expect(screen.getByLabelText("Image").textContent).toBe("");
    expect(screen.getByLabelText("Terms").textContent).toBe("false");
    expect(JSON.stringify(useViewDraftStore.getState().entries)).not.toContain("acceptedTerms");
  });
  it("excludes an in-flight local URL without dropping the edited name", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Pending upload" }));
    expect(JSON.stringify(useViewDraftStore.getState().entries)).not.toMatch(/blob:|data:/);
    resize(true);
    expect(screen.getByLabelText("Image").textContent).toBe("");
    expect(screen.getByLabelText("Name").textContent).toBe("Edited name");
  });
});
