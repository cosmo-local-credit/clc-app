import { type LocationInput, locationSchema } from "@clc/core/features/location/logic";
import {
  type PoolCreateInput,
  PoolOracleUnavailableError,
  type PoolPricing,
  chainHasPoolOracle,
  hasPoolOracleBaseCurrency,
  poolCreateSchemaForChain,
  poolDescriptionSchema,
  poolFeeAddressSchema,
  poolNameSchema,
  poolSwapFeeSchema,
  poolSymbolSchema,
  poolTermsSchema,
  poolUnitSchemaForPricing,
  toPoolDeployPayload,
} from "@clc/core/features/pools/logic";
import {
  isHttpUrl,
  optionalEmailSchema,
  optionalPhoneSchema,
  optionalTermsTextSchema,
  optionalTermsUrlSchema,
  optionalWebsiteSchema,
} from "@clc/core/lib/contact";
import { profilePrefill } from "@clc/core/features/signup/prefill";
import { useForm } from "@clc/core/lib/forms";
import type { UnitOfAccount } from "@clc/core/lib/currencies";
import { BackendApiError, formatBackendApiError } from "@clc/api/client/errors";
import { useLingui } from "@lingui/react/macro";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getAddress } from "viem";
import { useConnection } from "wagmi";

import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { useDeployPool } from "#/features/pools/hooks/use-pool-deployment";
import { usePoolCreateDraft } from "#/features/pools/state/pool-create-draft";
import { useTokenTags } from "#/hooks/use-deployment";
import { useNameAvailabilityValidator } from "#/hooks/use-name-availability";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { useSuggestedSymbol } from "#/hooks/use-suggested-symbol";
import { isStorageConfigured } from "#/lib/api/storage";
import { CHAIN_ID } from "#/lib/chain";
import { useViewDraft } from "#/lib/view-drafts";
import {
  beginPoolCreateHistory,
  exitPoolCreateHistory,
} from "#/lib/navigation/pool-create-history";

export type PoolCreateStep = "pool" | "place" | "review";

type PoolFormValues = Omit<PoolCreateInput, "location" | "acceptedTerms"> & {
  location: LocationInput | undefined;
  /** Form-only: whether `terms` is a link or the terms themselves. */
  termsMode: "url" | "text";
  acceptedTerms: boolean;
};

const DEFAULT_VALUES: PoolFormValues = {
  name: "",
  symbol: "",
  unitOfAccount: "KES",
  description: "",
  pricing: "relative",
  feePolicyDefault: "0",
  feesDecoupled: false,
  feeAddress: "",
  location: undefined,
  tags: [],
  email: "",
  website: "",
  phone: "",
  terms: "",
  termsMode: "url",
  imageUrl: "",
  acceptedTerms: false,
};

/**
 * Keep completed logo URLs and removals along with the written fields. Local
 * upload previews stay in their view; terms acceptance is asked for afresh.
 */
type PoolFormDraft = Omit<PoolFormValues, "imageUrl" | "acceptedTerms"> & {
  imageUrl?: string;
};

function poolDraftOf(values: PoolFormValues): PoolFormDraft {
  const { imageUrl, acceptedTerms: _acceptedTerms, ...fields } = values;
  return imageUrl === "" || (typeof imageUrl === "string" && isHttpUrl(imageUrl))
    ? { ...fields, imageUrl }
    : fields;
}

/** The text fields a saved profile can seed, all of which default to "". */
type SeedableTextField = "name" | "email" | "phone" | "website" | "description" | "imageUrl";

const DETAIL_FIELDS = [
  "name",
  "symbol",
  "unitOfAccount",
  "description",
  "feePolicyDefault",
] as const;
/** Detail fields folded under "Advanced"; an error there has to unfold it to be seen. */
const ADVANCED_FIELDS = ["symbol", "feePolicyDefault"] as const;
const PLACE_FIELDS = ["location", "email", "website", "phone", "terms", "imageUrl"] as const;

/**
 * The create-pool form and its three-step machine, shared by the phone flow
 * and the desktop wizard. Each view renders its own fields over `form` with
 * the `validators` given here, and calls the step and side-effect handlers.
 *
 * `revealAdvanced` unfolds the view's "Advanced" disclosure when a field folded
 * inside it fails validation on Next.
 */
