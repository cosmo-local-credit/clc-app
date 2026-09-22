import type { NameKind } from "@clc/api/features/names/client";
import { nameAvailabilityQueryOptions } from "@clc/api/features/names/queries";
import { normalizeDeployName } from "@clc/core/lib/deploy-name";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { namesClient } from "#/lib/api/names";

/**
 * Field messages for a name the catalog already holds. They are matched by exact
 * string in `translateValidationError`, so changing one means changing it there
 * too.
 */
const TAKEN_MESSAGE: Record<NameKind, string> = {
  voucher: "That voucher name is already taken",
  pool: "That pool name is already taken",
};

/** Shorter than any name the length schema accepts, so it owns those messages. */
const MIN_CHECKABLE_LENGTH = 3;

/**
 * An async form validator that reports a name the catalog already holds.
 *
 * Names are unique, so unlike the symbol generator there is nothing to fall back
 * to and the user has to be told. It returns a message rather than a status so
 * TanStack Form can block the step the same way the length rules do.
 *
 * A lookup that fails resolves to no error. The deploy re-runs the check and
 * answers with 409, so the cost of missing a collision here is one wasted
 * submit; the cost of blocking on a flaky network is a form nobody can finish.
 */
export function useNameAvailabilityValidator(kind: NameKind, exclude?: string) {
  const queryClient = useQueryClient();

  return useCallback(
    async ({ value }: { value: string }): Promise<string | undefined> => {
      const name = normalizeDeployName(value);
      if (name.length < MIN_CHECKABLE_LENGTH) return undefined;
      try {
        const { available } = await queryClient.fetchQuery(
          nameAvailabilityQueryOptions(namesClient, kind, name, exclude),
        );
        return available ? undefined : TAKEN_MESSAGE[kind];
      } catch {
        return undefined;
      }
    },
    [queryClient, kind, exclude],
  );
}
