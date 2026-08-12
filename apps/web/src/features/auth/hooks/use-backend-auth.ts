import type { ProfileInput } from "@clc/core/features/signup/logic";
import { useMutation } from "@tanstack/react-query";
import { privateKeyToAccount } from "viem/accounts";
import { signMessage } from "wagmi/actions";

import {
  signInWithSiwe,
  signSiweMessage,
  type SiweRequest,
  type SiweSigner,
} from "@clc/api/features/auth/siwe";
import { wagmiConfig } from "#/providers/web3-config";
import { clcApi } from "#/lib/api";

const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? "42220");

export type BackendSignupInput = {
  profile: ProfileInput;
  privateKey: `0x${string}`;
};

/** The origin the user sees in the signature prompt, plus the intent. */
function siweRequest(statement: string): SiweRequest {
  return {
    domain: window.location.host,
    uri: window.location.origin,
    chainId: CHAIN_ID,
    statement,
  };
}

function privateKeySigner(privateKey: `0x${string}`): SiweSigner & { address: `0x${string}` } {
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address,
    signMessage: (message) => account.signMessage({ message }),
  };
}

export function useBackendSignup() {
  return useMutation({
    mutationFn: async ({ profile, privateKey }: BackendSignupInput) => {
      const signer = privateKeySigner(privateKey);
      const signed = await signSiweMessage(clcApi.auth, signer, siweRequest("Sign up for CLC App"));

      const email =
        profile.email.trim() || `pending+${signer.address.slice(2).toLowerCase()}@clc.local`;

      const result = await clcApi.auth.signupWithSiwe({
        ...signed,
        name: profile.name,
        email,
      });

      // signupWithSiwe only persists name + email (and sets the session cookie).
      // The remaining profile fields must be written through the authenticated
      // profile endpoint.
      //
      // On 409/alreadyRegistered the signup call does not issue a session, so we
      // SIWE-sign-in first — otherwise phone/country stay stale — then submit the
      // (possibly edited) profile.
      if (result.alreadyRegistered) {
        await signInWithSiwe(clcApi.auth, signer, siweRequest("Sign in to CLC App"));
      }

      await clcApi.auth.submitProfile({
        name: profile.name,
        email,
        phone: profile.phone,
        country: profile.location.country,
        locationName: profile.location.locationName,
        geoLat: profile.location.lat,
        geoLng: profile.location.lng,
      });

      return result;
    },
  });
}

export type BackendPrivateKeySigninInput = {
  privateKey: `0x${string}`;
};

export function useBackendPrivateKeySignin() {
  return useMutation({
    mutationFn: ({ privateKey }: BackendPrivateKeySigninInput) =>
      signInWithSiwe(clcApi.auth, privateKeySigner(privateKey), siweRequest("Sign in to CLC App")),
  });
}

export function useBackendWalletSignin(
  address: `0x${string}` | undefined,
  chainId: number | undefined,
) {
  return useMutation({
    mutationFn: async () => {
      if (!address) throw new Error("Wallet not connected");
      return signInWithSiwe(
        clcApi.auth,
        { address, signMessage: (message) => signMessage(wagmiConfig, { message }) },
        { ...siweRequest("Sign in to CLC App"), chainId: chainId ?? CHAIN_ID },
      );
    },
  });
}
