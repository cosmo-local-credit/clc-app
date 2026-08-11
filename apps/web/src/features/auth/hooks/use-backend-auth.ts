import type { ProfileInput } from "@clc/core/features/signup/logic";
import { useMutation } from "@tanstack/react-query";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { signMessage } from "wagmi/actions";

import { wagmiConfig } from "#/providers/web3-config";
import { clcApi } from "#/lib/api";

const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? "42220");

export type BackendSignupInput = {
  profile: ProfileInput;
  privateKey: `0x${string}`;
};

async function signSiweMessage(
  account: ReturnType<typeof privateKeyToAccount>,
  statement: string,
): Promise<{ message: string; signature: `0x${string}` }> {
  const nonce = await clcApi.auth.getSiweNonce();
  const message = createSiweMessage({
    domain: window.location.host,
    address: account.address,
    statement,
    uri: window.location.origin,
    version: "1",
    chainId: CHAIN_ID,
    nonce,
  });
  const signature = await account.signMessage({ message });
  return { message, signature };
}

/**
 * After a 409 (address already registered), establish a session via SIWE
 * sign-in then write the full profile — otherwise phone/country stay stale.
 */
async function ensureSessionAndSubmitProfile(
  account: ReturnType<typeof privateKeyToAccount>,
  profile: ProfileInput,
  email: string,
): Promise<void> {
  const { message, signature } = await signSiweMessage(account, "Sign in to CLC App");
  await clcApi.auth.signinWithSiwe({ message, signature });
  await clcApi.auth.submitProfile({
    name: profile.name,
    email,
    phone: profile.phone,
    country: profile.location.country,
    locationName: profile.location.locationName,
    geoLat: profile.location.lat,
    geoLng: profile.location.lng,
  });
}

export function useBackendSignup() {
  return useMutation({
    mutationFn: async ({ profile, privateKey }: BackendSignupInput) => {
      const account = privateKeyToAccount(privateKey);
      const { message, signature } = await signSiweMessage(account, "Sign up for CLC App");

      const email =
        profile.email.trim() || `pending+${account.address.slice(2).toLowerCase()}@clc.local`;

      const result = await clcApi.auth.signupWithSiwe({
        message,
        signature,
        name: profile.name,
        email,
      });

      // clcApi.auth.signupWithSiwe only persists name + email (and sets the session
      // cookie). The remaining profile fields (phone, country) must be written
      // through the authenticated profile endpoint.
      //
      // On 409/alreadyRegistered the signup call does not issue a session, so
      // we SIWE-sign-in first, then submit the (possibly edited) profile.
      if (result.alreadyRegistered) {
        await ensureSessionAndSubmitProfile(account, profile, email);
      } else {
        await clcApi.auth.submitProfile({
          name: profile.name,
          email,
          phone: profile.phone,
          country: profile.location.country,
          locationName: profile.location.locationName,
          geoLat: profile.location.lat,
          geoLng: profile.location.lng,
        });
      }

      return result;
    },
  });
}

export type BackendPrivateKeySigninInput = {
  privateKey: `0x${string}`;
};

export function useBackendPrivateKeySignin() {
  return useMutation({
    mutationFn: async ({ privateKey }: BackendPrivateKeySigninInput) => {
      const account = privateKeyToAccount(privateKey);
      const { message, signature } = await signSiweMessage(account, "Sign in to CLC App");
      return clcApi.auth.signinWithSiwe({ message, signature });
    },
  });
}

export function useBackendWalletSignin(
  address: `0x${string}` | undefined,
  chainId: number | undefined,
) {
  return useMutation({
    mutationFn: async () => {
      if (!address) throw new Error("Wallet not connected");
      const nonce = await clcApi.auth.getSiweNonce();
      const message = createSiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to CLC App",
        uri: window.location.origin,
        version: "1",
        chainId: chainId ?? CHAIN_ID,
        nonce,
      });
      const signature = await signMessage(wagmiConfig, { message });
      return clcApi.auth.signinWithSiwe({ message, signature });
    },
  });
}
