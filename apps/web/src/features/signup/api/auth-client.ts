import type { ProfileInput } from "@clc/core/features/signup/logic";

import { submitProfile } from "#/features/auth/api/client";
import { getAuthToken } from "#/features/auth/state/token";

export type SignupProfilePayload = ProfileInput & {
	address: `0x${string}`;
};

export async function submitSignupProfile(
	input: SignupProfilePayload,
): Promise<{ ok: true }> {
	const token = getAuthToken();
	if (!token) {
		// No JWT yet — SIWE was not completed. Fall through gracefully so the
		// profile is still marked locally even if backend persistence fails.
		console.warn("[signup] no auth token; profile not persisted to backend");
		return { ok: true } as const;
	}

	await submitProfile(
		{
			name: input.name,
			email: input.email,
			phone: input.phone,
			country: input.country,
		},
		token,
	);

	return { ok: true } as const;
}
