import type { ProfileInput } from "@clc/core/features/signup/logic";

import { submitProfile } from "#/features/auth/api/client";
import { getAuthToken } from "#/features/auth/state/token";

export type SignupProfilePayload = ProfileInput & {
  address: `0x${string}`;
};

export async function submitSignupProfile(input: SignupProfilePayload): Promise<{ ok: true }> {
  const token = getAuthToken();
  if (!token) {
    console.warn("[signup] no auth token; profile not persisted to backend");
    return { ok: true } as const;
  }

  await submitProfile(
    {
      name: input.name,
      email: input.email,
      phone: input.phone,
      location: input.location,
    },
    token,
  );

  return { ok: true } as const;
}
