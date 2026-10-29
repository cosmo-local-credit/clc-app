import { BackendApiError, formatBackendApiError } from "@clc/api/client/errors";
import type { LocationInput } from "@clc/core/features/location/logic";
import type { MarkerColor, MarkerIcon } from "@clc/core/features/markers/logic";
import { profilePrefill } from "@clc/core/features/signup/prefill";
import {
  toVoucherDeployPayload,
  type VoucherUnit,
  voucherCreateSchema,
  voucherDescriptionSchema,
  voucherNameSchema,
} from "@clc/core/features/vouchers/logic";
import { isHttpUrl } from "@clc/core/lib/contact";
import { useForm } from "@clc/core/lib/forms";
import { useLingui } from "@lingui/react/macro";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getAddress } from "viem";
import { useConnection } from "wagmi";

import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { useDeployVoucher } from "#/features/vouchers/hooks/use-voucher-deployment";
import { useVoucherCreateDraft } from "#/features/vouchers/state/voucher-create-draft";
import { useTokenTags } from "#/hooks/use-deployment";
import { useNameAvailabilityValidator } from "#/hooks/use-name-availability";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { useSuggestedSymbol } from "#/hooks/use-suggested-symbol";
import { isStorageConfigured } from "#/lib/api/storage";
import { useViewDraft } from "#/lib/view-drafts";
import {
  beginVoucherCreateHistory,
  exitVoucherCreateHistory,
} from "#/lib/navigation/voucher-create-history";

export type VoucherCreateStep = "voucher" | "place" | "review";

type VoucherFormValues = {
  name: string;
  symbol: string;
  price: string;
  unitOfAccount: VoucherUnit;
  description: string;
  voucherType: "standard";
  expiryDate: string;
  decimals: string;
  supply: string;
  location: LocationInput | undefined;
  tags: string[];
  email: string;
  website: string;
  phone: string;
  terms: string;
  /** Form-only: whether `terms` is a link or the terms themselves. */
  termsMode: "url" | "text";
  iconUrl: string;
  markerIcon: MarkerIcon | null;
  markerColor: MarkerColor | null;
  acceptedTerms: boolean;
};

export const VOUCHER_FORM_DEFAULTS: VoucherFormValues = {
  name: "",
  symbol: "",
  price: "1",
  unitOfAccount: "KES",
  description: "",
  voucherType: "standard",
  expiryDate: "",
  decimals: "6",
  supply: "1000",
  location: undefined,
  tags: [],
  email: "",
  website: "",
  phone: "",
  terms: "",
  termsMode: "url",
  iconUrl: "",
  markerIcon: null,
  markerColor: null,
  acceptedTerms: false,
};

/**
 * Keep completed icon URLs and removals along with the written fields. Local
 * upload previews stay in their view; terms acceptance is asked for afresh.
 */
type VoucherFormDraft = Omit<VoucherFormValues, "iconUrl" | "acceptedTerms"> & {
  iconUrl?: string;
};

function voucherDraftOf(values: VoucherFormValues): VoucherFormDraft {
  const { iconUrl, acceptedTerms: _acceptedTerms, ...fields } = values;
  return iconUrl === "" || isHttpUrl(iconUrl) ? { ...fields, iconUrl } : fields;
}

/** The text fields a saved profile can seed, all of which default to "". */
type SeedableTextField = "name" | "email" | "phone" | "website" | "description" | "iconUrl";

const DETAIL_FIELDS = ["name", "symbol", "price", "supply", "description"] as const;
/** Detail fields folded under "Advanced"; an error there has to unfold it to be seen. */
const ADVANCED_FIELDS = ["symbol", "price", "unitOfAccount"] as const;
const PLACE_FIELDS = ["location", "email", "website", "phone", "terms", "iconUrl"] as const;

/**
 * The voucher creation form and its three-step machine, shared by the phone
 * flow and the desktop wizard. The caller renders the fields; this owns the
 * values, the profile prefill, step guards, symbol suggestion and publishing.
 *
 * `revealAdvanced` is called when Next is refused for a field the caller keeps
 * inside a disclosure, so the caller can open it.
 */
