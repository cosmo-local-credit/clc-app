const API_URL: string =
	(import.meta.env.VITE_API_URL as string | undefined) ??
	"http://192.168.1.20:5003";

async function apiFetch<T>(
	path: string,
	init?: RequestInit,
	token?: string | null,
): Promise<T> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...(init?.headers as Record<string, string>),
	};
	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}
	const res = await fetch(`${API_URL}${path}`, { ...init, headers });
	const body = await res.json();
	if (!body.ok) {
		throw new Error(
			(body as { description?: string }).description ?? "Request failed",
		);
	}
	return body as T;
}

export async function getSiweNonce(): Promise<string> {
	const data = await apiFetch<{ ok: true; result: { nonce: string } }>(
		"/auth/siwe/nonce",
		{ method: "POST", body: JSON.stringify({}) },
	);
	return data.result.nonce;
}

export type SiweVerifyResult = {
	token: string;
	address: string;
	expiresAt: string;
};

export async function verifySiweSignature(
	message: string,
	signature: string,
): Promise<SiweVerifyResult> {
	const data = await apiFetch<{ ok: true; result: SiweVerifyResult }>(
		"/auth/siwe/verify",
		{
			method: "POST",
			body: JSON.stringify({ message, signature }),
		},
	);
	return data.result;
}

export type ProfilePayload = {
	name: string;
	email: string;
	phone: string;
	country: string;
};

export async function submitProfile(
	payload: ProfilePayload,
	token: string,
): Promise<void> {
	await apiFetch(
		"/auth/profile",
		{
			method: "POST",
			body: JSON.stringify(payload),
			credentials: "include",
		},
		token,
	);
}

export type ProfileResult = {
	address: string;
	name: string;
	email: string;
	phone: string;
	country: string;
	createdAt: string;
};

export async function getProfile(token: string): Promise<ProfileResult> {
	const data = await apiFetch<{ ok: true; result: ProfileResult }>(
		"/auth/profile",
		{ method: "GET", credentials: "include" },
		token,
	);
	return data.result;
}
