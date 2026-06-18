import type { LocationInput } from "@clc/core/features/location/logic";
import { API_URL } from "#/lib/backend-config";

type ApiOk<T> = {
  ok: true;
  description?: string;
  result: T;
};

type ApiErr = {
  ok: false;
  description?: string;
  code?: string;
};

export class BackendApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly description: string,
    public readonly code?: string,
  ) {
    super(description);
    this.name = "BackendApiError";
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
    headers,
  });

  const text = await res.text();
  let body: ApiOk<T> | ApiErr | T | null = null;
  if (text) {
    try {
      body = JSON.parse(text) as ApiOk<T> | ApiErr | T;
    } catch {
      throw new BackendApiError(res.status, res.statusText || "Non-JSON response from server");
    }
  }

  if (!res.ok) {
    const errBody = body as ApiErr | null;
    throw new BackendApiError(
      res.status,
      errBody?.description ?? (res.statusText || "Request failed"),
      errBody?.code,
    );
  }

  if (body && typeof body === "object" && "ok" in body) {
    const envelope = body as ApiOk<T> | ApiErr;
    if (!envelope.ok) {
      throw new BackendApiError(200, envelope.description ?? "Request failed", envelope.code);
    }
    return envelope.result;
  }

  return body as T;
}

export async function getSiweNonce(): Promise<string> {
  const data = await apiFetch<{ nonce: string }>("/auth/nonce", {
    method: "POST",
    body: JSON.stringify({}),
  });
  return data.nonce;
}

export type SignupSiwePayload = {
  message: string;
  signature: string;
  name: string;
  email: string;
};

export type SignupResult = {
  userId: number | null;
  status: string;
  role: string;
  alreadyRegistered?: boolean;
};

export async function signupWithSiwe(payload: SignupSiwePayload): Promise<SignupResult> {
  try {
    return await apiFetch<SignupResult>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (err) {
    if (err instanceof BackendApiError && err.status === 409) {
      return { userId: null, status: "REGISTERED", role: "USER", alreadyRegistered: true };
    }
    throw err;
  }
}

export type SigninSiwePayload = {
  message: string;
  signature: string;
};

export type SigninResult = {
  userId: number;
  role: string;
};

export async function signinWithSiwe(payload: SigninSiwePayload): Promise<SigninResult> {
  return apiFetch<SigninResult>("/auth/signin", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function logout(): Promise<void> {
  await apiFetch<Record<string, never>>("/auth/logout", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export type ProfilePayload = {
  name: string;
  email: string;
  phone: string;
  location: LocationInput;
};

export async function submitProfile(payload: ProfilePayload): Promise<void> {
  await apiFetch("/auth/profile", {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      country: payload.location.country,
    }),
  });
}

export type ProfileResult = {
  address: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  createdAt: string;
};

export async function getProfile(): Promise<ProfileResult> {
  return apiFetch<ProfileResult>("/auth/profile", { method: "GET" });
}