export function useCreatePoolForm({
  step,
  revealAdvanced,
}: {
  step: PoolCreateStep;
  revealAdvanced: () => void;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const router = useRouter();
  const { address, chainId } = useConnection();
  // Pre-connect the form still has to validate, so it assumes the chain this
  // build was configured for — which is the one the wallet will connect to.
  const activeChainId = chainId ?? CHAIN_ID;
  const hasOracle = chainHasPoolOracle(activeChainId);
  const defaultPricing: PoolPricing = "relative";
  const poolCreateSchema = poolCreateSchemaForChain(activeChainId);
  const deployPool = useDeployPool();
  const usage = useResourceUsage();
  const tagsQuery = useTokenTags();
  const profileQuery = useAuthProfile();
  const draft = usePoolCreateDraft((state) => state.draft);
  const setDraft = usePoolCreateDraft((state) => state.setDraft);
  const viewDraft = useViewDraft<PoolFormDraft>({ scope: "pool-create", account: address });
  const restored = viewDraft.restored;
  const hasPrefilledProfile = useRef(false);
  const suggestedSymbol = useSuggestedSymbol({
    kind: "pool",
    initialSymbol: restored?.symbol ?? draft?.symbol ?? "",
  });
  const checkNameAvailable = useNameAvailabilityValidator("pool");
  const [logoBusy, setLogoBusy] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  // The store is a submitted-value retry snapshot, not live draft persistence. A fresh mount after
  // receipt failure is what causes TanStack Form to consume these defaults again.
  const [pristine] = useState<PoolFormValues>(() =>
    draft
      ? {
          ...draft,
          termsMode: draft.terms && !isHttpUrl(draft.terms) ? "text" : "url",
          acceptedTerms: false,
        }
      : { ...DEFAULT_VALUES, pricing: defaultPricing },
  );
  const form = useForm({
    // A draft carried over a view swap is newer than a retry snapshot: it holds
    // what was typed since, so it goes on top.
    defaultValues: restored ? { ...pristine, ...restored, acceptedTerms: false } : pristine,
    validators: {
      // The form-only terms mode is deliberately absent from the persisted
      // create input, so translate the Standard Schema issues by field.
      onSubmit: ({ value }) => {
        const result = poolCreateSchema.safeParse(value);
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
      if (usage.isError || !usage.data?.pools.canCreate) return;
      if (!address || chainId === undefined) {
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
      const parsed = poolCreateSchema.parse({ ...value, symbol: check.symbol });
      setDraft(parsed);
      try {
        const result = await deployPool.mutateAsync(
          toPoolDeployPayload(parsed, getAddress(address), chainId),
        );
        viewDraft.clear();
        exitPoolCreateHistory({
          history: router.history,
          destination: `/pools/create/receipt?trackingId=${encodeURIComponent(result.trackingId)}`,
        });
      } catch (error) {
        if (error instanceof BackendApiError && error.code === "E11") {
          toast.error(t`Limit reached. Ask an administrator to increase your allowance.`);
          return;
        }
        // See create-voucher-flow: the availability check is advisory, so the
        // name can be taken between step 1 and publish.
        if (error instanceof BackendApiError && error.kind === "conflict") {
          toast.error(t`That pool name was taken while you were filling this in.`);
          void navigate({ to: "/pools/create/$step", params: { step: "pool" } });
          void form.validateField("name", "submit");
          return;
        }
        toast.error(
          error instanceof BackendApiError
            ? formatBackendApiError(error)
            : error instanceof PoolOracleUnavailableError
              ? t`The selected unit does not have a configured price feed.`
              : error instanceof Error
                ? error.message
                : t`Couldn't publish your pool.`,
        );
      }
    },
  });

  // A steward already gave all of this during onboarding, so the form starts
  // from it. Only an untouched field still holding its default is seeded — a
  // retry draft, or anything typed over, always wins.
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
    seedText("name", prefill.name ? `${prefill.name} Pool` : "");
    // The bio is free text with no minimum, so it only becomes a description
    // when it would pass as one.
    if (poolDescriptionSchema.safeParse(prefill.description).success) {
      seedText("description", prefill.description);
    }
    // Only where the upload fields are rendered: seeding a hidden field would
    // attach a photo the steward was never shown.
    if (isStorageConfigured) seedText("imageUrl", prefill.imageUrl);

    // A pool unit is the narrower set, and under oracle pricing it also has to
    // be one this chain has a feed for — so the preference is offered to the
    // same schema the field itself validates against rather than assumed.
    const preferredUnit = poolUnitSchemaForPricing(
      form.getFieldValue("pricing"),
      activeChainId,
    ).safeParse(prefill.unitOfAccount);
    if (
      preferredUnit.success &&
      !form.getFieldMeta("unitOfAccount")?.isTouched &&
      form.getFieldValue("unitOfAccount") === DEFAULT_VALUES.unitOfAccount
    ) {
      form.setFieldValue("unitOfAccount", preferredUnit.data, { dontUpdateMeta: true });
    }

    if (
      prefill.location &&
      !form.getFieldMeta("location")?.isTouched &&
      form.getFieldValue("location") === undefined
    ) {
      form.setFieldValue("location", prefill.location, { dontUpdateMeta: true });
    }
  }, [activeChainId, draft, form, profileQuery.data, restored]);

  // Keep the typed fields for a phone/desktop view swap while they differ from
  // how the form opened; forget them when they are back to that.
  const { save: saveViewDraft, clear: clearViewDraft } = viewDraft;
  useEffect(() => {
    const opened = JSON.stringify(poolDraftOf(pristine));
    let seen: unknown;
    const sync = () => {
      const { values } = form.store.state;
      // Submitting and validating also touch the store; only a changed value
      // may write, or a cleared draft would come straight back.
      if (values === seen) return;
      seen = values;
      const fields = poolDraftOf(values);
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
    if (restored) revealAdvanced();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  useEffect(() => {
    if (step === "pool") beginPoolCreateHistory(router.history);
  }, [router.history, step]);

  useEffect(() => {
    if (step === "pool") return;
    if (poolNameSchema.safeParse(form.getFieldValue("name")).success) return;
    void navigate({ to: "/pools/create/$step", params: { step: "pool" }, replace: true });
  }, [form, navigate, step]);

  async function fieldsAreValid(fields: readonly (keyof PoolFormValues)[]) {
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

  /** The name field lost focus: offer a symbol derived from it. */
  function suggestSymbolFor(name: string) {
    void suggestedSymbol.suggest(name).then((symbol) => {
      if (symbol !== undefined) form.setFieldValue("symbol", symbol);
    });
  }

  /** Upper-cases a typed symbol and records it as the user's own. */
  function normalizeSymbol(value: string) {
    const symbol = value.toUpperCase();
    suggestedSymbol.track(symbol);
    return symbol;
  }

  /** Oracle pricing needs a unit with a feed; another unit falls back to relative. */
  function syncPricingToUnit(unit: UnitOfAccount) {
    if (
      form.getFieldValue("pricing") === "oracle" &&
      !hasPoolOracleBaseCurrency(unit, activeChainId)
    ) {
      form.setFieldValue("pricing", "relative");
    }
  }

  /** The fee recipient and fee mode follow the swap fee in and out of zero. */
  function syncFeeFields(fee: string) {
    if (Number(fee) > 0) {
      // The recipient starts as the connected wallet, which is where the pool
      // pays fees when nothing else is named. Seeded, not bound: a steward who
      // typed another address keeps it.
      if (address && form.getFieldValue("feeAddress") === "") {
        form.setFieldValue("feeAddress", getAddress(address), { dontUpdateMeta: true });
      }
      return;
    }
    form.setFieldValue("feesDecoupled", false, { dontUpdateMeta: true });
    form.setFieldValue("feeAddress", "", { dontUpdateMeta: true });
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
          revealAdvanced();
        }
        return;
      }
    } finally {
      setAdvancing(false);
    }
    void navigate({ to: "/pools/create/$step", params: { step: "place" } });
  }

  async function goToReview() {
    if (logoBusy) return;
    if (!(await fieldsAreValid(PLACE_FIELDS))) return;
    void navigate({ to: "/pools/create/$step", params: { step: "review" } });
  }

  const validators = {
    name: {
      onBlur: poolNameSchema,
      onSubmit: poolNameSchema,
      onChangeAsync: checkNameAvailable,
      onSubmitAsync: checkNameAvailable,
    },
    unitOfAccount: (pricing: PoolPricing) => ({
      onBlur: poolUnitSchemaForPricing(pricing, activeChainId),
      onSubmit: poolUnitSchemaForPricing(pricing, activeChainId),
    }),
    description: { onBlur: poolDescriptionSchema, onSubmit: poolDescriptionSchema },
    symbol: { onBlur: poolSymbolSchema, onSubmit: poolSymbolSchema },
    feePolicyDefault: { onBlur: poolSwapFeeSchema, onSubmit: poolSwapFeeSchema },
    feeAddress: { onBlur: poolFeeAddressSchema, onSubmit: poolFeeAddressSchema },
    location: { onSubmit: locationSchema },
    email: { onBlur: optionalEmailSchema, onSubmit: optionalEmailSchema },
    website: { onBlur: optionalWebsiteSchema, onSubmit: optionalWebsiteSchema },
    phone: { onBlur: optionalPhoneSchema, onSubmit: optionalPhoneSchema },
    termsText: { onBlur: optionalTermsTextSchema, onSubmit: optionalTermsTextSchema },
    termsUrl: { onBlur: optionalTermsUrlSchema, onSubmit: optionalTermsUrlSchema },
    acceptedTerms: { onSubmit: poolTermsSchema },
  };

  return {
    form,
    validators,
    activeChainId,
    hasOracle,
    usage,
    deployPool,
    tagsQuery,
    advancing,
    logoBusy,
    setLogoBusy,
    canPublish: !usage.isError && Boolean(usage.data?.pools.canCreate),
    fillSuggestedSymbol,
    suggestSymbolFor,
    normalizeSymbol,
    syncPricingToUnit,
    syncFeeFields,
    goToPlace,
    goToReview,
  };
}
