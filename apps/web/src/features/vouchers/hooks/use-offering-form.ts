import { BackendApiError } from "@clc/api/client/errors";
import type { Offering, OfferingWrite } from "@clc/api/features/offerings/client";
import { OFFERING_UNITS, offeringWriteSchema } from "@clc/core/features/offerings/logic";
import { useForm } from "@clc/core/lib/forms";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  useCreateVoucherOffering,
  useUpdateVoucherOffering,
} from "#/features/wallet/hooks/use-offering-mutations";
import { useOfferingUnits } from "#/hooks/use-vocabulary";

/**
 * The unit an issuer picked, in their language.
 *
 * An exhaustive switch rather than a lookup object, and rather than the shared
 * package holding the words: `t` has to see each literal to extract it, and the
 * domain package is platform-agnostic so it carries no locale policy.
 */
function useUnitLabel(): (unit: string) => string {
  const { t } = useLingui();

  return (unit) => {
    switch (unit) {
      case "kg":
        return t`Kilogram`;
      case "g":
        return t`Gram`;
      case "litre":
        return t`Litre`;
      case "item":
        return t`Item`;
      case "hour":
        return t`Hour`;
      case "day":
        return t`Day`;
      case "bag":
        return t`Bag`;
      case "unit":
        return t`Unit`;
      case "bundle":
        return t`Bundle`;
      case "piece":
        return t`Piece`;
      case "dozen":
        return t`Dozen`;
      case "serving":
        return t`Serving`;
      case "trip":
        return t`Trip`;
      case "session":
        return t`Session`;
      case "metre":
        return t`Metre`;
      default:
        return unit;
    }
  };
}

/**
 * A voucher owner's create or edit form for one offering: the form, the unit
 * vocabulary, and the photo-upload latch. The sheet and the desktop dialog
 * render the same fields over this.
 */
export function useOfferingForm({
  offering,
  voucherAddress,
  defaultImageUrl,
  onClose,
}: {
  offering: Offering | null;
  voucherAddress: string;
  /** The issuer's profile photo, used only for a new offering. */
  defaultImageUrl: string | null;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const unitLabel = useUnitLabel();
  const unitsQuery = useOfferingUnits();
  const unitValues = [...(unitsQuery.data ?? OFFERING_UNITS)];
  if (offering?.unit && !unitValues.includes(offering.unit)) unitValues.push(offering.unit);
  const unitOptions = unitValues.map((unit) => ({ value: unit, label: unitLabel(unit) }));
  const create = useCreateVoucherOffering(voucherAddress);
  const update = useUpdateVoucherOffering(voucherAddress);
  const hasSeededDefaultImage = useRef(false);

  /**
   * Whether the photo field is mid-upload.
   *
   * The field uploads on selection and reports a URL, so a submit pressed while
   * that is in flight would send the value the form held before it.
   */
  const [photoBusy, setPhotoBusy] = useState(false);

  const saving = create.isPending || update.isPending;

  const form = useForm({
    defaultValues: {
      name: offering?.name ?? "",
      description: offering?.description ?? "",
      unit: offering?.unit ?? "",
      pricePerUnit: offering?.pricePerUnit ?? "",
      // A new offering starts with the issuer's profile photo, just like a
      // voucher deployment. Editing preserves the offering's own saved photo
      // (including an intentionally removed one).
      imageUrl: offering ? offering.imageUrl : defaultImageUrl,
    },
    validators: { onSubmit: offeringWriteSchema },
    onSubmit: async ({ value }) => {
      // By this point the photo is already a stored URL: the field uploads on
      // selection, so there is no upload to sequence here and a failed write
      // leaves that URL in the form rather than re-sending the bytes.
      const input = value as OfferingWrite;
      try {
        if (offering) {
          await update.mutateAsync({ id: offering.id, input });
          toast.success(t`Offering updated.`);
        } else {
          await create.mutateAsync(input);
          toast.success(t`Offering published.`);
        }
        onClose();
      } catch (error) {
        toast.error(
          error instanceof BackendApiError && error.code === "E11"
            ? t`Limit reached. Ask an administrator to increase your allowance.`
            : error instanceof Error
              ? error.message
              : t`Couldn't save the offering.`,
        );
      }
    },
  });

  // Profiles can arrive after the form mounts. Like the deployment forms, seed
  // only a pristine new record so a photo the issuer chose or removed is never
  // replaced by a late profile response.
  useEffect(() => {
    if (offering || hasSeededDefaultImage.current || !defaultImageUrl) return;
    hasSeededDefaultImage.current = true;
    if (form.getFieldMeta("imageUrl")?.isTouched || form.getFieldValue("imageUrl") !== null) return;
    form.setFieldValue("imageUrl", defaultImageUrl, { dontUpdateMeta: true });
  }, [defaultImageUrl, form, offering]);

  return {
    form,
    unitOptions,
    saving,
    photoBusy,
    setPhotoBusy,
    /** An imported row's free-text unit, which must be replaced before saving. */
    legacyUnit: offering?.unitLabel && !offering.unit ? offering.unitLabel : null,
  };
}
