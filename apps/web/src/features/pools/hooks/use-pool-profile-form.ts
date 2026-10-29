import type { UserPool } from "@clc/api/features/pools/client";
import type { LocationInput } from "@clc/core/features/location/logic";
import { poolProfileTextSchema } from "@clc/core/features/pools/logic";
import { isHttpUrl } from "@clc/core/lib/contact";
import { useForm } from "@clc/core/lib/forms";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useUpdatePoolProfile } from "#/features/pools/hooks/use-update-pool-profile";
import { useTokenTags } from "#/hooks/use-deployment";
import { translateRecipientError } from "#/lib/recipient-error-i18n";

/** A stored place: the picker's country is never persisted, so it is not read back. */
type PoolPlace = Pick<LocationInput, "lat" | "lng" | "locationName">;

const profileFormSchema = poolProfileTextSchema.extend({
  imageUrl: z.string(),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      locationName: z.string().trim().min(1).max(200),
    })
    .or(z.undefined()),
  tags: z.array(z.string()),
  termsMode: z.enum(["url", "text"]),
});

/**
 * The owner's edit form for their pool's catalog record: every field the create
 * flow asked for, minus the chain facts a redeploy would be needed to change.
 * TanStack Form takes `defaultValues` once, so mount it only while editing.
 */
export function usePoolProfileForm({ pool, onClose }: { pool: UserPool; onClose: () => void }) {
  const { t, i18n } = useLingui();
  const tagsQuery = useTokenTags();
  const update = useUpdatePoolProfile(pool.address);
  const [imageBusy, setImageBusy] = useState(false);
  const storedLocation: PoolPlace | undefined =
    pool.locationName !== null && pool.geoLat !== null && pool.geoLng !== null
      ? { locationName: pool.locationName, lat: pool.geoLat, lng: pool.geoLng }
      : undefined;

  const form = useForm({
    defaultValues: {
      displayName: pool.name,
      description: pool.description,
      unitOfAccount: pool.unitOfAccount ?? "",
      imageUrl: pool.imageUrl ?? "",
      location: storedLocation,
      tags: pool.tags,
      email: pool.email ?? "",
      website: pool.website ?? "",
      phone: pool.phone ?? "",
      terms: pool.terms ?? "",
      termsMode: (pool.terms && !isHttpUrl(pool.terms) ? "text" : "url") as "url" | "text",
    },
    validators: { onSubmit: profileFormSchema },
    onSubmit: async ({ value }) => {
      try {
        const clearContactFields = (["email", "website", "phone"] as const).filter(
          (field) => Boolean(pool[field]?.trim()) && value[field].trim() === "",
        );
        await update.mutateAsync({
          // `name` is the effective label, not proof that an override exists, so
          // it is sent only once the owner has changed it. Entering the immutable
          // contract name clears an existing override instead of storing a
          // redundant copy of that name.
          ...(value.displayName === pool.name
            ? {}
            : {
                displayName:
                  pool.contractName && value.displayName === pool.contractName
                    ? ""
                    : value.displayName,
              }),
          description: value.description,
          unitOfAccount: value.unitOfAccount,
          email: value.email,
          website: value.website,
          phone: value.phone,
          ...(clearContactFields.length > 0 ? { clearContactFields } : {}),
          terms: value.terms,
          // Preserved on omission by clc-core, so sent only when it changed; ""
          // is how the stored logo is removed.
          ...(value.imageUrl === (pool.imageUrl ?? "") ? {} : { imageUrl: value.imageUrl }),
          locationName: value.location?.locationName ?? "",
          geoLat: value.location?.lat ?? null,
          geoLng: value.location?.lng ?? null,
          tags: value.tags,
        });
        toast.success(t`Pool details updated.`);
        onClose();
      } catch (error) {
        toast.error(
          translateRecipientError(error, i18n) ??
            (error instanceof Error ? error.message : t`Couldn't save the pool details.`),
        );
      }
    },
  });

  return { form, update, tagsQuery, imageBusy, setImageBusy };
}
