import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { isVoucherDisplaySymbolConflict } from "@clc/api/features/symbols/client";
import type { LocationInput } from "@clc/core/features/location/logic";
import { markerColorSchema, markerIconSchema } from "@clc/core/features/markers/logic";
import { voucherProfileTextSchema } from "@clc/core/features/vouchers/logic";
import { isHttpUrl } from "@clc/core/lib/contact";
import { useForm } from "@clc/core/lib/forms";
import { parseVoucherDisplaySymbol } from "@clc/core/lib/symbol";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useTokenTags } from "#/hooks/use-deployment";

import { useUpdateVoucherProfile } from "./use-update-voucher-profile";

/** A stored place: the picker's country is never persisted, so it is not read back. */
type VoucherPlace = Pick<LocationInput, "lat" | "lng" | "locationName">;

const profileFormSchema = voucherProfileTextSchema.extend({
  displaySymbol: z.string(),
  iconUrl: z.string(),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      locationName: z.string().trim().min(1).max(200),
    })
    .or(z.undefined()),
  tags: z.array(z.string()),
  termsMode: z.enum(["url", "text"]),
  markerIcon: markerIconSchema.nullable(),
  markerColor: markerColorSchema.nullable(),
});

/**
 * The owner's edit form for a voucher's catalog record: every field the create
 * flow asked for, minus the chain facts a redeploy would be needed to change.
 * Mount it only while the editor is open so each visit reads the current
 * record — TanStack Form takes defaultValues once.
 */
export function useVoucherProfileForm(voucher: MarketVoucherDetail, onClose: () => void) {
  const { t } = useLingui();
  const tagsQuery = useTokenTags();
  const update = useUpdateVoucherProfile(voucher.address);
  const [iconBusy, setIconBusy] = useState(false);
  // A visible legacy ticker is only a baseline. Saving the form must not
  // acquire a claim for it, even if it is shared or no longer valid.
  const [initialSymbol] = useState(() =>
    voucher.displaySymbol === null ? (voucher.legacySymbol ?? "") : voucher.displaySymbol,
  );
  const initialSymbolValue = initialSymbol ?? "";
  const [symbolError, setSymbolError] = useState<string>();
  const storedLocation: VoucherPlace | undefined =
    voucher.locationName !== null && voucher.lat !== null && voucher.lng !== null
      ? { locationName: voucher.locationName, lat: voucher.lat, lng: voucher.lng }
      : undefined;

  const form = useForm({
    defaultValues: {
      displayName: voucher.name,
      displaySymbol: initialSymbolValue,
      description: voucher.description ?? "",
      voucherUoa: voucher.voucherUoa ?? "",
      voucherValue: voucher.voucherValue ?? "",
      iconUrl: voucher.iconUrl ?? "",
      location: storedLocation,
      tags: voucher.tags,
      email: voucher.email ?? "",
      website: voucher.website ?? "",
      phone: voucher.phone ?? "",
      terms: voucher.terms ?? "",
      termsMode: (voucher.terms && !isHttpUrl(voucher.terms) ? "text" : "url") as "url" | "text",
      markerIcon: voucher.markerIcon,
      markerColor: voucher.markerColor,
    },
    validators: { onSubmit: profileFormSchema },
    onSubmit: async ({ value }) => {
      const changesSymbol =
        initialSymbol !== undefined && value.displaySymbol !== initialSymbolValue;
      const displaySymbol = changesSymbol ? parseVoucherDisplaySymbol(value.displaySymbol) : null;
      if (changesSymbol && !displaySymbol) {
        setSymbolError(t`Use 3–6 letters or digits.`);
        return;
      }
      try {
        const clearContactFields = (["email", "website", "phone"] as const).filter(
          (field) => Boolean(voucher[field]?.trim()) && value[field].trim() === "",
        );
        await update.mutateAsync({
          // `name` is the effective label, not proof that an override exists, so
          // it is sent only once the owner has changed it. Entering the immutable
          // contract name clears an existing override instead of storing a
          // redundant copy of that name.
          ...(value.displayName === voucher.name
            ? {}
            : {
                displayName:
                  voucher.contractName && value.displayName === voucher.contractName
                    ? ""
                    : value.displayName,
              }),
          ...(displaySymbol && displaySymbol !== parseVoucherDisplaySymbol(initialSymbolValue)
            ? { displaySymbol }
            : {}),
          description: value.description,
          voucherUoa: value.voucherUoa,
          voucherValue: value.voucherValue === "" ? null : Number(value.voucherValue),
          email: value.email,
          website: value.website,
          phone: value.phone,
          ...(clearContactFields.length > 0 ? { clearContactFields } : {}),
          terms: value.terms,
          // Preserved on omission by clc-core, so sent only when it changed; ""
          // is how the stored logo is removed.
          ...(value.iconUrl === (voucher.iconUrl ?? "") ? {} : { iconUrl: value.iconUrl }),
          // Preserved on omission too, so a save that leaves the pin alone
          // cannot undo a change made elsewhere since this sheet opened.
          ...(value.markerIcon === voucher.markerIcon ? {} : { markerIcon: value.markerIcon }),
          ...(value.markerColor === voucher.markerColor ? {} : { markerColor: value.markerColor }),
          locationName: value.location?.locationName ?? "",
          geoLat: value.location?.lat ?? null,
          geoLng: value.location?.lng ?? null,
          tags: value.tags,
        });
        toast.success(t`Voucher details updated.`);
        onClose();
      } catch (error) {
        if (isVoucherDisplaySymbolConflict(error)) {
          setSymbolError(t`That symbol is already in use.`);
          return;
        }
        toast.error(error instanceof Error ? error.message : t`Couldn't save the voucher details.`);
      }
    },
  });

  return {
    form,
    update,
    tagsQuery,
    iconBusy,
    setIconBusy,
    initialSymbol,
    symbolError,
    setSymbolError,
  };
}