export function useCreateVoucherForm({
  step,
  revealAdvanced,
}: {
  step: VoucherCreateStep;
  revealAdvanced?: () => void;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const router = useRouter();
  const { address } = useConnection();
  const deployVoucher = useDeployVoucher();
  const usage = useResourceUsage();
  const tagsQuery = useTokenTags();
  const profileQuery = useAuthProfile();
  const draft = useVoucherCreateDraft((state) => state.draft);
  const setDraft = useVoucherCreateDraft((state) => state.setDraft);
  const viewDraft = useViewDraft<VoucherFormDraft>({ scope: "voucher-create", account: address });
  const restored = viewDraft.restored;
  const hasPrefilledProfile = useRef(false);
  const suggestedSymbol = useSuggestedSymbol({
    kind: "voucher",
    initialSymbol: restored?.symbol ?? draft?.symbol ?? "",
  });
  const checkNameAvailable = useNameAvailabilityValidator("voucher");
  const [iconBusy, setIconBusy] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  const [pristine] = useState<VoucherFormValues>(() =>
    draft
      ? {
          ...draft,
          voucherType: "standard",
          expiryDate: "",
          decimals: "6",
          iconUrl: draft.iconUrl ?? "",
          termsMode: draft.terms && !isHttpUrl(draft.terms) ? "text" : "url",
          acceptedTerms: false,
        }
      : VOUCHER_FORM_DEFAULTS,
  );
  const form = useForm({
    // A draft carried over a view swap is newer than a retry snapshot: it holds
    // what was typed since, so it goes on top.
    defaultValues: restored ? { ...pristine, ...restored, acceptedTerms: false } : pristine,
    validators: {
      // A function rather than the schema itself: the form carries `termsMode`,
      // which the schema neither knows nor needs, so the two types differ.
      onSubmit: ({ value }) => {
        const result = voucherCreateSchema.safeParse(value);
        if (result.success) return undefined;
        const fields: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const key = issue.path.map(String).join(".");
          if (key !== "" && !(key in fields)) fields[key] = issue.message;
        }
        return { fields };
      },
    },
    onSubmit: async ({ value }) => {
      if (usage.isError || !usage.data?.vouchers.canCreate) return;
      if (!address) {
        toast.error(t`Connect your wallet before publishing.`);
        return;
      }
      const check = await suggestedSymbol.confirm(value.name, value.symbol);
      if (!check.ok) {
        toast.error(t`That symbol is already in use.`);
        return;
      }
      if (check.symbol !== value.symbol) {
        form.setFieldValue("symbol", check.symbol);
        toast.info(t`Symbol was taken, using ${check.symbol} instead.`);
      }
      const parsed = voucherCreateSchema.parse({
        ...value,
        symbol: check.symbol,
        voucherType: "standard",
        expiryDate: "",
        decimals: "6",
      });
      setDraft(parsed);
      try {
        const result = await deployVoucher.mutateAsync(
          toVoucherDeployPayload(parsed, getAddress(address)),
        );
        viewDraft.clear();
        // The opening supply rides along in the URL so the receipt can mint it
        // as soon as the contract confirms, even after a reload loses the draft.
        exitVoucherCreateHistory({
          history: router.history,
          destination: `/vouchers/create/receipt?trackingId=${encodeURIComponent(result.trackingId)}&mintAmount=${encodeURIComponent(parsed.supply.trim())}`,
        });
      } catch (error) {
        // The availability check is advisory, so a name free when the user left
        // step 1 can be taken by the time they publish. Say which field is
        // wrong and put them back in front of it rather than leaving a raw
        // error code under a review screen they cannot act on.
        if (error instanceof BackendApiError && error.code === "E11") {
          toast.error(t`Limit reached. Ask an administrator to increase your allowance.`);
          return;
        }
        if (error instanceof BackendApiError && error.kind === "conflict") {
          toast.error(t`That voucher name was taken while you were filling this in.`);
          void navigate({ to: "/vouchers/create/$step", params: { step: "voucher" } });
          void form.validateField("name", "submit");
          return;
        }
        toast.error(
          error instanceof BackendApiError
            ? formatBackendApiError(error)
            : error instanceof Error
              ? error.message
              : t`Couldn't publish your voucher.`,
        );
      }
    },
  });

  // Everything the issuer already told us about themselves during onboarding is
  // the same thing this form asks for again, so it starts filled in. Only an
  // untouched field still holding its default is seeded — a retry draft, or a
  // value the issuer has typed over, always wins.
  useEffect(() => {
    const profile = profileQuery.data;
    // A draft from the other view already holds what was typed, or left empty.
    if (hasPrefilledProfile.current || !profile || draft || restored) return;
    hasPrefilledProfile.current = true;

    const prefill = profilePrefill(profile);

    function seedText(name: SeedableTextField, value: string) {
      if (!value) return;
      if (form.getFieldMeta(name)?.isTouched) return;
      if (form.getFieldValue(name) !== "") return;
      form.setFieldValue(name, value, { dontUpdateMeta: true });
    }

    seedText("email", prefill.email);
    seedText("phone", prefill.phone);
    seedText("website", prefill.website);
    seedText("name", prefill.name ? `${prefill.name} Voucher` : "");
    // The bio is free text with no minimum, so it only becomes a description
    // when it would pass as one.
    if (voucherDescriptionSchema.safeParse(prefill.description).success) {
      seedText("description", prefill.description);
    }
    // Only where the upload fields are rendered: seeding a hidden field would
    // attach a photo the issuer was never shown.
    if (isStorageConfigured) seedText("iconUrl", prefill.imageUrl);

    if (
      prefill.unitOfAccount &&
      !form.getFieldMeta("unitOfAccount")?.isTouched &&
      form.getFieldValue("unitOfAccount") === VOUCHER_FORM_DEFAULTS.unitOfAccount
    ) {
      form.setFieldValue("unitOfAccount", prefill.unitOfAccount, { dontUpdateMeta: true });
    }

    if (
      prefill.location &&
      !form.getFieldMeta("location")?.isTouched &&
      form.getFieldValue("location") === undefined
    ) {
      form.setFieldValue("location", prefill.location, { dontUpdateMeta: true });
    }
  }, [draft, form, profileQuery.data, restored]);

  // Keep the typed fields for a phone/desktop view swap while they differ from
  // how the form opened; forget them when they are back to that.
  const { save: saveViewDraft, clear: clearViewDraft } = viewDraft;
  useEffect(() => {
    const opened = JSON.stringify(voucherDraftOf(pristine));
    let seen: unknown;
    const sync = () => {
      const { values } = form.store.state;
      // Submitting and validating also touch the store; only a changed value
      // may write, or a cleared draft would come straight back.
      if (values === seen) return;
      seen = values;
      const fields = voucherDraftOf(values);
      if (JSON.stringify(fields) === opened) clearViewDraft();
      else saveViewDraft(fields);
    };
    sync();
    const subscription = form.store.subscribe(sync);
    return () => subscription.unsubscribe();
  }, [clearViewDraft, form, pristine, saveViewDraft]);

  useEffect(() => {
    // Advanced is a fold each view keeps for itself; a draft carried over a view
    // swap may hold values inside it, so open it, once, on arrival.
    if (restored) revealAdvanced?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  useEffect(() => {
    if (step === "voucher") beginVoucherCreateHistory(router.history);
  }, [router.history, step]);

  useEffect(() => {
    if (step === "voucher") return;
    if (voucherNameSchema.safeParse(form.getFieldValue("name")).success) return;
    void navigate({
      to: "/vouchers/create/$step",
      params: { step: "voucher" },
      replace: true,
    });
  }, [form, navigate, step]);

  async function fieldsAreValid(fields: readonly (keyof VoucherFormValues)[]) {
    const results = await Promise.all(
      fields.map((field) => Promise.resolve(form.validateField(field, "submit"))),
    );
    return results.every((errors) => errors.length === 0);
  }

  /**
   * Writes the derived symbol into the still-empty field.
   *
   * Called both when "Advanced" unfolds and on the way out of the step: the
   * field is only ever looked at from inside the disclosure, so a suggestion
   * that arrives at Next is one the user never sees being made.
   */
  async function fillSuggestedSymbol() {
    if (form.getFieldValue("symbol") !== "") return;
    const symbol = await suggestedSymbol.suggest(form.getFieldValue("name"));
    if (symbol) form.setFieldValue("symbol", symbol);
  }

  /** The name field's blur: suggest a symbol from the name just typed. */
  function suggestSymbolFor(name: string) {
    void suggestedSymbol.suggest(name).then((symbol) => {
      if (symbol !== undefined) form.setFieldValue("symbol", symbol);
    });
  }

  async function goToPlace() {
    // The symbol lookup and the name check reach the backend, so Next waits
    // visibly rather than looking dead.
    setAdvancing(true);
    try {
      // Blur may not have fired, or its lookup may still be in flight.
      await fillSuggestedSymbol();
      if (!(await fieldsAreValid(DETAIL_FIELDS))) {
        if (ADVANCED_FIELDS.some((field) => (form.getFieldMeta(field)?.errors.length ?? 0) > 0)) {
          revealAdvanced?.();
        }
        return;
      }
    } finally {
      setAdvancing(false);
    }
    void navigate({ to: "/vouchers/create/$step", params: { step: "place" } });
  }

  async function goToReview() {
    if (iconBusy) return;
    if (!(await fieldsAreValid(PLACE_FIELDS))) return;
    void navigate({ to: "/vouchers/create/$step", params: { step: "review" } });
  }

  return {
    form,
    usage,
    /** The issuer may not create another voucher, or usage could not be read. */
    blocked: usage.isError || !usage.data?.vouchers.canCreate,
    deployVoucher,
    tagsQuery,
    profile: profileQuery.data,
    checkNameAvailable,
    trackSymbol: (symbol: string) => suggestedSymbol.track(symbol),
    suggestSymbolFor,
    fillSuggestedSymbol,
    iconBusy,
    setIconBusy,
    advancing,
    goToPlace,
    goToReview,
  };
}
