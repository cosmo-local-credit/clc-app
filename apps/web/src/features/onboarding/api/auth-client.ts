import type { ProfileInput } from "@clc/core/features/signup/logic";

import { submitProfile } from "#/features/auth/api/client";

export type SignupProfilePayload = ProfileInput;

export async function submitSignupProfile(input: SignupProfilePayload): Promise<{ ok: true }> {
  await submitProfile({
    name: input.name,
    email: input.email,
    phone: input.phone,
    location: input.location,
  });

  return { ok: true } as const;
}
